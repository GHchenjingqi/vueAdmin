import type { QueryInterface } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.bulkInsert('users', [{
    username: 'admin',
    nickname: '超级管理员',
    email: 'admin@example.com',
    phone: '13800138000',
    password: '$2a$10$6Z3Kz6nQeKvVjHnY7xWfIeGqQeQeQeQeQeQeQeQeQeQeQeQeQeQeQ',
    status: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  }])
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query('DELETE FROM users WHERE username = ?', {
    replacements: ['admin'],
  })
}