import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('settings', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    optionKey: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      comment: '设置键名，如 site_title、site_logo',
    },
    optionValue: {
      type: DataTypes.TEXT('long'),
      allowNull: true,
      comment: '设置值，支持 JSON 格式',
    },
    autoload: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1,
      comment: '是否自动加载: 1=是, 0=否',
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: '设置项说明',
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
  await queryInterface.dropTable('settings')
}