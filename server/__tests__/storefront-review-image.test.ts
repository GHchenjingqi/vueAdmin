// @vitest-environment node
/**
 * P4-T08 评价图片上传安全
 *
 * 覆盖：非图片被拒、超限被拒、魔数伪装被拒、分辨率过高被拒、
 * 合法图片通过并生成 /uploads/reviews/ URL、删除路径防目录遍历。
 * 复用既有 uploadValidator 的扩展名白名单 + 魔数校验，并叠加分辨率上限。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'fs'
import { resolve, join } from 'path'
import { tmpdir } from 'os'
import { AppError } from '../middleware/errorHandler.js'
import { validateReviewImages } from '../middleware/uploadValidator.js'
import { mapReviewFiles } from '../modules/storefront/controllers/reviewImageController.js'
import { deleteUploadedFile } from '../services/uploadService.js'

const TMP = resolve(tmpdir(), 'review-image-test')
const REVIEW_DIR = resolve(__dirname, '../uploads/reviews')

beforeAll(() => {
  mkdirSync(TMP, { recursive: true })
  mkdirSync(REVIEW_DIR, { recursive: true })
})
afterAll(() => {
  rmSync(TMP, { recursive: true, force: true })
})

/** 最小的 1x1 PNG（魔数合法，尺寸 1×1） */
const PNG_1X1_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
const png1x1 = Buffer.from(PNG_1X1_B64, 'base64')

function writeTmp(name: string, buf: Buffer): string {
  const p = join(TMP, name)
  writeFileSync(p, buf)
  return p
}

describe('P4-T08 评价图片上传安全', () => {
  it('非图片文件（.txt）被拒', () => {
    const path = writeTmp('note.txt', Buffer.from('hello'))
    expect(() => validateReviewImages({ file: { originalname: 'note.txt', size: 5, path } })).toThrow(AppError)
    rmSync(path, { force: true })
  })

  it('超过 5MB 的图片被拒', () => {
    const big = Buffer.alloc(6 * 1024 * 1024, 0)
    const path = writeTmp('big.png', big)
    expect(() => validateReviewImages({ file: { originalname: 'big.png', size: big.length, path } })).toThrow(/大小不能超过/)
    rmSync(path, { force: true })
  })

  it('扩展名伪装（.png 实为文本）被魔数校验拒绝', () => {
    const path = writeTmp('fake.png', Buffer.from('this is not an image at all'))
    expect(() => validateReviewImages({ file: { originalname: 'fake.png', size: 30, path } })).toThrow(/内容与扩展名不匹配/)
    rmSync(path, { force: true })
  })

  it('分辨率过高的图片被拒（IHDR 标称 9999×9999）', () => {
    const buf = Buffer.from(png1x1)
    // 改写 IHDR 的宽/高（偏移 16-23）为 9999
    buf.writeUInt32BE(9999, 16)
    buf.writeUInt32BE(9999, 20)
    const path = writeTmp('huge.png', buf)
    expect(() => validateReviewImages({ file: { originalname: 'huge.png', size: buf.length, path } })).toThrow(/分辨率过高/)
    rmSync(path, { force: true })
  })

  it('合法图片通过校验，并映射为 /uploads/reviews/ URL', () => {
    const path = join(REVIEW_DIR, `ok-${Date.now()}.png`)
    writeFileSync(path, png1x1)
    // 不抛错
    expect(() =>
      validateReviewImages({ file: { originalname: 'ok.png', size: png1x1.length, path } }),
    ).not.toThrow()
    const mapped = mapReviewFiles([{ originalname: 'ok.png', path, size: png1x1.length, mimetype: 'image/png' }])
    expect(mapped).toHaveLength(1)
    expect(mapped[0].url).toMatch(/^\/uploads\/reviews\//)
    expect(mapped[0].id).toMatch(/^reviews\//)
    rmSync(path, { force: true })
  })

  it('删除接口对目录穿越路径返回 403（防遍历）', async () => {
    await expect(deleteUploadedFile('../../etc/passwd')).rejects.toMatchObject({ statusCode: 403 })
  })

  it('多文件批量校验：含一张非图片则整体拒绝', () => {
    const good = writeTmp('good.png', png1x1)
    const bad = writeTmp('bad.txt', Buffer.from('x'))
    expect(() =>
      validateReviewImages({
        files: [
          { originalname: 'good.png', size: png1x1.length, path: good },
          { originalname: 'bad.txt', size: 1, path: bad },
        ],
      }),
    ).toThrow(AppError)
    rmSync(good, { force: true })
    rmSync(bad, { force: true })
  })
})
