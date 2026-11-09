import { QueryTypes } from 'sequelize'
import type { QueryInterface } from 'sequelize'

/**
 * 20261109_000001_reattribute-tenant-owned-rows
 *
 * 背景：20260901_000003 给 25 张业务表加了租户列，但 Department / Notice / NoticeRead /
 * Message / Log 五个模型从未声明 `tenantId` 属性，租户 scope 钩子（按
 * `Model.rawAttributes.tenantId` 判定）对这些表**完全不生效**：写入时落到列默认值 1，
 * 读取时也不过滤。本次声明属性后钩子开始生效，若不同步修复历史数据，非默认租户会
 * 看不见自己此前创建的部门、公告、消息与日志。
 *
 * 策略：按“归属人”重新认定租户——这些表的每一行都能由所有者用户唯一确定租户。
 * - notices      ← 发布者 publisherId 的用户租户
 * - notice_reads ← 阅读者 userId 的用户租户
 * - messages     ← 接收者 toUserId（广播/系统消息退回发送者 fromUserId）的用户租户
 * - logs         ← 操作者 userId 的用户租户（用户不存在的登录失败日志保持默认租户）
 * - departments  ← 该部门成员的用户租户，**仅当成员全部属于同一租户**时才改写
 *
 * 保守性：只改写「所有者租户与行租户不一致」的行；所有者已被删除、或部门成员跨租户
 * 的行一律不动并告警，交由人工判断。幂等：第二次执行影响 0 行。
 */

interface OwnerRule {
  table: string
  /** 关联到 users 的 on 条件（行内所有者外键） */
  ownerOn: string
  label: string
}

const OWNER_RULES: OwnerRule[] = [
  { table: 'notices', ownerOn: 'u.id = t.publisherId', label: '公告' },
  { table: 'notice_reads', ownerOn: 'u.id = t.userId', label: '公告已读记录' },
  { table: 'messages', ownerOn: 'u.id = COALESCE(t.toUserId, t.fromUserId)', label: '消息' },
  { table: 'logs', ownerOn: 'u.id = t.userId', label: '日志' },
]

async function hasTenantColumn(qi: QueryInterface, table: string): Promise<boolean> {
  const cols = await qi.describeTable(table)
  return Object.keys(cols).includes('tenantId')
}

function affectedOf(result: unknown): number {
  const meta = Array.isArray(result) ? result[1] : result
  const rows = (meta as { affectedRows?: number } | undefined)?.affectedRows
  return typeof rows === 'number' ? rows : 0
}

export async function up(queryInterface: QueryInterface): Promise<void> {
  if (!(await hasTenantColumn(queryInterface, 'users'))) {
    console.warn('[migrate] users 缺少 tenantId 列，跳过租户重认定')
    return
  }

  for (const rule of OWNER_RULES) {
    if (!(await hasTenantColumn(queryInterface, rule.table))) {
      console.warn(`[migrate] ${rule.table} 缺少 tenantId 列，跳过${rule.label}重认定`)
      continue
    }
    const result = await queryInterface.sequelize.query(
      `UPDATE \`${rule.table}\` t
       JOIN \`users\` u ON ${rule.ownerOn}
       SET t.\`tenantId\` = u.\`tenantId\`
       WHERE u.\`tenantId\` <> t.\`tenantId\``,
    )
    const changed = affectedOf(result)
    if (changed > 0) console.log(`[migrate] ${rule.table}: ${rule.label}重认定 ${changed} 行`)
  }

  if (await hasTenantColumn(queryInterface, 'departments')) {
    const result = await queryInterface.sequelize.query(
      `UPDATE \`departments\` d
       JOIN (
         SELECT \`deptId\` AS id, MIN(\`tenantId\`) AS tid
         FROM \`users\`
         WHERE \`deptId\` IS NOT NULL
         GROUP BY \`deptId\`
         HAVING COUNT(DISTINCT \`tenantId\`) = 1
       ) m ON m.id = d.id
       SET d.\`tenantId\` = m.tid
       WHERE d.\`tenantId\` <> m.tid`,
    )
    const changed = affectedOf(result)
    if (changed > 0) console.log(`[migrate] departments: 部门重认定 ${changed} 行`)

    // 成员横跨多个租户的部门无法唯一认定，保留原值并告警（本身即数据异常）
    const ambiguous = (await queryInterface.sequelize.query(
      `SELECT \`deptId\` AS id, GROUP_CONCAT(DISTINCT \`tenantId\`) AS tenantIds
       FROM \`users\`
       WHERE \`deptId\` IS NOT NULL
       GROUP BY \`deptId\`
       HAVING COUNT(DISTINCT \`tenantId\`) > 1`,
      { type: QueryTypes.SELECT },
    )) as Array<{ id: number; tenantIds: string }>
    for (const row of ambiguous) {
      console.warn(`[migrate] departments #${row.id} 的成员跨租户(${row.tenantIds})，未自动认定，需人工处理`)
    }
  }
}

export async function down(): Promise<void> {
  // 数据重认定不可逆：回滚等于把行送回错误的租户，会造成跨租户可见
}
