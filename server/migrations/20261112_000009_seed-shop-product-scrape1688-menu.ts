import type { QueryInterface } from 'sequelize'
import sequelize from '../config/database.js'
import { logInfo } from '../utils/fileLogger.js'

/**
 * 种入「1688 采集」后台菜单（hidden）：
 * - 1688 采集 /shop-product-scrape-1688 → views/shop/product/Scrape1688.vue
 *
 * 与「批量导入 /shop-product-import」同模式：hidden=1，路由可达但不进侧边栏
 * （从商品管理列表页「1688 采集」按钮跳转进入）。
 * 幂等：按 path 判重。
 */
const MENU_PATH = '/shop-product-scrape-1688'
const MENU_NAME = '1688采集'
const MENU_COMPONENT = 'views/shop/product/Scrape1688.vue'

export async function up(_queryInterface: QueryInterface): Promise<void> {
  try {
    const [tables] = await sequelize.query("SHOW TABLES LIKE 'menus'")
    if ((tables as unknown[]).length === 0) return

    const [shopRows] = (await sequelize.query("SELECT id FROM menus WHERE path = '/shop' LIMIT 1")) as any
    if (shopRows.length === 0) {
      logInfo('商城目录不存在，跳过种入 1688 采集菜单')
      return
    }
    const shopId = shopRows[0].id

    const [rows] = (await sequelize.query('SELECT id FROM menus WHERE path = ? LIMIT 1', { replacements: [MENU_PATH] })) as any
    if (rows.length > 0) {
      logInfo(`1688 采集菜单已存在 (id=${rows[0].id})`)
      return
    }
    await sequelize.query(
      'INSERT INTO menus (parentId, name, path, component, icon, type, sort, status, hidden, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, NOW(), NOW())',
      { replacements: [shopId, MENU_NAME, MENU_PATH, MENU_COMPONENT, 'Download', 'M', 8, 1] },
    )
    logInfo(`已创建菜单 ${MENU_NAME} (${MENU_PATH})`)
  } catch (err) {
    logInfo(`种入 1688 采集菜单失败: ${err instanceof Error ? err.message : String(err)}`)
    throw err
  }
}

export async function down(_queryInterface: QueryInterface): Promise<void> {
  try {
    const [tables] = await sequelize.query("SHOW TABLES LIKE 'menus'")
    if ((tables as unknown[]).length === 0) return
    await sequelize.query('DELETE FROM menus WHERE path = ?', { replacements: [MENU_PATH] })
    logInfo(`已回滚 1688 采集菜单 (${MENU_PATH})`)
  } catch (err) {
    logInfo(`回滚 1688 采集菜单失败: ${err instanceof Error ? err.message : String(err)}`)
    throw err
  }
}
