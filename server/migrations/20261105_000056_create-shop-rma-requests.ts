import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

/**
 * 阶段 5 步骤 5（第四切片）：退货/售后 shop_rma_requests
 * 与 shop 模块共用同一套模型层，不建第二套后端。
 * 内容按 tenantId + siteId（storefront 站点 = shops.id）隔离；金额整数「分」。
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('shop_rma_requests', {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    siteId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '站点ID（shops.id），多站点隔离' },
    orderId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '关联订单ID' },
    customerId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '提交顾客ID（登录顾客）' },
    email: { type: DataTypes.STRING(255), allowNull: false, comment: '买家邮箱（与订单邮箱校验归属）' },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
      comment: 'pending/approved/rejected/returned/refunded/cancelled',
    },
    reason: { type: DataTypes.TEXT, allowNull: true, comment: '退货原因' },
    items: { type: DataTypes.JSON, allowNull: true, comment: '退货明细 JSON 数组：[{orderItemId,skuId,qty,title}]' },
    refundAmountCents: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0, comment: '应退金额(分)' },
    refundCurrency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'USD', comment: '应退币种' },
    trackingNo: { type: DataTypes.STRING(64), allowNull: true, comment: '顾客回寄物流单号' },
    rejectReason: { type: DataTypes.STRING(255), allowNull: true, comment: '审核驳回原因（admin 侧填写）' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  })
  await queryInterface.addIndex('shop_rma_requests', ['tenantId', 'customerId'], {
    name: 'idx_rma_tenant_customer',
  })
  await queryInterface.addIndex('shop_rma_requests', ['tenantId', 'orderId'], {
    name: 'idx_rma_tenant_order',
  })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('shop_rma_requests')
}
