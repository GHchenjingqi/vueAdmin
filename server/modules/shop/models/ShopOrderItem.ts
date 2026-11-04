import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** 订单明细（商品 / 价格 / 规格快照，下单时固化） */
class ShopOrderItem extends Model<InferAttributes<ShopOrderItem>, InferCreationAttributes<ShopOrderItem>> {
  declare id: CreationOptional<number>
  declare orderId: number
  declare skuId: number
  declare qty: number
  declare price: number
  declare tenantId: number

  // —— 阶段 5 步骤 4：下单快照（金额一律「分」）——
  /** 商品标题快照 */
  declare title: string | null
  /** 规格快照 */
  declare spec: Record<string, string> | null
  /** 单价(分) */
  declare unitAmountCents: CreationOptional<number>
  /** 行小计(分) */
  declare lineTotalCents: CreationOptional<number>
  /** 行币种快照 */
  declare currency: string | null

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopOrderItem.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    orderId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '订单 ID' },
    skuId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: 'SKU ID' },
    qty: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '数量' },
    price: { type: DataTypes.DECIMAL(12, 2), allowNull: false, comment: '单价（DECIMAL，仅后台展示）' },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },

    title: { type: DataTypes.STRING(255), allowNull: true, comment: '商品标题快照' },
    spec: { type: DataTypes.JSON, allowNull: true, comment: '规格快照' },
    unitAmountCents: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0, comment: '单价(分)' },
    lineTotalCents: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0, comment: '行小计(分)' },
    currency: { type: DataTypes.STRING(3), allowNull: true, comment: '行币种快照' },

    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, tableName: 'order_items', underscored: false },
)

export default ShopOrderItem
