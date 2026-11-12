import type { QueryInterface } from 'sequelize'
import sequelize from '../config/database.js'
import { logInfo } from '../utils/fileLogger.js'

/**
 * 种入「搜索运营看板」后台菜单（admin 运营增强）：
 * - 搜索热词 /shop-search-hot     → views/shop/analytics/SearchHot.vue
 * - 搜索转化漏斗 /shop-search-funnel → views/shop/analytics/SearchFunnel.vue
 *
 * 挂在「商城」目录（/shop）下，与推荐效果看板同级。幂等：按 path 判重；
 * 管理员角色查全表可见，无需在此处理 role_menus。
 */
const menus = [
  { path: '/shop-search-hot', name: '搜索热词', component: 'views/shop/analytics/SearchHot.vue', icon: 'Search', sort: 19, hidden: 0 },
  { path: '/shop-search-funnel', name: '搜索转化漏斗', component: 'views/shop/analytics/SearchFunnel.vue', icon: 'DataLine', sort: 20, hidden: 0 },
]

export async function up(_queryInterface: QueryInterface): Promise<void> {
  try {
    const [tables] = await sequelize.query("SHOW TABLES LIKE 'menus'")
    if ((tables as any[]).length === 0) return

    const [shopRows] = (await sequelize.query("SELECT id FROM menus WHERE path = '/shop' LIMIT 1")) as any
    let shopId: number
    if (shopRows.length === 0) {
      const [result] = (await sequelize.query(
        "INSERT INTO menus (parentId, name, path, icon, type, sort, status, hidden, createdAt, updatedAt) VALUES (0, '商城', '/shop', 'Shop', 'C', 4, 1, 0, NOW(), NOW())",
      )) as any
      shopId = (result as any)?.insertId || 0
      if (!shopId) {
        const [rows] = (await sequelize.query("SELECT id FROM menus WHERE path = '/shop' LIMIT 1")) as any
        shopId = rows[0].id
      }
      logInfo(`已创建商城目录 (id=${shopId})`)
    } else {
      shopId = shopRows[0].id
    }

    for (const m of menus) {
      const [rows] = (await sequelize.query('SELECT id FROM menus WHERE path = ? LIMIT 1', { replacements: [m.path] })) as any
      if (rows.length > 0) continue
      await sequelize.query(
        'INSERT INTO menus (parentId, name, path, component, icon, type, sort, status, hidden, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, NOW(), NOW())',
        { replacements: [shopId, m.name, m.path, m.component, m.icon, 'M', m.sort, m.hidden] },
      )
      logInfo(`已创建菜单 ${m.name} (${m.path})`)
    }
  } catch (err) {
    logInfo(`种入搜索运营看板菜单失败: ${err instanceof Error ? err.message : String(err)}`)
    throw err
  }
}

export async function down(_queryInterface: QueryInterface): Promise<void> {
  try {
    const [tables] = await sequelize.query("SHOW TABLES LIKE 'menus'")
    if ((tables as any[]).length === 0) return

    const paths = menus.map((m) => m.path)
    const [rows] = (await sequelize.query(`SELECT id FROM menus WHERE path IN (${paths.map(() => '?').join(',')})`, { replacements: paths })) as any
    if (rows.length === 0) return
    const ids = rows.map((r: any) => r.id) as number[]
    await sequelize.query(`DELETE FROM role_menus WHERE menuId IN (${ids.map(() => '?').join(',')})`, { replacements: ids })
    await sequelize.query(`DELETE FROM menus WHERE id IN (${ids.map(() => '?').join(',')})`, { replacements: ids })
    logInfo(`已回滚搜索运营看板菜单 (id=${ids.join(',')})`)
  } catch (err) {
    logInfo(`回滚搜索运营看板菜单失败: ${err instanceof Error ? err.message : String(err)}`)
    throw err
  }
}
