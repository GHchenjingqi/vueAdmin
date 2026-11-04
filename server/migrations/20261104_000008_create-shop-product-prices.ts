import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('product_prices', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    skuId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      comment: 'SKU ID',
    },
    currency: {
      type: DataTypes.CHAR(3),
      allowNull: false,
      comment: '币种（ISO 4217，如 USD/CNY/EUR）',
    },
    amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      comment: '价格金额',
    },
    rateSnapshotId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      comment: '定价时使用的汇率快照 ID（历史订单锁价用）',
    },
    tenantId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      comment: '租户ID',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  })

  await queryInterface.addIndex('product_prices', ['tenantId', 'skuId', 'currency'], {
    unique: true,
    name: 'uq_product_prices_tenant_sku_currency',
  })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('product_prices')
}
