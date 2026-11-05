import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** 到货提醒订阅状态 */
export type RestockStatus = 'waiting' | 'notified' | 'cancelled'

class ShopRestockSubscription extends Model<
  InferAttributes<ShopRestockSubscription>,
  InferCreationAttributes<ShopRestockSubscription>
> {
  declare id: CreationOptional<number>
  declare tenantId: number
  declare email: string
  declare skuId: number
  declare spuId: CreationOptional<number | null>
  declare status: CreationOptional<RestockStatus>
  declare token: string
  declare locale: CreationOptional<string | null>
  declare notifiedAt: CreationOptional<Date | null>
  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopRestockSubscription.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    email: { type: DataTypes.STRING(255), allowNull: false },
    skuId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '关注的 SKU' },
    spuId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '冗余 SPU' },
    status: {
      type: DataTypes.ENUM('waiting', 'notified', 'cancelled'),
      allowNull: false,
      defaultValue: 'waiting',
      comment: 'waiting=等待补货 / notified=已通知 / cancelled=已取消',
    },
    token: { type: DataTypes.STRING(64), allowNull: false, comment: '管理/退订令牌（不可枚举）' },
    locale: { type: DataTypes.STRING(10), allowNull: true, comment: '偏好语言' },
    notifiedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, tableName: 'restock_subscriptions' },
)

export default ShopRestockSubscription
