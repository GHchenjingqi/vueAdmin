import type { QueryInterface } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(
    "INSERT IGNORE INTO tenants (id, name, code, status, createdAt, updatedAt) VALUES (1, '默认租户', 'default', 1, NOW(), NOW())",
  )
  await queryInterface.sequelize.query(
    "INSERT IGNORE INTO roles (name, code, sort, status, dataScope, remark, tenantId, createdAt, updatedAt) VALUES ('平台超管', 'platform_admin', 0, 1, 1, '平台级超管角色（跨租户）', 1, NOW(), NOW())",
  )

  // 预置超级管理员（username='admin'）同时授予平台超管角色。
  //
  // 安全整改：平台超管判定此前为 `username === 'admin'`——而 users 表的用户名
  // 唯一性是 (tenantId, username) 复合唯一，任意租户创建名为 'admin' 的账号
  // 登录后即被判定为平台超管并绕过全部租户隔离。改为纯角色判定后，
  // 预置管理员需显式持有 platform_admin 角色才能保留其完整管理能力。
  await queryInterface.sequelize.query(`
    INSERT IGNORE INTO user_roles (userId, roleId, createdAt, updatedAt)
    SELECT u.id, r.id, NOW(), NOW()
    FROM users u
    JOIN roles r ON r.code = 'platform_admin'
    WHERE u.username = 'admin'
  `)
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query("DELETE FROM tenants WHERE code = 'default'")
  await queryInterface.sequelize.query("DELETE FROM roles WHERE code = 'platform_admin'")
}
