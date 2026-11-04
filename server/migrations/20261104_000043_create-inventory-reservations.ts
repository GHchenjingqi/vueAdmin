import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

/** P3-T08：库存预占（TTL + 条件更新并发防护 + 幂等释放，见 ORDER_PAYMENT_STATE_MACHINE §3） */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('inventory_reservations', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    skuId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    warehouseId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    qty: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'active', comment: 'active/committed/released' },
    ref: { type: DataTypes.STRING(64), allowNull: true, comment: '关联单号（订单 orderNo / 报价 quoteId）' },
    expiresAt: { type: DataTypes.DATE, allowNull: false, comment: 'TTL 到期时间' },
    committedAt: { type: DataTypes.DATE, allowNull: true },
    releasedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  })
  await queryInterface.addIndex('inventory_reservations', ['tenantId', 'status', 'expiresAt'], { name: 'idx_res_tenant_status_exp' })
  await queryInterface.addIndex('inventory_reservations', ['ref'], { name: 'idx_res_ref' })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('inventory_reservations')
}
