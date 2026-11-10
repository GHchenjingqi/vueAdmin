import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** C 端顾客状态 */
export type CustomerStatus = 'active' | 'blocked'

/** C 端顾客（与后台 admin users 完全隔离，独立 JWT） */
class ShopCustomer extends Model<InferAttributes<ShopCustomer>, InferCreationAttributes<ShopCustomer>> {
  declare id: CreationOptional<number>
  declare tenantId: number
  declare email: string
  declare passwordHash: string
  declare nickname: string | null
  declare status: CreationOptional<CustomerStatus>
  declare referralCode: string | null
  declare membershipTierId: number | null
  declare points: CreationOptional<number>
  declare growthValue: CreationOptional<number>
  declare orderCount: CreationOptional<number>
  declare loginCount: CreationOptional<number>
  declare lastLoginAt: Date | null

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopCustomer.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    tenantId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      comment: '租户ID',
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: '登录邮箱',
    },
    passwordHash: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'bcrypt 哈希',
    },
    nickname: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'active',
      comment: 'active/blocked',
    },
    referralCode: {
      type: DataTypes.STRING(64),
      allowNull: true,
      comment: '推荐码（租户内唯一，创建时自动生成）',
    },
    membershipTierId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      comment: '当前会员等级（membership_tiers.id）',
    },
    points: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: '可用积分',
    },
    growthValue: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: '累计消费金额（元，分级维度一）',
    },
    orderCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: '累计消费次数（分级维度二）',
    },
    loginCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: '累计登录次数（分级维度三）',
    },
    lastLoginAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: '最近登录时间',
    },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'customers',
    indexes: [
      { unique: true, fields: ['tenantId', 'email'], name: 'uq_customers_tenant_email' },
      { unique: true, fields: ['tenantId', 'referralCode'], name: 'uq_customers_tenant_referral_code' },
    ],
  },
)

export default ShopCustomer
