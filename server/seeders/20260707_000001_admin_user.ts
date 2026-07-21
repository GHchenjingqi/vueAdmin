import type { QueryInterface } from 'sequelize'
import bcrypt from 'bcryptjs'

/** 默认管理员密码明文：123456（仅开发环境种子数据） */
const DEFAULT_ADMIN_PASSWORD = '123456'

export async function up(queryInterface: QueryInterface): Promise<void> {
  const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10)
  await queryInterface.bulkInsert('users', [{
    username: 'admin',
    nickname: '超级管理员',
    email: 'admin@example.com',
    phone: '13800138000',
    password: passwordHash,
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