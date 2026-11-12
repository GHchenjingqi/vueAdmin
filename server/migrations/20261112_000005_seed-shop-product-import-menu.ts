import type { QueryInterface } from 'sequelize'
import sequelize from '../config/database.js'
import { logInfo } from '../utils/fileLogger.js'

/**
 * 种入「商品批量导入」后台菜单（hidden）：
 * - 批量导入 /shop-product-import → views/shop/product/SpuImport.vue
 *
 * 与「编辑商品 /shop-product-edit」同模式：hidden=1，路由可达但不进侧边栏
 * （从商品管理列表页「批量导入」按钮跳转进入）。
 * 幂等：按 path 判重。
 */
const MENU_PATH = '/shop-product-import'
const MENU_NAME = '批量导入'
const MENU_COMPONENT = 'views/shop/product/SpuImport.vue'

export async function up(_queryInterface: QueryInterface): Promise<void> {
  try {
    const [tables] = await sequelize.query("SHOW TABLES LIKE 'menus'")
    if ((tables as unknown[]).length === 0) return

    // 挂在商城目录（/shop）下
    const [shopRows] = (await sequelize.query("SELECT id FROM menus WHERE path = '/shop' LIMIT 1")) as any
    let shopId: number
    if (shopRows.length === 0) {
      logInfo('商城目录不存在，跳过种入批量导入菜单')
      return
    }
    shopId = shopRows[0].id

    const [rows] = (await sequelize.query('SELECT id FROM menus WHERE path = ? LIMIT 1', { replacements: [MENU_PATH] })) as any
    if (rows.length > 0) {
      logInfo(`批量导入菜单已存在 (id=${rows[0].id})`)
      return
    }
    await sequelize.query(
      'INSERT INTO menus (parentId, name, path, component, icon, type, sort, status, hidden, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, NOW(), NOW())',
      { replacements: [shopId, MENU_NAME, MENU_PATH, MENU_COMPONENT, 'Upload', 'M', 7, 1] },
    )
    logInfo(`已创建菜单 ${MENU_NAME} (${MENU_PATH})`)
  } catch (err) {
    logInfo(`种入批量导入菜单失败: ${err instanceof Error ? err.message : String(err)}`)
    throw err
  }
}

export async function down(_queryInterface: QueryInterface): Promise<void> {
  try {
    const [tables] = await sequelize.query("SHOW TABLES LIKE 'menus'")
    if ((tables as unknown[]).length === 0) return
    await sequelize.query('DELETE FROM menus WHERE path = ?', { replacements: [MENU_PATH] })
    logInfo(`已回滚批量导入菜单 (${MENU_PATH})`)
  } catch (err) {
    logInfo(`回滚批量导入菜单失败: ${err instanceof Error ? err.message : String(err)}`)
    throw err
  }
}
