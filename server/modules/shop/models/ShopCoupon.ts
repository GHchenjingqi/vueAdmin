import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** 优惠券 */
export type CouponType = 'fixed' | 'percent'

class ShopCoupon extends Model<InferAttributes<ShopCoupon>, InferCreationAttributes<ShopCoupon>> {
  declare id: CreationOptional<number>
  declare code: string
  declare type: CouponType
  declare value: number
  declare minSpend: number
  declare currency: string
  declare validFrom: string
  declare validTo: string
  declare tenantId: number

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopCoupon.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    code: { type: DataTypes.STRING(50), allowNull: false, comment: '券码' },
    type: {
      type: DataTypes.ENUM('fixed', 'percent'),
      allowNull: false,
      comment: '优惠类型：fixed 固定金额 / percent 百分比',
    },
    value: { type: DataTypes.DECIMAL(12, 2), allowNull: false, comment: '优惠值（percent 时为 0-100）' },
    minSpend: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0, comment: '最低消费门槛' },
    currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'USD', comment: '币种' },
    validFrom: { type: DataTypes.DATEONLY, allowNull: false, comment: '生效日期' },
    validTo: { type: DataTypes.DATEONLY, allowNull: false, comment: '失效日期' },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, tableName: 'coupons', underscored: false },
)

export default ShopCoupon
