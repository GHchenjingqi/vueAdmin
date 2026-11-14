import { Op } from 'sequelize'
import { ShopCategory } from '../models/index.js'

/**
 * 类目 slug 生成（PLAN 2.5）
 *
 * 单独成文件，避免 catalogService（C 端只读）与 categoryService（后台写入）互相 import。
 * 口径与迁移 20261113_000001 一致：NFKD 归一 + 非字母数字转 `-` + 截断 60。
 */

/** 文本 → kebab-case（保留 ASCII 字母数字；纯中文/emoji 会得到空串，由调用方兜底） */
export function toKebabCase(input: string): string {
  return String(input ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/** 多语言 name 取首选显示名：en-US > zh-CN > 首个值 */
export function pickDisplayName(name: unknown): string {
  if (typeof name === 'string') return name
  if (name && typeof name === 'object') {
    const obj = name as Record<string, string>
    return obj['en-US'] ?? obj['zh-CN'] ?? Object.values(obj)[0] ?? ''
  }
  return ''
}

/**
 * 为类目生成租户内唯一的 slug。
 *
 * - 首选 en-US 名称的 kebab；中文名无法转 ASCII 时回退 `category-<id>`；
 * - 冲突时追加 `-2`、`-3`…（与迁移回填口径一致）；
 * - excludeId 用于更新场景，避免把自己判为冲突。
 */
export async function generateUniqueCategorySlug(
  tenantId: number,
  name: unknown,
  id: number | null,
  excludeId?: number,
): Promise<string> {
  const base = toKebabCase(pickDisplayName(name)) || `category-${id ?? Date.now()}`
  let candidate = base
  let n = 1
  // 上限保护：极端情况下不无限循环
  while (n < 1000) {
    const where: Record<string | symbol, unknown> = { tenantId, slug: candidate }
    if (excludeId !== undefined) where.id = { [Op.ne]: excludeId }
    const existed = await ShopCategory.findOne({ where, attributes: ['id'] })
    if (!existed) return candidate
    n += 1
    candidate = `${base}-${n}`
  }
  return `${base}-${Date.now()}`
}
