import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('workflows', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: '流程名称',
    },
    description: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: '流程描述',
    },
    status: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1,
      comment: '状态: 0=禁用, 1=启用',
    },
    draftVersionId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      comment: '当前草稿版本 ID',
    },
    publishedVersionId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      comment: '当前线上版本 ID',
    },
    createdBy: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      comment: '创建人 ID',
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
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('workflows')
}