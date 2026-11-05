import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** 优惠券核销记录（同订单唯一；币种=订单币种） */
class ShopCouponRedemption extends Model<InferAttributes<ShopCouponRedemption>, InferCreationAttributes<ShopCouponRedemption>> {
  declare id: CreationOptional<number>
  declare tenantId: number
  declare couponId: number
  declare code: string
  declare orderNo: string
  declare discountCents: number
  declare currency: string
  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopCouponRedemption.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    couponId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    code: { type: DataTypes.STRING(64), allowNull: false },
    orderNo: { type: DataTypes.STRING(64), allowNull: false },
    discountCents: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
    currency: { type: DataTypes.STRING(3), allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, tableName: 'coupon_redemptions', underscored: false },
)

export default ShopCouponRedemption
