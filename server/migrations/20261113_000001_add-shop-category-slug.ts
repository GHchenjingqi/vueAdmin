import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

/**
 * 类目语义化 slug（PLAN 2.5 / audit dim02+dim05）
 *
 * 背景：`shop_categories` 只有多语言 name，没有 slug。BFF 因此用 `c-<id>` 充当 slug，
 * 导致 `pages/c/[slug].vue` 的 CATEGORY_SEO（以 'lace-wigs' 为键）永不命中，
 * 类目页 TDK 全部回退为 humanize(id)，与 docs/SEO_SPEC.md 规定的 `/c/:slug` 冲突。
 *
 * 处理：
 * - 新增 `slug` 列（可为 null，旧行先留空）；
 * - 按 en-US / zh-CN / 首个可用名称生成 kebab-case slug，重复则追加 -2/-3；
 * - 加 (tenantId, slug) 唯一索引，防止后续并发写入产生重复；
 * - down 仅在列存在时回滚，避免重复执行报错。
 *
 * 兼容：旧 `c-<id>` 链接由 BFF 侧 301 到新 slug，不需要在 DB 里存映射。
 */
const TABLE = 'categories'

/** 与 catalogService.makeSlug 同口径：NFKD 归一 + 非字母数字转 - + 截断 */
function toKebab(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/** 从多语言 name（JSON 列或字符串）取首选显示名 */
function pickName(raw: unknown): string {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as Record<string, string>
      return pickName(parsed)
    } catch {
      return raw
    }
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, string>
    return obj['en-US'] ?? obj['zh-CN'] ?? Object.values(obj)[0] ?? ''
  }
  return ''
}

export async function up(queryInterface: QueryInterface): Promise<void> {
  const tables = (await queryInterface.showAllTables()) as string[]
  if (!tables.includes(TABLE)) return

  const desc = (await queryInterface.describeTable(TABLE)) as Record<string, unknown>
  if (!desc.slug) {
    await queryInterface.addColumn(TABLE, 'slug', {
      type: DataTypes.STRING(80),
      allowNull: true,
      comment: '类目语义化 slug（用于 /c/:slug 与类目 TDK）',
    })
  }

  // 回填：按 id 升序处理，保证同名类目为「先建的保留干净 slug」
  const [rows] = (await queryInterface.sequelize.query(`SELECT id, tenantId, name FROM ${TABLE} WHERE slug IS NULL OR slug = '' ORDER BY id ASC`)) as unknown as [
    Array<{ id: number; tenantId: number; name: unknown }>,
    unknown,
  ]

  const used = new Set<string>()
  for (const row of rows) {
    const base = toKebab(pickName(row.name)) || `category-${row.id}`
    // 唯一键按租户维度，但 slug 冲突判断用全表集合更容易读：同租户重复即加后缀
    let candidate = base
    let n = 1
    while (used.has(`${row.tenantId}:${candidate}`)) {
      n += 1
      candidate = `${base}-${n}`
    }
    used.add(`${row.tenantId}:${candidate}`)
    await queryInterface.sequelize.query(`UPDATE ${TABLE} SET slug = ? WHERE id = ?`, { replacements: [candidate, row.id] })
  }

  // 唯一索引：同租户内 slug 不可重复（允许 NULL，历史脏数据不阻塞建索引）
  const indexes = (await queryInterface.showIndex(TABLE)) as Array<{ name: string }>
  if (!indexes.some((i) => i.name === 'uq_categories_tenant_slug')) {
    await queryInterface.addIndex(TABLE, ['tenantId', 'slug'], {
      name: 'uq_categories_tenant_slug',
      unique: true,
    })
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const tables = (await queryInterface.showAllTables()) as string[]
  if (!tables.includes(TABLE)) return
  const desc = (await queryInterface.describeTable(TABLE)) as Record<string, unknown>
  const indexes = (await queryInterface.showIndex(TABLE)) as Array<{ name: string }>
  if (indexes.some((i) => i.name === 'uq_categories_tenant_slug')) {
    await queryInterface.removeIndex(TABLE, 'uq_categories_tenant_slug')
  }
  if (desc.slug) await queryInterface.removeColumn(TABLE, 'slug')
}
