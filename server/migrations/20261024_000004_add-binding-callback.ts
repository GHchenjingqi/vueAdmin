import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

/**
 * 为 workflow_bindings 增加 callbackUrl：实例结束时（通过/驳回）回调业务系统，完成状态同步。
 * 幂等：列已存在则跳过。
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  const [cols] = await queryInterface.sequelize.query("SHOW COLUMNS FROM workflow_bindings LIKE 'callbackUrl'")
  if ((cols as any[]).length > 0) return

  await queryInterface.addColumn('workflow_bindings', 'callbackUrl', {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: '实例结束回调地址（业务状态同步）',
  })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const [cols] = await queryInterface.sequelize.query("SHOW COLUMNS FROM workflow_bindings LIKE 'callbackUrl'")
  if ((cols as any[]).length === 0) return
  await queryInterface.removeColumn('workflow_bindings', 'callbackUrl')
}
