import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** P5-T07：Referral / Affiliate 佣金结算状态 */
export type ReferralCommissionStatus = 'pending' | 'settled' | 'void'

/** Referral / Affiliate 佣金台账（P5-T07）：pending → settled / void */
class ShopReferralCommission extends Model<InferAttributes<ShopReferralCommission>, InferCreationAttributes<ShopReferralCommission>> {
  declare id: CreationOptional<number>
  declare tenantId: number
  declare orderId: number
  declare referrerCustomerId: number
  declare code: string
  declare orderCurrency: string
  declare orderNetAmountCents: number
  declare commissionRatePercent: number
  declare commissionCents: number
  declare status: CreationOptional<ReferralCommissionStatus>
  declare windowExpiredAt: Date | null

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopReferralCommission.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    orderId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '订单ID' },
    referrerCustomerId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '推荐人顾客ID' },
    code: { type: DataTypes.STRING(64), allowNull: false, comment: '使用的推荐码' },
    orderCurrency: { type: DataTypes.STRING(3), allowNull: false, comment: '订单币种（=结算币种）' },
    orderNetAmountCents: { type: DataTypes.BIGINT, allowNull: false, comment: '佣金基数（订单净额，单位分）' },
    commissionRatePercent: { type: DataTypes.DECIMAL(5, 2), allowNull: false, comment: '佣金比例（%）' },
    commissionCents: { type: DataTypes.BIGINT, allowNull: false, comment: '应结佣金（分）' },
    status: {
      type: DataTypes.ENUM('pending', 'settled', 'void'),
      allowNull: false,
      defaultValue: 'pending',
      comment: 'pending/settled/void',
    },
    windowExpiredAt: { type: DataTypes.DATE, allowNull: true, comment: '归因窗口失效时间' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'referral_commissions',
    indexes: [
      { fields: ['tenantId', 'referrerCustomerId'] },
      { fields: ['tenantId', 'status'] },
      { unique: true, fields: ['tenantId', 'orderId'], name: 'uq_referral_tenant_order' },
    ],
  },
)

export default ShopReferralCommission
