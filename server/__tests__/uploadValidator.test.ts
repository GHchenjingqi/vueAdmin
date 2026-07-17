// @vitest-environment node
/**
 * uploadValidator 中间件单元测试
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  validateUploadFile,
  validateUploadFiles,
  type UploadCategory,
} from '../middleware/uploadValidator.js'

let tmpDir: string
beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'upval-'))
})
afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

function makeFile(
  name: string,
  content: Buffer,
  sizeOverride?: number,
): { originalname: string; size: number; path: string } {
  const p = join(tmpDir, name)
  writeFileSync(p, content)
  return { originalname: name, size: sizeOverride ?? content.length, path: p }
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const GIF = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00, 0x00])
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])
const WEBP = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
])
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'utf8')
const FAKE = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07])
const PDF = Buffer.from('%PDF-1.4 sample content for test', 'utf8')

describe('validateUploadFile - 白名单与分类', () => {
  it('允许常见图片类型', () => {
    expect(() => validateUploadFile(makeFile('a.png', PNG))).not.toThrow()
    expect(() => validateUploadFile(makeFile('b.gif', GIF))).not.toThrow()
    expect(() => validateUploadFile(makeFile('c.jpg', JPG))).not.toThrow()
    expect(() => validateUploadFile(makeFile('d.jpeg', JPG))).not.toThrow()
    expect(() => validateUploadFile(makeFile('e.webp', WEBP))).not.toThrow()
    expect(() => validateUploadFile(makeFile('f.svg', SVG))).not.toThrow()
  })

  it('允许常见文档类型（含 xlsx，前端用户导入使用）', () => {
    expect(() => validateUploadFile(makeFile('g.xlsx', PDF))).not.toThrow()
    expect(() => validateUploadFile(makeFile('h.xls', PDF))).not.toThrow()
    expect(() => validateUploadFile(makeFile('i.pdf', PDF))).not.toThrow()
    expect(() => validateUploadFile(makeFile('j.csv', PDF))).not.toThrow()
  })

  it('拒绝白名单之外的扩展名', () => {
    const err = captureErr(() => validateUploadFile(makeFile('evil.exe', FAKE)))
    expect(err?.statusCode).toBe(400)
    expect(err?.message).toContain('不支持的文件类型')
  })

  it('拒绝无扩展名文件', () => {
    const err = captureErr(() => validateUploadFile(makeFile('noext', PNG)))
    expect(err?.statusCode).toBe(400)
  })
})

describe('validateUploadFile - 分级大小限制', () => {
  it('图片超过 5MB 被拒绝', () => {
    const f = makeFile('big.png', PNG, 10 * 1024 * 1024)
    const err = captureErr(() => validateUploadFile(f))
    expect(err?.statusCode).toBe(400)
    expect(err?.message).toContain('5MB')
  })

  it('文档超过 20MB 被拒绝', () => {
    const f = makeFile('big.xlsx', PDF, 25 * 1024 * 1024)
    const err = captureErr(() => validateUploadFile(f))
    expect(err?.statusCode).toBe(400)
    expect(err?.message).toContain('20MB')
  })

  it('压缩包允许到 100MB', () => {
    const f = makeFile('ok.zip', FAKE, 80 * 1024 * 1024)
    expect(() => validateUploadFile(f)).not.toThrow()
  })
})

describe('validateUploadFile - 图片魔数校验（防扩展名欺骗）', () => {
  it('扩展名为 png 但内容不是图片时被拒绝', () => {
    const err = captureErr(() => validateUploadFile(makeFile('fake.png', FAKE)))
    expect(err?.statusCode).toBe(400)
    expect(err?.message).toContain('内容与扩展名不匹配')
  })

  it('真实图片内容通过', () => {
    expect(() => validateUploadFile(makeFile('real.png', PNG))).not.toThrow()
  })

  it('文档类型不做魔数校验（避免误伤合法文件）', () => {
    expect(() => validateUploadFile(makeFile('doc.xlsx', PDF))).not.toThrow()
  })
})

describe('validateUploadFiles - 收集与孤本清理', () => {
  it('req.file 单个合法文件通过', () => {
    const req = { file: makeFile('single.png', PNG), files: null }
    expect(() => validateUploadFiles(req)).not.toThrow()
  })

  it('req.files 批量合法文件通过', () => {
    const req = {
      file: null,
      files: [makeFile('a.png', PNG), makeFile('b.jpg', JPG)],
    }
    expect(() => validateUploadFiles(req)).not.toThrow()
  })

  it('批量中任一文件非法时，删除已写入的全部临时文件并抛出', () => {
    const good = makeFile('good.png', PNG)
    const bad = makeFile('bad.exe', FAKE)
    const req = { file: null, files: [good, bad] }

    const err = captureErr(() => validateUploadFiles(req))
    expect(err?.statusCode).toBe(400)
    // 孤本清理：合法文件也已被删除，避免磁盘残留
    expect(existsSync(good.path)).toBe(false)
    expect(existsSync(bad.path)).toBe(false)
  })

  it('无文件时直接放行（交给控制器处理缺文件 400）', () => {
    expect(() => validateUploadFiles({ file: null, files: null })).not.toThrow()
  })
})

function captureErr(fn: () => void): { statusCode: number; message: string } | null {
  try {
    fn()
    return null
  } catch (e: any) {
    return { statusCode: e.statusCode ?? 500, message: e.message ?? String(e) }
  }
}

// 避免未使用类型告警
export type _Category = UploadCategory
