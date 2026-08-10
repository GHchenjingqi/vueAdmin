import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('workflow_versions', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    workflowId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      comment: '所属流程 ID',
    },
    versionNo: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: '版本号',
    },
    status: {
      type: DataTypes.ENUM('draft', 'published'),
      allowNull: false,
      defaultValue: 'draft',
      comment: '版本状态: draft=草稿, published=已发布',
    },
    publishedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: '发布时间',
    },
    publishedBy: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      comment: '发布人 ID',
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

  await queryInterface.addIndex('workflow_versions', ['workflowId', 'versionNo'], {
    unique: true,
    name: 'uq_workflow_versions_workflow_id_version_no',
  })
  await queryInterface.addIndex('workflow_versions', ['workflowId'], {
    name: 'idx_workflow_versions_workflow_id',
  })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('workflow_versions')
}