import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** 库存预占（TTL + 条件更新并发防护 + 幂等释放） */
class ShopInventoryReservation extends Model<InferAttributes<ShopInventoryReservation>, InferCreationAttributes<ShopInventoryReservation>> {
  declare id: CreationOptional<number>
  declare tenantId: number
  declare skuId: number
  declare warehouseId: number
  declare qty: number
  declare status: CreationOptional<string>
  declare ref: string | null
  declare expiresAt: Date
  declare committedAt: Date | null
  declare releasedAt: Date | null

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopInventoryReservation.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    skuId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    warehouseId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    qty: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'active', comment: 'active/committed/released' },
    ref: { type: DataTypes.STRING(64), allowNull: true, comment: '关联单号（订单 orderNo / 报价 quoteId）' },
    expiresAt: { type: DataTypes.DATE, allowNull: false, comment: 'TTL 到期时间' },
    committedAt: { type: DataTypes.DATE, allowNull: true },
    releasedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    sequelize,
    tableName: 'inventory_reservations',
    indexes: [
      { fields: ['tenantId', 'status', 'expiresAt'], name: 'idx_res_tenant_status_exp' },
      { fields: ['ref'], name: 'idx_res_ref' },
    ],
  },
)

export default ShopInventoryReservation
