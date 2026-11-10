import type { QueryInterface } from 'sequelize'
import sequelize from '../config/database.js'
import { logInfo } from '../utils/fileLogger.js'

/** 操作审计日志后台查询菜单（挂在「商城」/shop 下，按 path 幂等） */
const MENU = {
  path: '/shop-audit-log',
  name: '操作审计日志',
  component: 'views/shop/settings/AuditLog.vue',
  icon: 'Document',
  sort: 11,
  hidden: 0,
}

export async function up(_queryInterface: QueryInterface): Promise<void> {
  try {
    const [tables] = await sequelize.query("SHOW TABLES LIKE 'menus'")
    if ((tables as any[]).length === 0) return
    const [shopRows] = (await sequelize.query("SELECT id FROM menus WHERE path = '/shop' LIMIT 1")) as any
    const shopId: number = shopRows.length > 0 ? shopRows[0].id : 0
    if (!shopId) {
      logInfo('审计日志菜单：未找到 /shop 父菜单，跳过')
      return
    }
    const [rows] = (await sequelize.query('SELECT id FROM menus WHERE path = ? LIMIT 1', {
      replacements: [MENU.path],
    })) as any
    if (rows.length > 0) return
    await sequelize.query(
      'INSERT INTO menus (parentId, name, path, component, icon, type, sort, status, hidden, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, NOW(), NOW())',
      {
        replacements: [
          shopId,
          MENU.name,
          MENU.path,
          MENU.component,
          MENU.icon,
          'M',
          MENU.sort,
          MENU.hidden,
        ],
      },
    )
    logInfo(`已创建菜单 ${MENU.name} (${MENU.path})`)
  } catch (err) {
    logInfo(`种入审计日志菜单失败: ${err instanceof Error ? err.message : String(err)}`)
    throw err
  }
}

export async function down(_queryInterface: QueryInterface): Promise<void> {
  try {
    const [tables] = await sequelize.query("SHOW TABLES LIKE 'menus'")
    if ((tables as any[]).length === 0) return
    const [rows] = (await sequelize.query('SELECT id FROM menus WHERE path = ? LIMIT 1', {
      replacements: [MENU.path],
    })) as any
    if (rows.length === 0) return
    await sequelize.query('DELETE FROM role_menus WHERE menuId = ?', { replacements: [rows[0].id] })
    await sequelize.query('DELETE FROM menus WHERE id = ?', { replacements: [rows[0].id] })
  } catch (err) {
    logInfo(`回滚审计日志菜单失败: ${err instanceof Error ? err.message : String(err)}`)
    throw err
  }
}
