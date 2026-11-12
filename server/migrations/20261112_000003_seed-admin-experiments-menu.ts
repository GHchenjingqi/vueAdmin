import type { QueryInterface } from 'sequelize'
import sequelize from '../config/database.js'
import { logInfo } from '../utils/fileLogger.js'

/**
 * 种入 A/B 实验管理后台菜单，挂在「系统管理」(/system) 目录下，幂等：按 path 判重。
 * 实验框架由 feature flag `ab_test` 统一控制，管理页仅做查看与一键开关。
 */
const menus = [
  {
    path: '/experiments',
    name: 'sidebar.experiments',
    component: 'views/ExperimentsAdmin.vue',
    icon: 'DataAnalysis',
    sort: 14,
    hidden: 0,
  },
]

export async function up(_queryInterface: QueryInterface): Promise<void> {
  try {
    const [tables] = await sequelize.query("SHOW TABLES LIKE 'menus'")
    if ((tables as any[]).length === 0) return

    const [systemRows] = (await sequelize.query("SELECT id FROM menus WHERE path = '/system' LIMIT 1")) as any
    if (systemRows.length === 0) {
      logInfo('未找到「系统管理」菜单，跳过 A/B 实验菜单种入')
      return
    }
    const systemId = systemRows[0].id

    for (const m of menus) {
      const [rows] = (await sequelize.query('SELECT id FROM menus WHERE path = ? LIMIT 1', { replacements: [m.path] })) as any
      if (rows.length > 0) continue
      await sequelize.query(
        'INSERT INTO menus (parentId, name, path, component, icon, type, sort, status, hidden, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, NOW(), NOW())',
        { replacements: [systemId, m.name, m.path, m.component, m.icon, 'M', m.sort, m.hidden] },
      )
      logInfo(`已创建菜单 ${m.name} (${m.path})`)
    }
  } catch (err) {
    logInfo(`种入 A/B 实验菜单失败: ${err instanceof Error ? err.message : String(err)}`)
    throw err
  }
}

export async function down(_queryInterface: QueryInterface): Promise<void> {
  try {
    const [tables] = await sequelize.query("SHOW TABLES LIKE 'menus'")
    if ((tables as any[]).length === 0) return
    const paths = menus.map((m) => m.path)
    const [rows] = (await sequelize.query(
      `SELECT id FROM menus WHERE path IN (${paths.map(() => '?').join(',')})`,
      { replacements: paths },
    )) as any
    if (rows.length === 0) return
    const ids = rows.map((r: any) => r.id) as number[]
    await sequelize.query(`DELETE FROM role_menus WHERE menuId IN (${ids.map(() => '?').join(',')})`, { replacements: ids })
    await sequelize.query(`DELETE FROM menus WHERE id IN (${ids.map(() => '?').join(',')})`, { replacements: ids })
  } catch (err) {
    logInfo(`回滚 A/B 实验菜单失败: ${err instanceof Error ? err.message : String(err)}`)
    throw err
  }
}
