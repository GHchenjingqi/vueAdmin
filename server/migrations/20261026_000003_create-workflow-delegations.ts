import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'
import { logInfo } from '../utils/fileLogger.js'

/** 创建委托审批表 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('workflow_delegations', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    fromUserId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '委托方' },
    toUserId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '被委托人' },
    startAt: { type: DataTypes.DATE, allowNull: false, comment: '生效开始时间' },
    endAt: { type: DataTypes.DATE, allowNull: true, comment: '生效结束时间' },
    remark: { type: DataTypes.STRING(200), allowNull: true, comment: '委托说明' },
    status: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1, comment: '状态: 1=有效 0=已取消' },
    createdAt: { type: DataTypes.DATE, allowNull: true },
    updatedAt: { type: DataTypes.DATE, allowNull: true },
  })
  await queryInterface.sequelize.query(
    'ALTER TABLE workflow_delegations ADD INDEX idx_from_user (fromUserId), ADD INDEX idx_to_user (toUserId), ADD INDEX idx_status (status)',
  )
  logInfo('委托审批表已创建')
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('workflow_delegations')
}
