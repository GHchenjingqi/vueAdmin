import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** 商品类目（树形，多语言名称） */
class ShopCategory extends Model<InferAttributes<ShopCategory>, InferCreationAttributes<ShopCategory>> {
  declare id: CreationOptional<number>
  declare parentId: number
  declare name: Record<string, string>
  /** 语义化 slug（/c/:slug 与类目 TDK）；迁移回填，历史行可能为 null */
  declare slug: string | null
  declare level: number
  declare sort: number
  declare tenantId: number

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopCategory.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    parentId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
      comment: '父类目 ID（0=根）',
    },
    name: {
      type: DataTypes.JSON,
      allowNull: false,
      comment: '类目名称（多语言 JSON）',
    },
    slug: {
      type: DataTypes.STRING(80),
      allowNull: true,
      comment: '类目语义化 slug（用于 /c/:slug 与类目 TDK）',
    },
    level: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      comment: '层级（1 起）',
    },
    sort: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: '排序',
    },
    tenantId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      comment: '租户ID',
    },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, tableName: 'categories', underscored: false },
)

export default ShopCategory
