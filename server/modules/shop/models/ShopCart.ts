import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** 购物车（游客 token 或登录顾客归属） */
class ShopCart extends Model<InferAttributes<ShopCart>, InferCreationAttributes<ShopCart>> {
  declare id: CreationOptional<number>
  declare tenantId: number
  declare token: string
  declare customerId: number | null
  declare currency: string
  declare locale: string | null
  declare version: CreationOptional<number>
  declare expiresAt: Date | null

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopCart.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    token: { type: DataTypes.STRING(64), allowNull: false, comment: '游客购物车令牌（不可枚举随机串）' },
    customerId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '归属顾客（登录后绑定）' },
    currency: { type: DataTypes.STRING(3), allowNull: false, comment: '创建时币种快照' },
    locale: { type: DataTypes.STRING(10), allowNull: true, comment: '语言快照（en-US/zh-CN），与币种互不推导' },
    version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '行变更版本号' },
    expiresAt: { type: DataTypes.DATE, allowNull: true, comment: '过期时间（sweeper 清理）' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'carts',
    indexes: [
      { unique: true, fields: ['token'], name: 'uq_carts_token' },
      { fields: ['tenantId', 'customerId'], name: 'idx_carts_tenant_customer' },
    ],
  },
)

export default ShopCart
