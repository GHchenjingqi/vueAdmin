import type { QueryInterface } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.bulkInsert('roles', [
    {
      name: '超级管理员',
      code: 'admin',
      sort: 0,
      status: 1,
      dataScope: 1,
      remark: '拥有所有权限',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      name: '普通用户',
      code: 'user',
      sort: 1,
      status: 1,
      dataScope: 2,
      remark: '基础权限',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ])
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query('DELETE FROM roles WHERE code IN (?, ?)', {
    replacements: ['admin', 'user'],
  })
}