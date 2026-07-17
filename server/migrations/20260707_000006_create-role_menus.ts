import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.createTable('role_menus', {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      primaryKey: true,
      autoIncrement: true,
    },
    roleId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      comment: '角色 ID',
    },
    menuId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      comment: '菜单 ID',
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
  await queryInterface.addIndex('role_menus', ['roleId', 'menuId'], {
    unique: true,
    name: 'role_menus_roleId_menuId_unique',
  })
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.dropTable('role_menus')
}