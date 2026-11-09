import type { QueryInterface } from 'sequelize'

/**
 * P5-T07 补丁：把模型声明的 (tenantId, orderId) 唯一约束真正落到库里。
 *
 * 背景：000069 已在多数环境执行过，直接修改该文件不会重建索引；
 * 本迁移按「索引是否已存在」逐步补齐，因此：
 * - 全新环境：000069 已建 uq_referral_tenant_order，本迁移直接跳过；
 * - 历史环境：000069 已执行且索引缺失，本迁移补建，保留既有台账数据。
 *
 * 前置：历史重复台账会让 addIndex(unique) 失败。此处不自动删数据，
 * 检测到重复即 fail-closed，要求人工核对后清理再执行（见 docs/reports/p5-fix-readiness.md）。
 */
const TABLE = 'referral_commissions'
const INDEX = 'uq_referral_tenant_order'

export async function up(queryInterface: QueryInterface): Promise<void> {
  const tables = await queryInterface.showAllTables()
  if (!tables.includes(TABLE)) return

  const indexes = (await queryInterface.showIndex(TABLE)) as any[]
  const indexNames = indexes.map((i) => i.name ?? i.Key_name)
  if (indexNames.includes(INDEX)) return

  const [dupes] = await queryInterface.sequelize.query(
    `SELECT tenantId, orderId, COUNT(*) AS n FROM \`${TABLE}\` GROUP BY tenantId, orderId HAVING n > 1 LIMIT 1`,
  )
  if ((dupes as unknown[]).length > 0) {
    throw new Error(`${TABLE} 存在重复的 (tenantId, orderId) 台账，请人工核对清理后重跑 ${INDEX}`)
  }

  await queryInterface.addIndex(TABLE, ['tenantId', 'orderId'], { name: INDEX, unique: true })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const tables = await queryInterface.showAllTables()
  if (!tables.includes(TABLE)) return

  const indexes = (await queryInterface.showIndex(TABLE)) as any[]
  const indexNames = indexes.map((i) => i.name ?? i.Key_name)
  if (indexNames.includes(INDEX)) {
    await queryInterface.removeIndex(TABLE, INDEX)
  }
}
