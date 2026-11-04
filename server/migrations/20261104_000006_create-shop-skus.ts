import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('skus', {
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
      comment: '规格组合 JSON（如 {"颜色":"红","尺寸":"L"}）',
    },
    barcode: {
      type: DataTypes.STRING(64),
      allowNull: true,
      comment: '条码（EAN/UPC）',
    },
    originCountry: {
      type: DataTypes.STRING(2),
      allowNull: true,
      comment: '原产国（ISO 3166-1 alpha-2，如 CN）',
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
      comment: '合规资质 JSON（如 {"ce":"...","fda":"..."}）',
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
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  })

  await queryInterface.addIndex('skus', ['tenantId', 'code'], {
    unique: true,
    name: 'uq_skus_tenant_code',
  })
  await queryInterface.addIndex('skus', ['tenantId', 'spuId'], {
    name: 'idx_skus_tenant_spu',
  })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('skus')
}
