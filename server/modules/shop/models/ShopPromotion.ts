import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** 营销活动（折扣 / 满减，多语言名称） */
export type PromotionType = 'discount' | 'full_reduce'
export type PromotionScope = 'sku' | 'spu' | 'category' | 'all'

class ShopPromotion extends Model<InferAttributes<ShopPromotion>, InferCreationAttributes<ShopPromotion>> {
  declare id: CreationOptional<number>
  declare name: Record<string, string>
  declare type: PromotionType
  declare scope: PromotionScope
  declare rule: Record<string, unknown>
  declare startAt: string
  declare endAt: string
  declare tenantId: number

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopPromotion.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.JSON, allowNull: false, comment: '活动名称（多语言 JSON）' },
    type: {
      type: DataTypes.ENUM('discount', 'full_reduce'),
      allowNull: false,
      comment: '活动类型：discount 折扣 / full_reduce 满减',
    },
    scope: {
      type: DataTypes.ENUM('sku', 'spu', 'category', 'all'),
      allowNull: false,
      defaultValue: 'all',
      comment: '适用范围的维度',
    },
    rule: { type: DataTypes.JSON, allowNull: false, comment: '规则（JSON，如折扣率/满减阶梯）' },
    startAt: { type: DataTypes.DATEONLY, allowNull: false, comment: '生效日期' },
    endAt: { type: DataTypes.DATEONLY, allowNull: false, comment: '失效日期' },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, tableName: 'promotions', underscored: false },
)

export default ShopPromotion
