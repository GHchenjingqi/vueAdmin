import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** 会员等级（租户内唯一，level 升序；growthThreshold 成长值门槛；discountPct 权益折扣%） */
class ShopMembershipTier extends Model<InferAttributes<ShopMembershipTier>, InferCreationAttributes<ShopMembershipTier>> {
  declare id: CreationOptional<number>
  declare tenantId: number
  declare name: string
  declare level: number
  declare growthThreshold: number
  declare discountPct: number
  declare loginFrequency: CreationOptional<number>
  declare orderCountThreshold: CreationOptional<number>
  declare matchStrategy: CreationOptional<string>

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopMembershipTier.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    name: { type: DataTypes.STRING(64), allowNull: false, comment: '等级名' },
    level: { type: DataTypes.INTEGER, allowNull: false, comment: '等级序号（1 起，升序）' },
    growthThreshold: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '成长值门槛（>=）' },
    discountPct: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '权益折扣%（95=95折）' },
    loginFrequency: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '登录频率门槛（累计登录次数 >=）' },
    orderCountThreshold: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, comment: '消费次数门槛（累计消费次数 >=）' },
    matchStrategy: { type: DataTypes.STRING(8), allowNull: false, defaultValue: 'any', comment: 'any=任一维度达标 / all=全部达标' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'membership_tiers',
    indexes: [
      { unique: true, fields: ['tenantId', 'level'], name: 'uq_tiers_tenant_level' },
      { unique: true, fields: ['tenantId', 'name'], name: 'uq_tiers_tenant_name' },
    ],
  },
)

export default ShopMembershipTier
