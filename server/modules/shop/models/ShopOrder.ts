import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** 订单（履约最小闭环） */
export type OrderStatus = 'created' | 'paid' | 'fulfilled' | 'shipped' | 'done' | 'cancelled'
export type PaymentStatus = 'none' | 'initiated' | 'authorized' | 'captured' | 'failed' | 'refunding' | 'refunded'

class ShopOrder extends Model<InferAttributes<ShopOrder>, InferCreationAttributes<ShopOrder>> {
  declare id: CreationOptional<number>
  declare orderNo: string
  declare channelId: number
  declare shopId: number
  declare buyer: Record<string, unknown>
  declare currency: string
  declare amount: number
  declare status: CreationOptional<OrderStatus>
  declare tenantId: number

  // —— 阶段 5 步骤 4：结算扩展列（快照 + 幂等 + 访问凭证 + 币种快照）——
  declare paymentStatus: CreationOptional<PaymentStatus>
  declare email: string | null
  declare shippingAddress: Record<string, unknown> | null
  declare note: string | null
  /** 商品小计(分) */
  declare subtotalCents: CreationOptional<number>
  /** 优惠(分) */
  declare discountCents: CreationOptional<number>
  /** 运费(分) */
  declare shippingCents: CreationOptional<number>
  /** 税费(分) */
  declare taxCents: CreationOptional<number>
  /** 应付总额(分) = subtotal + shipping + tax - discount */
  declare amountCents: CreationOptional<number>
  declare couponCode: string | null
  declare pointsUsed: CreationOptional<number>
  declare pointsDiscountCents: CreationOptional<number>
  /** 订单访问凭证（防枚举） */
  declare accessToken: string | null
  /** 创建幂等键（租户内唯一） */
  declare idempotencyKey: string | null
  /** 库存预占 ID */
  declare reservationId: number | null
  /** 下单时政策快照 */
  declare policySnapshot: Record<string, unknown> | null
  declare paidAt: Date | null
  declare closedAt: Date | null
  declare cancelledReason: string | null

  // —— 阶段 5 步骤 6：订单来源（site / utm 归因）——
  declare sourceSiteId: number | null
  declare utmSource: string | null
  declare utmMedium: string | null
  declare utmCampaign: string | null
  declare utmTerm: string | null
  declare utmContent: string | null
  declare landingPage: string | null
  declare referrer: string | null
  declare referralCode: string | null
  declare referralTouchAt: Date | null

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopOrder.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    orderNo: { type: DataTypes.STRING(64), allowNull: false, comment: '订单号' },
    channelId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '渠道 ID' },
    shopId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '店铺 ID' },
    buyer: { type: DataTypes.JSON, allowNull: false, comment: '买家信息（JSON）' },
    currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'USD', comment: '结算币种' },
    amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0, comment: '订单金额（DECIMAL，仅后台展示）' },
    status: {
      type: DataTypes.ENUM('created', 'paid', 'fulfilled', 'shipped', 'done', 'cancelled'),
      allowNull: false,
      defaultValue: 'created',
      comment: '订单状态',
    },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },

    // —— 结算扩展列 ——
    paymentStatus: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'none',
      comment: '支付状态: none/initiated/authorized/captured/failed/refunding/refunded',
    },
    email: { type: DataTypes.STRING(255), allowNull: true, comment: '下单邮箱' },
    shippingAddress: { type: DataTypes.JSON, allowNull: true, comment: '收货地址快照' },
    note: { type: DataTypes.STRING(500), allowNull: true },
    subtotalCents: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0, comment: '商品小计(分)' },
    discountCents: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0, comment: '优惠(分)' },
    shippingCents: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0, comment: '运费(分)' },
    taxCents: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0, comment: '税费(分)' },
    amountCents: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0, comment: '应付总额(分)' },
    pointsUsed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '本单消耗积分数' },
    pointsDiscountCents: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '积分抵扣金额（分）' },
    couponCode: { type: DataTypes.STRING(64), allowNull: true },
    accessToken: { type: DataTypes.STRING(64), allowNull: true, comment: '订单访问凭证（防枚举）' },
    idempotencyKey: { type: DataTypes.STRING(64), allowNull: true, comment: '创建幂等键' },
    reservationId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '库存预占ID' },
    policySnapshot: { type: DataTypes.JSON, allowNull: true, comment: '下单时政策快照' },
    paidAt: { type: DataTypes.DATE, allowNull: true },
    closedAt: { type: DataTypes.DATE, allowNull: true },
    cancelledReason: { type: DataTypes.STRING(255), allowNull: true },

    // —— 阶段 5 步骤 6：订单来源（site / utm 归因）——
    sourceSiteId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '来源站点ID' },
    utmSource: { type: DataTypes.STRING(120), allowNull: true, comment: 'UTM source' },
    utmMedium: { type: DataTypes.STRING(120), allowNull: true, comment: 'UTM medium' },
    utmCampaign: { type: DataTypes.STRING(200), allowNull: true, comment: 'UTM campaign' },
    utmTerm: { type: DataTypes.STRING(200), allowNull: true, comment: 'UTM term' },
    utmContent: { type: DataTypes.STRING(200), allowNull: true, comment: 'UTM content' },
    landingPage: { type: DataTypes.STRING(512), allowNull: true, comment: '首次落地页' },
    referrer: { type: DataTypes.STRING(512), allowNull: true, comment: '来源 referrer' },
    referralCode: { type: DataTypes.STRING(64), allowNull: true, comment: '建单快照：使用的推荐码' },
    referralTouchAt: { type: DataTypes.DATE, allowNull: true, comment: '建单快照：推荐首次触点时间' },

    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, tableName: 'orders', underscored: false },
)

export default ShopOrder
