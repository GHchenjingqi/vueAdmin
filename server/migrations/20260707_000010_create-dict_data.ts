import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('dict_data', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    dictType: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: '所属字典类型编码，如 notice_type、gender',
    },
    label: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: '字典标签，如 通知、男',
    },
    value: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: '字典值，如 notice、1',
    },
    sort: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: '排序，越小越靠前',
    },
    status: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1,
      comment: '状态: 1=启用, 0=禁用',
    },
    remark: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: '备注',
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
  await queryInterface.dropTable('dict_data')
}