import { DataTypes, Model, CreationOptional, InferAttributes, InferCreationAttributes } from 'sequelize'
import sequelize from '../../../config/database.js'

/** 可售单元（SKU，含跨境合规字段） */
export type SkuStatus = 'draft' | 'review' | 'rejected' | 'listed' | 'published' | 'unlisted' | 'archived'

class ShopSku extends Model<InferAttributes<ShopSku>, InferCreationAttributes<ShopSku>> {
  declare id: CreationOptional<number>
  declare spuId: number
  declare code: string
  declare spec: Record<string, string> | null
  declare barcode: string | null
  declare originCountry: string | null
  declare hsCode: string | null
  declare declaredValue: number | null
  declare compliance: Record<string, string> | null
  declare status: CreationOptional<SkuStatus>
  declare tenantId: number

  declare readonly createdAt: CreationOptional<Date>
  declare readonly updatedAt: CreationOptional<Date>
}

ShopSku.init(
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    spuId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      comment: '所属 SPU ID',
    },
    code: {
      type: DataTypes.STRING(64),
      allowNull: false,
      comment: 'SKU 编码（租户内唯一）',
    },
    spec: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: '规格组合 JSON',
    },
    barcode: {
      type: DataTypes.STRING(64),
      allowNull: true,
      comment: '条码（EAN/UPC）',
    },
    originCountry: {
      type: DataTypes.STRING(2),
      allowNull: true,
      comment: '原产国（ISO 3166-1 alpha-2）',
    },
    hsCode: {
      type: DataTypes.STRING(20),
      allowNull: true,
      comment: 'HS 编码（清关必填）',
    },
    declaredValue: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
      comment: '单件申报价值（USD）',
    },
    compliance: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: '合规资质 JSON',
    },
    status: {
      type: DataTypes.ENUM('draft', 'review', 'rejected', 'listed', 'published', 'unlisted', 'archived'),
      allowNull: false,
      defaultValue: 'draft',
      comment: '状态（与 SPU 状态机一致）',
    },
    tenantId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      comment: '租户ID',
    },
    createdAt: { type: DataTypes.DATE, allowNull: false },
    updatedAt: { type: DataTypes.DATE, allowNull: false },
  },
  { sequelize, tableName: 'skus', underscored: false },
)

export default ShopSku
