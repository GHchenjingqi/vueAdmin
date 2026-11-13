import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, extname, dirname } from 'node:path'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * 图片转存服务
 *
 * 把外部图片（1688 CDN 等）下载到 server/uploads/products/{slug}/，
 * 返回本地 URL（/uploads/products/{slug}/xxx.jpg）。
 *
 * 设计要点：
 * - 1688 CDN 有防盗链，请求需带 Referer 头。
 * - 按 URL 去重，同一图片 URL 多次出现只存一份。
 * - 文件名：{序号}-{随机hex}{ext}，ext 从 URL 推断，默认 .jpg。
 * - 并发下载（limit=3），单张失败不中断整批，返回 { url, error } 列表。
 */

const UPLOAD_ROOT = resolve(__dirname, '../../../uploads')

/** 下载一张图片，写入目标目录，返回 { localPath, url } 或 null（失败时）。 */
async function downloadOne(
  imageUrl: string,
  destDir: string,
  referer: string,
  filename: string,
): Promise<{ localPath: string; url: string } | null> {
  try {
    const res = await fetch(imageUrl, {
      headers: {
        'Referer': referer,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 1024) return null // 太小，视为无效图
    await mkdir(destDir, { recursive: true })
    const filePath = resolve(destDir, filename)
    await writeFile(filePath, buf)
    const relative = filePath.slice(UPLOAD_ROOT.length).replace(/\\/g, '/')
    return { localPath: filePath, url: '/uploads' + relative }
  } catch {
    return null
  }
}

/** 从 URL 推断扩展名 */
function inferExt(url: string): string {
  const clean = url.split('?')[0]
  const ext = extname(clean).toLowerCase()
  const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp']
  return allowed.includes(ext) ? ext : '.jpg'
}

export interface TransferResult {
  url: string
  /** 失败时给出原因，成功为 null */
  error: string | null
}

/**
 * 批量转存图片。
 * @param urls    远程图片 URL 列表（可含重复，内部去重）
 * @param slug    商品 slug，用作子目录名
 * @param referer 请求 Referer（1688 用 https://detail.1688.com/）
 * @param limit   并发数，默认 3
 */
export async function transferImages(
  urls: string[],
  slug: string,
  referer = 'https://detail.1688.com/',
  limit = 3,
): Promise<TransferResult[]> {
  const destDir = resolve(UPLOAD_ROOT, 'products', slug)
  const seen = new Set<string>()
  const tasks: { url: string; filename: string }[] = []
  let idx = 0

  for (const raw of urls) {
    if (!raw || seen.has(raw)) continue
    seen.add(raw)
    const ext = inferExt(raw)
    const filename = `${String(idx).padStart(3, '0')}-${randomBytes(4).toString('hex')}${ext}`
    tasks.push({ url: raw, filename })
    idx++
  }

  // 结果按原始 URL 顺序输出（保证 cover = 首图），写入槽位而非 push
  const results: TransferResult[] = new Array(tasks.length)
  let cursor = 0

  async function worker() {
    while (cursor < tasks.length) {
      const i = cursor++
      const task = tasks[i]
      const r = await downloadOne(task.url, destDir, referer, task.filename)
      results[i] = r
        ? { url: r.url, error: null }
        : { url: task.url, error: '下载失败' }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, () => worker()))
  return results
}
