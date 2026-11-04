import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('promotions', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.JSON, allowNull: false, comment: '活动名称（多语言 JSON）' },
    type: {
      type: DataTypes.ENUM('discount', 'full_reduce'),
      allowNull: false,
      comment: '活动类型：discount 折扣 / full_reduce 满减',
    },
    scope: {
      type: DataTypes.ENUM('sku', 'spu', 'category', 'all'),
      allowNull: false,
      defaultValue: 'all',
      comment: '适用范围维度',
    },
    rule: { type: DataTypes.JSON, allowNull: false, comment: '规则（JSON）' },
    startAt: { type: DataTypes.DATEONLY, allowNull: false, comment: '生效日期' },
    endAt: { type: DataTypes.DATEONLY, allowNull: false, comment: '失效日期' },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  })
  await queryInterface.addIndex('promotions', ['tenantId', 'type'], { name: 'idx_promo_tenant_type' })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('promotions')
}
