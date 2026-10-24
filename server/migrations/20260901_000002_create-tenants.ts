import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('tenants', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: '租户名',
    },
    code: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      comment: '租户编码（短标识）',
    },
    status: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1,
      comment: '1=启用 0=禁用 2=冻结',
    },
    planId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      comment: '套餐ID（M2 用）',
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: '到期时间',
    },
    settings: {
      type: DataTypes.JSON,
      allowNull: true,
      comment: '租户级配置（白标等）',
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

  await queryInterface.addIndex('tenants', ['status'])
  await queryInterface.addIndex('tenants', ['code'])
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('tenants')
}
