import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'
import { logInfo } from '../utils/fileLogger.js'

/** 创建常用驳回理由表（从硬编码改为数据库可维护） */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('workflow_reject_reasons', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    content: { type: DataTypes.STRING(200), allowNull: false, comment: '驳回理由文本' },
    sort: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0, comment: '排序' },
    enabled: { type: DataTypes.TINYINT, allowNull: false, defaultValue: 1, comment: '是否启用: 1/0' },
    createdBy: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '维护人' },
    createdAt: { type: DataTypes.DATE, allowNull: true },
    updatedAt: { type: DataTypes.DATE, allowNull: true },
  })
  await queryInterface.sequelize.query(
    'ALTER TABLE workflow_reject_reasons ADD INDEX idx_enabled (enabled), ADD INDEX idx_sort (sort)',
  )

  // 预置 5 条与前端原硬编码保持一致的常用理由，便于平滑迁移
  await queryInterface.bulkInsert('workflow_reject_reasons', [
    { content: '不符合公司制度', sort: 1, enabled: 1, createdBy: null, createdAt: new Date(), updatedAt: new Date() },
    { content: '信息不完整，请补充材料', sort: 2, enabled: 1, createdBy: null, createdAt: new Date(), updatedAt: new Date() },
    { content: '超出预算额度', sort: 3, enabled: 1, createdBy: null, createdAt: new Date(), updatedAt: new Date() },
    { content: '已通过其他流程，重复申请', sort: 4, enabled: 1, createdBy: null, createdAt: new Date(), updatedAt: new Date() },
    { content: '金额需重新核算', sort: 5, enabled: 1, createdBy: null, createdAt: new Date(), updatedAt: new Date() },
  ])

  logInfo('常用驳回理由表已创建并预置数据')
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('workflow_reject_reasons')
}
