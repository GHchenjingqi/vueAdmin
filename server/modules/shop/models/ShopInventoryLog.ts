import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** 库存流水（入库 / 出库 / 占用 / 释放） */
export type InventoryLogType = 'in' | 'out' | 'lock' | 'unlock'

class ShopInventoryLog extends Model<InferAttributes<ShopInventoryLog>, InferCreationAttributes<ShopInventoryLog>> {
  declare id: CreationOptional<number>
  declare skuId: number
  declare warehouseId: number
  declare delta: number
  declare type: InventoryLogType
  declare ref: string | null
  declare tenantId: number

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopInventoryLog.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    skuId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: 'SKU ID' },
    warehouseId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '仓库 ID' },
    delta: { type: DataTypes.INTEGER, allowNull: false, comment: '变动量（lock/unlock 表示锁定量增减）' },
    type: {
      type: DataTypes.ENUM('in', 'out', 'lock', 'unlock'),
      allowNull: false,
      comment: '流水类型：in 入库 / out 出库 / lock 占用 / unlock 释放',
    },
    ref: { type: DataTypes.STRING(200), allowNull: true, comment: '关联单号（订单/采购单）' },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, tableName: 'inventory_log', underscored: false },
)

export default ShopInventoryLog
