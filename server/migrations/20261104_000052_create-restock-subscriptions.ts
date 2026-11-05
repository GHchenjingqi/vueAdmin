import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

/** 阶段5 步骤5：到货提醒订阅（restock notifications） —— 复用 shop 模型层，不建第二套后端 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('restock_subscriptions', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    email: { type: DataTypes.STRING(255), allowNull: false },
    skuId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '关注的 SKU' },
    spuId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '冗余 SPU，便于列表展示' },
    status: {
      type: DataTypes.ENUM('waiting', 'notified', 'cancelled'),
      allowNull: false,
      defaultValue: 'waiting',
      comment: 'waiting=等待补货 / notified=已通知 / cancelled=已取消',
    },
    token: { type: DataTypes.STRING(64), allowNull: false, comment: '管理/退订令牌（不可枚举）' },
    locale: { type: DataTypes.STRING(10), allowNull: true, comment: '偏好语言' },
    notifiedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  })
  await queryInterface.addIndex('restock_subscriptions', ['tenantId', 'email', 'skuId'], {
    unique: true,
    name: 'uq_restock_tenant_email_sku',
  })
  await queryInterface.addIndex('restock_subscriptions', ['tenantId', 'skuId', 'status'], {
    name: 'idx_restock_sku_status',
  })
  await queryInterface.addIndex('restock_subscriptions', ['token'], { unique: true, name: 'uq_restock_token' })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('restock_subscriptions')
}
