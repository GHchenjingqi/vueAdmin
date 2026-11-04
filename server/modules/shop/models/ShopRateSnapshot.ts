import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** 汇率快照（历史订单利润只能按快照计算，禁止实时汇率回溯） */
class ShopRateSnapshot extends Model<InferAttributes<ShopRateSnapshot>, InferCreationAttributes<ShopRateSnapshot>> {
  declare id: CreationOptional<number>
  declare baseCurrency: string
  declare rates: Record<string, number>
  declare rateDate: string
  declare tenantId: number

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopRateSnapshot.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    baseCurrency: {
      type: DataTypes.CHAR(3),
      allowNull: false,
      defaultValue: 'USD',
      comment: '基准币种',
    },
    rates: {
      type: DataTypes.JSON,
      allowNull: false,
      comment: '汇率 JSON（1 基准币兑 N 目标币）',
    },
    rateDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      comment: '快照日期',
    },
    tenantId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      comment: '租户ID',
    },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, tableName: 'rate_snapshots', underscored: false },
)

export default ShopRateSnapshot
