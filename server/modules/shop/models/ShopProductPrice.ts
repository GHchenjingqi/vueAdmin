import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** 多币种价格（每个 SKU 每个币种一条） */
class ShopProductPrice extends Model<InferAttributes<ShopProductPrice>, InferCreationAttributes<ShopProductPrice>> {
  declare id: CreationOptional<number>
  declare skuId: number
  declare currency: string
  declare amount: number
  declare rateSnapshotId: number | null
  declare tenantId: number

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopProductPrice.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    skuId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      comment: 'SKU ID',
    },
    currency: {
      type: DataTypes.CHAR(3),
      allowNull: false,
      comment: '币种（ISO 4217）',
    },
    amount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      comment: '价格金额',
    },
    rateSnapshotId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      comment: '定价时使用的汇率快照 ID',
    },
    tenantId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      comment: '租户ID',
    },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, tableName: 'product_prices', underscored: false },
)

export default ShopProductPrice
