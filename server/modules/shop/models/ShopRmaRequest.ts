import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** 退货/售后状态机 */
export type RmaStatus =
  | 'pending' // 顾客已提交，待审核
  | 'approved' // 审核通过，顾客可回寄
  | 'rejected' // 审核驳回
  | 'returned' // 顾客已回寄（提供物流单号）
  | 'refunded' // 已退款
  | 'exchange' // 换货：已批准、等待重发（PLAN 4.2，不触发退款）
  | 'cancelled' // 顾客取消

/** 退货明细项（冗余标题以便列表展示，金额以订单快照为准） */
export interface RmaItem {
  orderItemId: number
  skuId: number
  qty: number
  title: string | null
}

/** 退货/售后申请（阶段 5 步骤 5 / 第四切片） */
class ShopRmaRequest extends Model<InferAttributes<ShopRmaRequest>, InferCreationAttributes<ShopRmaRequest>> {
  declare id: CreationOptional<number>
  declare tenantId: number
  declare siteId: number
  declare orderId: number
  declare customerId: number | null
  declare email: string
  declare status: CreationOptional<RmaStatus>
  declare reason: string | null
  declare items: RmaItem[] | null
  declare refundAmountCents: CreationOptional<number>
  declare refundCurrency: CreationOptional<string>
  declare trackingNo: string | null
  declare rejectReason: string | null

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopRmaRequest.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    siteId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '站点ID（shops.id）' },
    orderId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '关联订单ID' },
    customerId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '提交顾客ID' },
    email: { type: DataTypes.STRING(255), allowNull: false, comment: '买家邮箱' },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'pending',
      comment: 'pending/approved/rejected/returned/refunded/exchange/cancelled',
    },
    reason: { type: DataTypes.TEXT, allowNull: true, comment: '退货原因' },
    items: { type: DataTypes.JSON, allowNull: true, comment: '退货明细 JSON 数组' },
    refundAmountCents: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0, comment: '应退金额(分)' },
    refundCurrency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'USD', comment: '应退币种' },
    trackingNo: { type: DataTypes.STRING(64), allowNull: true, comment: '回寄物流单号' },
    rejectReason: { type: DataTypes.STRING(255), allowNull: true, comment: '驳回原因' },

    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, tableName: 'shop_rma_requests', underscored: false },
)

export default ShopRmaRequest
