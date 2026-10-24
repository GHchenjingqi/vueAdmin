import type { QueryInterface } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(
    "INSERT IGNORE INTO tenants (id, name, code, status, createdAt, updatedAt) VALUES (1, '默认租户', 'default', 1, NOW(), NOW())",
  )
  await queryInterface.sequelize.query(
    "INSERT IGNORE INTO roles (name, code, sort, status, dataScope, remark, tenantId, createdAt, updatedAt) VALUES ('平台超管', 'platform_admin', 0, 1, 1, '平台级超管角色（跨租户）', 1, NOW(), NOW())",
  )
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query("DELETE FROM tenants WHERE code = 'default'")
  await queryInterface.sequelize.query("DELETE FROM roles WHERE code = 'platform_admin'")
}
