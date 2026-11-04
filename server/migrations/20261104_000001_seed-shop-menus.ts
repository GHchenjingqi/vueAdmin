import type { QueryInterface } from 'sequelize'
import sequelize from '../config/database.js'
import { logInfo } from '../utils/fileLogger.js'

/**
 * 种入商城后台菜单：
 * - 商城（目录，/shop）
 *   - 商城仪表盘（菜单，/shop-dashboard → views/shop/Dashboard.vue）
 *
 * 幂等：按 path 判断是否已存在，重复执行不会产生重复菜单。
 * 管理员角色可见全部菜单（menuService 对 admin 直接查全表），
 * 其余角色通过菜单管理自行分配，无需在此处理 role_menus。
 */
export async function up(_queryInterface: QueryInterface): Promise<void> {
  try {
    const [tables] = await sequelize.query("SHOW TABLES LIKE 'menus'")
    if ((tables as any[]).length === 0) return

    // 1. 商城目录
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

    // 2. 商城仪表盘
    const [dashRows] = (await sequelize.query("SELECT id FROM menus WHERE path = '/shop-dashboard' LIMIT 1")) as any
    if (dashRows.length === 0) {
      await sequelize.query(
        "INSERT INTO menus (parentId, name, path, component, icon, type, sort, status, hidden, createdAt, updatedAt) VALUES (?, '商城仪表盘', '/shop-dashboard', 'views/shop/Dashboard.vue', 'DataBoard', 'M', 1, 1, 0, NOW(), NOW())",
        { replacements: [shopId] },
      )
      logInfo(`已创建商城仪表盘菜单 (parentId=${shopId})`)
    }
  } catch (err) {
    logInfo(`种入商城菜单失败: ${err instanceof Error ? err.message : String(err)}`)
    throw err
  }
}

export async function down(_queryInterface: QueryInterface): Promise<void> {
  try {
    const [tables] = await sequelize.query("SHOW TABLES LIKE 'menus'")
    if ((tables as any[]).length === 0) return

    const paths = ['/shop-dashboard', '/shop']
    const [rows] = (await sequelize.query(`SELECT id FROM menus WHERE path IN (${paths.map(() => '?').join(',')})`, { replacements: paths })) as any
    if (rows.length === 0) return
    const ids = rows.map((r: any) => r.id) as number[]
    await sequelize.query(`DELETE FROM role_menus WHERE menuId IN (${ids.map(() => '?').join(',')})`, { replacements: ids })
    await sequelize.query(`DELETE FROM menus WHERE id IN (${ids.map(() => '?').join(',')})`, { replacements: ids })
    logInfo(`已回滚商城菜单 (id=${ids.join(',')})`)
  } catch (err) {
    logInfo(`回滚商城菜单失败: ${err instanceof Error ? err.message : String(err)}`)
    throw err
  }
}
