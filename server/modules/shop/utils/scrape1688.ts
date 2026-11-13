/**
 * 1688 采集辅助工具（纯函数，无 IO）
 */

/** slug 生成：标题 → ASCII/中文连字符串，最多 80 字符 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

/** 从标题 + 1688 URL 生成 slug；标题无法生成时用 offerId / 时间戳兜底 */
export function makeSlug(title: string, url: string): string {
  const base = slugify(title)
  if (base && base.length >= 2) return base
  const m = url.match(/offer\/(\d+)/)
  return m ? `c1688-${m[1]}` : `c1688-${Date.now().toString(36)}`
}

/** 从远程图片 URL 推断扩展名，非白名单默认 .jpg */
export function inferImageExt(url: string): string {
  const clean = url.split('?')[0]
  const m = clean.match(/\.(jpe?g|png|webp|gif|bmp)$/i)
  return m ? `.${m[1].toLowerCase()}` : '.jpg'
}

/** 从 1688 商品 URL 提取 offerId（无则 null） */
export function extractOfferId(url: string): string | null {
  const m = url.match(/offer\/(\d+)/)
  return m ? m[1] : null
}
