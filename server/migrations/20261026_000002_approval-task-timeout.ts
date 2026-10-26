import type { QueryInterface } from 'sequelize'
import { logInfo } from '../utils/fileLogger.js'

/** 审批任务增加超时催办 / 升级转交 / 委托追溯字段 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn('approval_tasks', 'remindedAt', {
    type: 'DATE',
    allowNull: true,
    comment: '已催办时间',
  })
  await queryInterface.addColumn('approval_tasks', 'escalated', {
    type: 'TINYINT',
    allowNull: false,
    defaultValue: 0,
    comment: '是否已升级转交: 0=否 1=是',
  })
  await queryInterface.addColumn('approval_tasks', 'delegatedFrom', {
    type: 'INTEGER UNSIGNED',
    allowNull: true,
    comment: '被委托人原始审批人 ID',
  })
  logInfo('审批任务超时字段已添加')
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.removeColumn('approval_tasks', 'remindedAt')
  await queryInterface.removeColumn('approval_tasks', 'escalated')
  await queryInterface.removeColumn('approval_tasks', 'delegatedFrom')
}
