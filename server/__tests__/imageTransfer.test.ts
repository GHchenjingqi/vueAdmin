import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdir, readdir, rm } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { transferImages } from '../modules/shop/services/imageTransferService.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const UPLOAD_ROOT = resolve(__dirname, '../uploads')
const TEST_SLUG = `__test_transfer_${Date.now()}`
const TEST_DIR = resolve(UPLOAD_ROOT, 'products', TEST_SLUG)

/** 构造一个 stub Response */
function makeRes(buf: Buffer, ok = true) {
  return {
    ok,
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  } as unknown as Response
}

/** 2KB 合法图片字节 */
const IMG = Buffer.alloc(2048, 7)

beforeEach(async () => {
  await mkdir(TEST_DIR, { recursive: true })
})

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('transferImages', () => {
  it('成功下载并写入本地，返回 /uploads URL', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeRes(IMG))
    const results = await transferImages(['https://cbu01.alicdn.com/img/a.jpg'], TEST_SLUG)

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://cbu01.alicdn.com/img/a.jpg',
      expect.objectContaining({ headers: expect.objectContaining({ Referer: 'https://detail.1688.com/' }) }),
    )
    expect(results).toHaveLength(1)
    expect(results[0].error).toBeNull()
    expect(results[0].url).toMatch(/^\/uploads\/products\/[^/]+\/\d{3}-[0-9a-f]{8}\.jpg$/)

    const files = await readdir(TEST_DIR)
    expect(files).toHaveLength(1)
    expect(files[0]).toMatch(/\.jpg$/)
  })

  it('同 URL 去重，只下载一份', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeRes(IMG))
    const url = 'https://cbu01.alicdn.com/img/dup.png'
    const results = await transferImages([url, url, url], TEST_SLUG)

    expect(results).toHaveLength(1)
    const files = await readdir(TEST_DIR)
    expect(files).toHaveLength(1)
  })

  it('单张失败不中断整批，失败的保留原 URL 并标 error', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(makeRes(IMG))
      .mockResolvedValueOnce({ ok: false, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response)
      .mockResolvedValueOnce(makeRes(IMG))
    const results = await transferImages(
      [
        'https://x.com/1.jpg',
        'https://x.com/2.jpg',
        'https://x.com/3.jpg',
      ],
      TEST_SLUG,
    )

    expect(results).toHaveLength(3)
    const okCount = results.filter((r) => r.error === null).length
    const failCount = results.filter((r) => r.error !== null).length
    expect(okCount).toBe(2)
    expect(failCount).toBe(1)
    const failed = results.find((r) => r.error !== null)!
    expect(failed.url).toBe('https://x.com/2.jpg')
    expect(fetchSpy).toHaveBeenCalledTimes(3)
  })

  it('字节数 < 1024 视为无效图（下载失败）', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(makeRes(Buffer.alloc(10)))
    const results = await transferImages(['https://x.com/tiny.jpg'], TEST_SLUG)
    expect(results[0].error).toBe('下载失败')
    const files = await readdir(TEST_DIR)
    expect(files).toHaveLength(0)
  })

  it('空 URL 列表返回空结果，不创建文件', async () => {
    const results = await transferImages([], TEST_SLUG)
    expect(results).toHaveLength(0)
  })
})
