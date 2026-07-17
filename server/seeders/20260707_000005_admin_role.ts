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
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query('DELETE FROM user_roles WHERE userId = 1')
  await queryInterface.sequelize.query('DELETE FROM role_menus WHERE roleId = 1')
}