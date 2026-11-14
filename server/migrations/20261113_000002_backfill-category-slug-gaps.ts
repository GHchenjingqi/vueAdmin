import type { QueryInterface } from 'sequelize'

/**
 * 回填缺失的类目 slug（PLAN 2.5 收尾）
 *
 * 20261113_000001 只回填了「迁移执行时已存在」的类目；执行后发现库中仍有
 * 32 条空 slug（迁移之后由测试/并行会话创建的类目，以及 createCategory 当时尚未生成 slug）。
 * createCategory 已在同批改造中补齐生成逻辑，本迁移只负责清掉历史空值。
 *
 * 幂等：只处理 slug IS NULL OR slug = '' 的行，重复执行无副作用。
 */
const TABLE = 'categories'

function toKebab(input: string): string {
  return String(input ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

function pickName(raw: unknown): string {
  if (typeof raw === 'string') {
    try {
      return pickName(JSON.parse(raw) as Record<string, string>)
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
  // 列不存在说明 000001 未执行或被回滚，交给它处理
  if (!desc.slug) return

  const [rows] = (await queryInterface.sequelize.query(`SELECT id, tenantId, name FROM ${TABLE} WHERE slug IS NULL OR slug = '' ORDER BY id ASC`)) as unknown as [
    Array<{ id: number; tenantId: number; name: unknown }>,
    unknown,
  ]
  if (rows.length === 0) return

  // 已在库的 slug 全部预读，避免逐行查询与自冲突
  const [existing] = (await queryInterface.sequelize.query(`SELECT tenantId, slug FROM ${TABLE} WHERE slug IS NOT NULL AND slug <> ''`)) as unknown as [
    Array<{ tenantId: number; slug: string }>,
    unknown,
  ]
  const used = new Set(existing.map((r) => `${r.tenantId}:${r.slug}`))

  for (const row of rows) {
    const base = toKebab(pickName(row.name)) || `category-${row.id}`
    let candidate = base
    let n = 1
    while (used.has(`${row.tenantId}:${candidate}`)) {
      n += 1
      candidate = `${base}-${n}`
    }
    used.add(`${row.tenantId}:${candidate}`)
    await queryInterface.sequelize.query(`UPDATE ${TABLE} SET slug = ? WHERE id = ?`, { replacements: [candidate, row.id] })
  }
}

/** 回填属数据修复：down 不主动清空（避免回滚把运营可见的 URL 打回空值） */
export async function down(): Promise<void> {
  /* no-op */
}
