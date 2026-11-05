import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

/**
 * P3-T06 税费计算接入：税率规则表 shop_tax_rates
 *
 * 与 shop 模块共用模型层，不建第二套后端。
 * - country 为空串 '' 表示「默认税率」（isDefault=1 仅允许一条）；
 * - rate 为 0..1 小数（如 0.08 = 8%）；
 * - 解析优先级：目的国具体税率 > 默认税率 > 未配置则阻断报价（fail-closed，不静默按 0）。
 *
 * 种子数据：为租户 1 写入一条默认 0% 税率，作为「未配置时的显式基线」，
 * 避免上线即阻断；真实税率由商户在后台配置（或后续迁移/接口写入）。
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('shop_tax_rates', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    country: { type: DataTypes.STRING(2), allowNull: false, defaultValue: '', comment: 'ISO-3166-1 alpha-2；空串表示默认税率' },
    region: { type: DataTypes.STRING(32), allowNull: true, comment: '可选，州/省细分（预留）' },
    rate: { type: DataTypes.DECIMAL(5, 4), allowNull: false, defaultValue: 0, comment: '0..1 小数税率' },
    isDefault: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, comment: '是否为该租户默认税率' },
    priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '同条件多条时取高优先级' },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, comment: '是否启用' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  })
  await queryInterface.addIndex('shop_tax_rates', ['tenantId', 'country', 'active'], {
    name: 'idx_tax_tenant_country',
  })
  await queryInterface.addIndex('shop_tax_rates', ['tenantId', 'isDefault'], { name: 'idx_tax_tenant_default' })

  const now = new Date()
  await queryInterface.bulkInsert('shop_tax_rates', [
    {
      tenantId: 1,
      country: '',
      region: null,
      rate: 0,
      isDefault: true,
      priority: 0,
      active: true,
      createdAt: now,
      updatedAt: now,
    },
  ])
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('shop_tax_rates')
}
