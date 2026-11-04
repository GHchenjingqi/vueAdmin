import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

/** P3-T01：购物车（游客 token / 顾客归属 / 币种快照） */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('carts', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    token: { type: DataTypes.STRING(64), allowNull: false, comment: '游客购物车令牌（不可枚举随机串）' },
    customerId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '归属顾客（登录后绑定）' },
    currency: { type: DataTypes.STRING(3), allowNull: false, comment: '创建时币种快照' },
    version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '行变更版本号' },
    expiresAt: { type: DataTypes.DATE, allowNull: true, comment: '过期时间（sweeper 清理）' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  })
  await queryInterface.addIndex('carts', ['token'], { unique: true, name: 'uq_carts_token' })
  await queryInterface.addIndex('carts', ['tenantId', 'customerId'], { name: 'idx_carts_tenant_customer' })

  await queryInterface.createTable('cart_items', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    cartId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    skuId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    spuId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    qty: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    unitAmountCents: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0, comment: '加购时单价快照(分)，仅展示用' },
    currency: { type: DataTypes.STRING(3), allowNull: false },
    titleSnapshot: { type: DataTypes.STRING(255), allowNull: true },
    specSnapshot: { type: DataTypes.JSON, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  })
  await queryInterface.addIndex('cart_items', ['tenantId', 'cartId', 'skuId'], { unique: true, name: 'uq_cart_items_cart_sku' })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('cart_items')
  await queryInterface.dropTable('carts')
}
