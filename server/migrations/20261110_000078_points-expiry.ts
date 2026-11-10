import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

/**
 * 积分有效期（FIFO 批次记账）：
 * - points_logs 加列：expiresAt（批次过期时间；正发分批次写入，NULL=永不过期）、
 *   remaining（批次剩余量；正流水为批次记账，负流水为 NULL）
 * - 过期作废：扫 expiresAt < now 且 remaining > 0 的批次 → 余额扣减 + 写 reason=expired_E{id} 负流水 + 批次清零
 * - FIFO 消耗：redeem/负调整/回扣按最老未耗尽批次先扣 remaining（同事务行锁）
 * - 有效期天数：settings.membership.points_expiry_days（0=不过期，后台可配）
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  const tables = (await queryInterface.showAllTables()) as string[]
  if (!tables.includes('points_logs')) return
  const cols = (await queryInterface.describeTable('points_logs')) as Record<string, unknown>
  if (!cols.expiresAt) {
    await queryInterface.addColumn('points_logs', 'expiresAt', {
      type: DataTypes.DATE, allowNull: true, comment: '批次过期时间（发分批次写入；NULL=永不过期）',
    })
  }
  if (!cols.remaining) {
    await queryInterface.addColumn('points_logs', 'remaining', {
      type: DataTypes.INTEGER, allowNull: true, comment: '批次剩余量（发分批次记账；负流水为 NULL）',
    })
  }
  // 存量正流水（未有过期概念）初始化为批次：remaining=change、expiresAt=NULL（不过期）
  await queryInterface.sequelize.query(
    "UPDATE points_logs SET remaining = `change`, expiresAt = NULL WHERE `change` > 0 AND remaining IS NULL",
  )
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const tables = (await queryInterface.showAllTables()) as string[]
  if (!tables.includes('points_logs')) return
  const cols = (await queryInterface.describeTable('points_logs')) as Record<string, unknown>
  if (cols.remaining) await queryInterface.removeColumn('points_logs', 'remaining')
  if (cols.expiresAt) await queryInterface.removeColumn('points_logs', 'expiresAt')
}
