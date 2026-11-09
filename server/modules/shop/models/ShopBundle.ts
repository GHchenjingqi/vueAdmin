import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** Bundle / 搭配购（P5-T05）：组件 SKU 组合 + 服务端报价折扣 + 推荐位 */
export interface BundleComponent {
  skuId: number
  qty: number
}

class ShopBundle extends Model<InferAttributes<ShopBundle>, InferCreationAttributes<ShopBundle>> {
  declare id: CreationOptional<number>
  declare name: Record<string, string>
  declare currency: string
  declare components: BundleComponent[]
  declare discountType: 'fixed' | 'percent'
  declare discountValue: number
  declare active: CreationOptional<boolean>
  declare startAt: string
  declare endAt: string
  declare placement: string | null
  declare tenantId: number

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopBundle.init(
  {
    id: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.JSON, allowNull: false, comment: 'Bundle 名称（多语言 JSON）' },
    currency: { type: DataTypes.STRING(3), allowNull: false, comment: '币种（ISO 4217）' },
    components: { type: DataTypes.JSON, allowNull: false, comment: '组件 SKU 清单 [{ skuId, qty }]' },
    discountType: { type: DataTypes.ENUM('fixed', 'percent'), allowNull: false, comment: '优惠类型' },
    discountValue: { type: DataTypes.DECIMAL(12, 2), allowNull: false, comment: '优惠值' },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, comment: '是否启用' },
    startAt: { type: DataTypes.DATEONLY, allowNull: false, comment: '生效日期' },
    endAt: { type: DataTypes.DATEONLY, allowNull: false, comment: '失效日期' },
    placement: { type: DataTypes.STRING(50), allowNull: true, comment: '推荐位 slot 键' },
    tenantId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, comment: '租户ID' },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, tableName: 'bundles', underscored: false },
)

export default ShopBundle
