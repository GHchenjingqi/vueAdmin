import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** 物流单（含报关单号） */
class ShopOrderShipment extends Model<InferAttributes<ShopOrderShipment>, InferCreationAttributes<ShopOrderShipment>> {
  declare id: CreationOptional<number>
  declare orderId: number
  declare carrier: string
  declare trackingNo: string | null
  declare customsNo: string | null
  declare status: CreationOptional<string>
  declare tenantId: number

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopOrderShipment.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    orderId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '订单 ID' },
    carrier: { type: DataTypes.STRING(100), allowNull: false, comment: '承运商' },
    trackingNo: { type: DataTypes.STRING(100), allowNull: true, comment: '运单号' },
    customsNo: { type: DataTypes.STRING(100), allowNull: true, comment: '报关单号（清关用，由合规卡点自动带出）' },
    status: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'created', comment: '物流状态' },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, tableName: 'order_shipments', underscored: false },
)

export default ShopOrderShipment
