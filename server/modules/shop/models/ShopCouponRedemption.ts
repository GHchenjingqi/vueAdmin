import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** 优惠券占用流水（T-07）：同一订单唯一，作为用量原子递增与失败补偿的依据 */
class ShopCouponRedemption extends Model<
  InferAttributes<ShopCouponRedemption>,
  InferCreationAttributes<ShopCouponRedemption>
> {
  declare id: CreationOptional<number>
  declare tenantId: number
  declare couponId: number
  declare couponCode: string
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
    // 历史表列名为 code，模型属性统一用 couponCode 并在 SQL 层映射
    couponCode: { type: DataTypes.STRING(64), allowNull: false, field: 'code' },
    orderNo: { type: DataTypes.STRING(64), allowNull: false },
    discountCents: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
    currency: { type: DataTypes.STRING(3), allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, tableName: 'coupon_redemptions' },
)

export default ShopCouponRedemption
