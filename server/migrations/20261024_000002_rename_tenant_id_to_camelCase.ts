import type { QueryInterface } from 'sequelize'

/**
 * 20261024_000002_rename_tenant_id_to_camelCase
 *
 * 背景：20260901_000003 迁移给 24 张业务表添加的租户列命名为 snake_case `tenant_id`，
 * 与项目全局约定（underscored:false，列名一律 camelCase，如 deptId / parentId / optionKey）
 * 以及 20260910 计费四表（subscriptions/usages/invoices/payments 均为 `tenantId`）不一致，
 * 导致模型中 `tenantId` 属性映射到不存在的列，所有 User 查询报
 * "Unknown column 'tenantId' in 'field list'"（登录即崩）。
 *
 * 本迁移将 `tenant_id` 重命名为 `tenantId`，统一为 camelCase：
 * - 保留原列类型/可空/默认值/注释（从 information_schema 读取后原样 CHANGE）
 * - 幂等：已重命名（tenantId 存在）或不含租户列的表直接跳过
 * - MySQL 的 CHANGE 会自动把索引一并带到新列上（索引名不变，仅列名变更）
 */

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

interface ColumnDef {
  columnType: string
  isNullable: string
  columnDefault: string | null
  extra: string
  comment: string
}

async function getColumnDef(qi: QueryInterface, table: string, column: string): Promise<ColumnDef | null> {
  const [rows] = await qi.sequelize.query(
    `SELECT COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA, COLUMN_COMMENT
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND COLUMN_NAME = :column`,
    { replacements: { table, column } },
  )
  // information_schema 返回大写键（COLUMN_TYPE 等），需显式映射为接口的小驼峰字段
  const row = (rows as Array<Record<string, unknown>>)[0]
  if (!row) return null
  return {
    columnType: String(row.COLUMN_TYPE ?? ''),
    isNullable: String(row.IS_NULLABLE ?? ''),
    columnDefault: row.COLUMN_DEFAULT === null || row.COLUMN_DEFAULT === undefined ? null : String(row.COLUMN_DEFAULT),
    extra: String(row.EXTRA ?? ''),
    comment: String(row.COLUMN_COMMENT ?? ''),
  }
}

/** 由 information_schema 行拼出 MySQL 列定义（用于 CHANGE 保留原定义） */
function buildDefinition(def: ColumnDef): string {
  if (!def.columnType) {
    throw new Error(`无法读取列类型（COLUMN_TYPE 为空）：${JSON.stringify(def)}`)
  }
  const parts: string[] = [def.columnType]
  parts.push(def.isNullable === 'YES' ? 'NULL' : 'NOT NULL')
  if (def.columnDefault !== null && def.columnDefault !== undefined) {
    // COLUMN_DEFAULT 对字符串型可能是带引号的字面量；本列为 BIGINT 数值型，直接拼接安全
    parts.push(`DEFAULT ${def.columnDefault}`)
  }
  if (def.extra && def.extra.toLowerCase().includes('auto_increment')) {
    parts.push('AUTO_INCREMENT')
  }
  if (def.comment) {
    // 注释中的单引号转义，防止 SQL 注入/语法错误
    parts.push(`COMMENT '${def.comment.replace(/'/g, "''")}'`)
  }
  return parts.join(' ')
}

export async function up(queryInterface: QueryInterface): Promise<void> {
  for (const table of tables) {
    const def = await getColumnDef(queryInterface, table, 'tenant_id')
    if (!def) {
      // 表不含 tenant_id：可能已重命名过（幂等）或该表无租户列，跳过
      const renamed = await getColumnDef(queryInterface, table, 'tenantId')
      if (renamed) {
        console.log(`[migrate] ${table}: 已重命名为 tenantId，跳过`)
      }
      continue
    }
    // 极端保护：若两列同时存在（不应发生），不覆盖已有 tenantId
    const both = await getColumnDef(queryInterface, table, 'tenantId')
    if (both) {
      console.warn(`[migrate] ${table}: tenant_id 与 tenantId 同时存在，跳过（需人工处理）`)
      continue
    }
    const definition = buildDefinition(def)
    await queryInterface.sequelize.query(
      `ALTER TABLE \`${table}\` CHANGE \`tenant_id\` \`tenantId\` ${definition}`,
    )
    console.log(`[migrate] ${table}: tenant_id -> tenantId (${definition})`)
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  for (const table of tables) {
    const def = await getColumnDef(queryInterface, table, 'tenantId')
    if (!def) continue
    const both = await getColumnDef(queryInterface, table, 'tenant_id')
    if (both) continue
    const definition = buildDefinition(def)
    await queryInterface.sequelize.query(
      `ALTER TABLE \`${table}\` CHANGE \`tenantId\` \`tenant_id\` ${definition}`,
    )
  }
}
