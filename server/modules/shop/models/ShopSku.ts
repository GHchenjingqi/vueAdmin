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
  /** 采购成本（与报关申报价值分离；利润报表使用该字段） */
  declare costAmount: number | null
  /** 单件实重（克）；为空表示未维护，运费按分区固定价 */
  declare weightGram: number | null
  /** 包装三边（毫米），体积重计费与货代对账用 */
  declare lengthMm: number | null
  declare widthMm: number | null
  declare heightMm: number | null
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
    costAmount: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: true,
      comment: '采购成本（与报关申报价值分离，用于利润报表）',
    },
    weightGram: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      comment: '单件实重（克），运费按重计费',
    },
    lengthMm: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '包装长（毫米）' },
    widthMm: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '包装宽（毫米）' },
    heightMm: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, comment: '包装高（毫米）' },
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
