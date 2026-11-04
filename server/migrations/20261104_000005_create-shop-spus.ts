import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('spus', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    categoryId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      comment: '类目 ID',
    },
    brandId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      comment: '品牌 ID',
    },
    name: {
      type: DataTypes.JSON,
      allowNull: false,
      comment: '商品标题（多语言 JSON）',
    },
    description: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: '商品详情（多语言 JSON）',
    },
    cover: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: '主图 URL',
    },
    images: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: '图集 URL 列表',
    },
    status: {
      type: DataTypes.ENUM('draft', 'review', 'rejected', 'listed', 'published', 'unlisted', 'archived'),
      allowNull: false,
      defaultValue: 'draft',
      comment: '状态: draft草稿/review待审/rejected驳回/listed已上架/published已发布/unlisted已下架/archived已归档',
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

  await queryInterface.addIndex('spus', ['tenantId', 'status'], {
    name: 'idx_spus_tenant_status',
  })
  await queryInterface.addIndex('spus', ['tenantId', 'categoryId'], {
    name: 'idx_spus_tenant_category',
  })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('spus')
}
