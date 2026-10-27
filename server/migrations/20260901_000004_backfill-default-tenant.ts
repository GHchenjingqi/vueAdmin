import type { QueryInterface } from 'sequelize'

const tables = [
  'users',
  'roles',
  'user_roles',
  'role_menus',
  'departments',
  'dict_types',
  'dict_data',
  'notices',
  'notice_reads',
  'messages',
  'settings',
  'tasks',
  'logs',
  'refresh_tokens',
  'ai_providers',
  'workflows',
  'workflow_versions',
  'workflow_nodes',
  'workflow_edges',
  'workflow_approver_rules',
  'workflow_bindings',
  'workflow_instances',
  'approval_tasks',
  'workflow_instance_logs',
]

export async function up(queryInterface: QueryInterface): Promise<void> {
  // 1. 插入默认租户（id=1 表示默认租户，0 表示全局）
  await queryInterface.sequelize.query(
    "INSERT IGNORE INTO tenants (id, name, code, status, createdAt, updatedAt) VALUES (1, '默认租户', 'default', 1, NOW(), NOW())",
  )

  // 2. 所有业务表回填 tenant_id=1（menus 回填 0 表示全局菜单）
  for (const table of tables) {
    await queryInterface.sequelize.query(`UPDATE \`${table}\` SET tenant_id = 1 WHERE tenant_id IS NULL`)
  }

  // 3. menus 单独回填 tenant_id=0（全局菜单）
  await queryInterface.sequelize.query('UPDATE menus SET tenant_id = 0 WHERE tenant_id IS NULL')

  // 4. 将 tenant_id 列改为 NOT NULL
  for (const table of tables) {
    await queryInterface.sequelize.query(`ALTER TABLE \`${table}\` MODIFY COLUMN tenant_id BIGINT UNSIGNED NOT NULL DEFAULT 1`)
  }
  await queryInterface.sequelize.query('ALTER TABLE menus MODIFY COLUMN tenant_id BIGINT UNSIGNED NOT NULL DEFAULT 0')
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  // 不可逆：仅允许空表时回滚
  // 将 tenant_id 改回可空
  const tables_ = [
    'users',
    'roles',
    'user_roles',
    'role_menus',
    'departments',
    'dict_types',
    'dict_data',
    'notices',
    'notice_reads',
    'messages',
    'settings',
    'tasks',
    'logs',
    'refresh_tokens',
    'ai_providers',
    'workflows',
    'workflow_versions',
    'workflow_nodes',
    'workflow_edges',
    'workflow_approver_rules',
    'workflow_bindings',
    'workflow_instances',
    'approval_tasks',
    'workflow_instance_logs',
  ]
  for (const table of tables_) {
    await queryInterface.sequelize.query(`ALTER TABLE \`${table}\` MODIFY COLUMN tenant_id BIGINT UNSIGNED NULL`)
  }
  await queryInterface.sequelize.query('ALTER TABLE menus MODIFY COLUMN tenant_id BIGINT UNSIGNED NULL')
}
