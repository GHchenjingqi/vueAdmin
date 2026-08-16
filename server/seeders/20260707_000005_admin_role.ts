import type { QueryInterface } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.bulkInsert('user_roles', [{
    userId: 1,
    roleId: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  }])
  await queryInterface.sequelize.query(`
    INSERT INTO role_menus (roleId, menuId, createdAt, updatedAt)
    SELECT 1, id, NOW(), NOW() FROM menus
  `)

  // 普通用户（roleId=2）仅拥有消息管理相关菜单权限
  await queryInterface.sequelize.query(`
    INSERT INTO role_menus (roleId, menuId, createdAt, updatedAt)
    SELECT 2, id, NOW(), NOW() FROM menus
    WHERE name IN ('消息管理', '消息发布', '消息通知')
  `)
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query('DELETE FROM user_roles WHERE userId = 1')
  await queryInterface.sequelize.query('DELETE FROM role_menus WHERE roleId = 1')
  await queryInterface.sequelize.query('DELETE FROM role_menus WHERE roleId = 2')
}