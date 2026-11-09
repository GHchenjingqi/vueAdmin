import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

/**
 * P5-T05：Bundle / 搭配购。
 *
 * - components：组件 SKU 清单 [{ skuId, qty }]，组合购按组件 SKU 扣减库存；
 * - discountType/value：fixed 固定减 / percent 按组件小计百分比；
 * - 报价仍在服务端 createQuote 完成（前端不传 bundle 价）；
 * - placement：推荐位 slot 键（可选），供 /recommendations 返回。
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('bundles', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.JSON, allowNull: false, comment: 'Bundle 名称（多语言 JSON）' },
    currency: { type: DataTypes.STRING(3), allowNull: false, comment: '币种（ISO 4217）' },
    components: {
      type: DataTypes.JSON,
      allowNull: false,
      comment: '组件 SKU 清单 [{ skuId, qty }]',
    },
    discountType: {
      type: DataTypes.ENUM('fixed', 'percent'),
      allowNull: false,
      comment: '优惠类型：fixed 固定减 / percent 百分比',
    },
    discountValue: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      comment: '优惠值（fixed=金额，percent=百分比）',
    },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, comment: '是否启用' },
    startAt: { type: DataTypes.DATEONLY, allowNull: false, comment: '生效日期' },
    endAt: { type: DataTypes.DATEONLY, allowNull: false, comment: '失效日期' },
    placement: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: '推荐位 slot 键（可选）',
    },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  })
  await queryInterface.addIndex('bundles', ['tenantId', 'active'])
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('bundles')
}
