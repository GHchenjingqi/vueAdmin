// @vitest-environment node
/**
 * 上传安全回归测试（存储型 XSS + 路径逃逸）
 *
 * 覆盖本轮实测确认的 2 条缺陷：
 *  1. 上传的 SVG 内联 <script> 会在站点源执行（存储型 XSS）
 *     —— 全局 CSP 的 script-src 含 'unsafe-inline'，express.static 以
 *        image/svg+xml 提供且无 Content-Disposition；
 *  2. 删除上传文件用 startsWith 做目录边界判定（前缀匹配），
 *     `../uploads-backup/x` 可逃逸到 uploads 同级目录。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { assertSvgSafe, validateUploadFile } from '../middleware/uploadValidator.js'
import { deleteUploadedFile } from '../services/uploadService.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const UPLOAD_DIR = resolve(__dirname, '../uploads')

/** 构造带脚本的 SVG（真实攻击载荷） */
const XSS_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><script>alert(document.domain)</script><text x="10" y="50">x</text></svg>`

/** 正常 SVG 图标（不得被误伤） */
const SAFE_SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M12 2L2 7v10l10 5 10-5V7L12 2z"/></svg>`

describe('SVG 上传内容安全', () => {
  it('拒绝含 <script> 的 SVG', () => {
    expect(() => assertSvgSafe(XSS_SVG)).toThrow(/不允许的内容/)
  })

  it('拒绝事件处理器属性（on*=）', () => {
    expect(() => assertSvgSafe('<svg xmlns="http://www.w3.org/2000/svg"><rect onload="alert(1)" width="10" height="10"/></svg>')).toThrow(/不允许的内容/)
  })

  it('拒绝 <foreignObject> 与 javascript: 伪协议', () => {
    expect(() => assertSvgSafe('<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><body/></foreignObject></svg>')).toThrow(/不允许的内容/)
    expect(() => assertSvgSafe('<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)">x</a></svg>')).toThrow(/不允许的内容/)
  })

  it('正常 SVG 图标不得被误伤', () => {
    expect(() => assertSvgSafe(SAFE_SVG)).not.toThrow()
  })

  it('validateUploadFile 对带脚本的 SVG 文件直接拒绝', () => {
    mkdirSync(UPLOAD_DIR, { recursive: true })
    const p = resolve(UPLOAD_DIR, 'probe_reject.svg')
    writeFileSync(p, XSS_SVG, 'utf-8')
    try {
      expect(() => validateUploadFile({ originalname: 'probe.svg', size: XSS_SVG.length, path: p })).toThrow(/不允许的内容/)
    } finally {
      if (existsSync(p)) rmSync(p)
    }
  })

  it('validateUploadFile 对正常 SVG 文件放行', () => {
    mkdirSync(UPLOAD_DIR, { recursive: true })
    const p = resolve(UPLOAD_DIR, 'probe_ok.svg')
    writeFileSync(p, SAFE_SVG, 'utf-8')
    try {
      expect(() => validateUploadFile({ originalname: 'probe.svg', size: SAFE_SVG.length, path: p })).not.toThrow()
    } finally {
      if (existsSync(p)) rmSync(p)
    }
  })
})

describe('删除上传文件的目录边界', () => {
  const siblingDir = resolve(UPLOAD_DIR, '../uploads-probe-sibling')
  const siblingFile = resolve(siblingDir, 'secret.txt')

  beforeAll(() => {
    mkdirSync(siblingDir, { recursive: true })
    writeFileSync(siblingFile, 'secret', 'utf-8')
  })

  afterAll(() => {
    if (existsSync(siblingFile)) rmSync(siblingFile)
    if (existsSync(siblingDir)) rmSync(siblingDir, { recursive: true, force: true })
  })

  it('前缀同级的兄弟目录不得被删除（startsWith 前缀匹配逃逸）', async () => {
    await expect(deleteUploadedFile('../uploads-probe-sibling/secret.txt')).rejects.toThrow(/非法文件路径/)
    expect(existsSync(siblingFile)).toBe(true)
  })

  it('上级目录穿越被拒绝', async () => {
    await expect(deleteUploadedFile('../../package.json')).rejects.toThrow(/非法文件路径/)
  })

  it('绝对路径被拒绝', async () => {
    await expect(deleteUploadedFile('C:/Windows/win.ini')).rejects.toThrow(/非法文件路径/)
  })
})
