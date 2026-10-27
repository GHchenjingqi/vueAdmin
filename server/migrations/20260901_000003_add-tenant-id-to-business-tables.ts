import type { QueryInterface } from 'sequelize'
import { DataTypes } from 'sequelize'

const tables = [
  'users',
  'roles',
  'menus',
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

/** 幂等辅助：列不存在才添加，避免“迁移中途失败后重跑”直接报错 */
async function addColumnIfMissing(
  qi: QueryInterface,
  table: string,
  column: string,
  definition: any,
): Promise<void> {
  const cols = await qi.describeTable(table)
  if (!Object.keys(cols).includes(column)) {
    await qi.addColumn(table, column, definition)
  }
}

async function hasIndexOn(qi: QueryInterface, table: string, columns: string[]): Promise<boolean> {
  const indexes = (await qi.showIndex(table)) as any[]
  return indexes.some(
    (idx) =>
      Array.isArray(idx.fields) &&
      idx.fields.length === columns.length &&
      columns.every((c, i) => idx.fields[i]?.attribute === c),
  )
}

export async function up(queryInterface: QueryInterface): Promise<void> {
  for (const table of tables) {
    await addColumnIfMissing(queryInterface, table, 'tenant_id', {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      comment: '租户ID',
    })
    if (!(await hasIndexOn(queryInterface, table, ['tenant_id']))) {
      await queryInterface.addIndex(table, ['tenant_id'])
    }
  }

  // 用户表：删除全局唯一索引，改为租户内联合唯一
  const existingIndexes = (await queryInterface.showIndex('users')) as any[]
  const usernameUnique = existingIndexes.find(
    (i) => i.fields?.length === 1 && i.fields[0]?.attribute === 'username' && i.unique,
  )
  const emailUnique = existingIndexes.find(
    (i) => i.fields?.length === 1 && i.fields[0]?.attribute === 'email' && i.unique,
  )
  if (usernameUnique) {
    await queryInterface.removeIndex('users', usernameUnique.name)
  }
  if (emailUnique) {
    await queryInterface.removeIndex('users', emailUnique.name)
  }
  if (!(await hasIndexOn(queryInterface, 'users', ['tenant_id', 'username']))) {
    await queryInterface.addIndex('users', ['tenant_id', 'username'], { unique: true })
  }
  if (!(await hasIndexOn(queryInterface, 'users', ['tenant_id', 'email']))) {
    await queryInterface.addIndex('users', ['tenant_id', 'email'], { unique: true })
  }

  // 高频列表表加联合索引
  // 注意：users 表部门列实际名为 deptId（模型 underscored:false），原脚本误写为 dept_id 会导致迁移失败
  if (!(await hasIndexOn(queryInterface, 'users', ['tenant_id', 'deptId']))) {
    await queryInterface.addIndex('users', ['tenant_id', 'deptId'])
  }
  if (!(await hasIndexOn(queryInterface, 'users', ['tenant_id', 'status']))) {
    await queryInterface.addIndex('users', ['tenant_id', 'status'])
  }
  if (!(await hasIndexOn(queryInterface, 'roles', ['tenant_id', 'status']))) {
    await queryInterface.addIndex('roles', ['tenant_id', 'status'])
  }
  if (!(await hasIndexOn(queryInterface, 'menus', ['tenant_id', 'status']))) {
    await queryInterface.addIndex('menus', ['tenant_id', 'status'])
  }
  if (!(await hasIndexOn(queryInterface, 'departments', ['tenant_id', 'status']))) {
    await queryInterface.addIndex('departments', ['tenant_id', 'status'])
  }
  if (!(await hasIndexOn(queryInterface, 'notices', ['tenant_id', 'status']))) {
    await queryInterface.addIndex('notices', ['tenant_id', 'status'])
  }
  if (!(await hasIndexOn(queryInterface, 'dict_types', ['tenant_id', 'status']))) {
    await queryInterface.addIndex('dict_types', ['tenant_id', 'status'])
  }
  if (!(await hasIndexOn(queryInterface, 'dict_data', ['tenant_id', 'status']))) {
    await queryInterface.addIndex('dict_data', ['tenant_id', 'status'])
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  for (const table of tables) {
    try {
      await queryInterface.removeIndex(table, `${table}_tenant_id`)
    } catch {
      // ignore
    }
    const cols = await queryInterface.describeTable(table).catch(() => ({}))
    if (Object.keys(cols).includes('tenant_id')) {
      await queryInterface.removeColumn(table, 'tenant_id')
    }
  }

  // 恢复用户表全局唯一索引
  try {
    await queryInterface.removeIndex('users', 'users_tenant_id_username')
  } catch {
    /* ignore */
  }
  try {
    await queryInterface.removeIndex('users', 'users_tenant_id_email')
  } catch {
    /* ignore */
  }
  try {
    await queryInterface.addIndex('users', ['username'], { unique: true })
  } catch {
    /* ignore */
  }
  try {
    await queryInterface.addIndex('users', ['email'], { unique: true })
  } catch {
    /* ignore */
  }

  const compoundIndexes = [
    'users_tenant_id_deptId',
    'users_tenant_id_status',
    'roles_tenant_id_status',
    'menus_tenant_id_status',
    'departments_tenant_id_status',
    'notices_tenant_id_status',
    'dict_types_tenant_id_status',
    'dict_data_tenant_id_status',
  ]
  for (const idx of compoundIndexes) {
    try {
      await queryInterface.removeIndex('users', idx)
    } catch {
      // ignore non-existent index errors
    }
  }
}
