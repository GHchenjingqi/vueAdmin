import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('attributes', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    categoryId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      comment: '关联类目 ID（空=通用属性）',
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: '属性名（如 颜色/尺寸）',
    },
    type: {
      type: DataTypes.ENUM('text', 'select'),
      allowNull: false,
      defaultValue: 'text',
      comment: '类型: text=文本, select=单选',
    },
    options: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: '可选值列表（type=select 时）',
    },
    required: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 0,
      comment: '是否必填: 1=是, 0=否',
    },
    sort: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: '排序',
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

  await queryInterface.addIndex('attributes', ['tenantId', 'categoryId'], {
    name: 'idx_attributes_tenant_category',
  })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('attributes')
}
