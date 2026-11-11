import type { QueryInterface } from 'sequelize'
import sequelize from '../config/database.js'
import { logInfo } from '../utils/fileLogger.js'

/**
 * 种入审计报告剩余 4 个「孤儿后端」对应的后台菜单：
 * - 订单邮件监控 /shop-order-mails → views/shop/order/OrderMailMonitor.vue
 * - 文章管理     /shop-articles     → views/shop/content/ArticleAdmin.vue
 * - 搭配购       /shop-bundles      → views/shop/marketing/BundleList.vue
 * - 渠道商品     /shop-channel-products → views/shop/channel/ChannelProductList.vue
 *
 * 挂在「商城」目录（/shop）下，与退货审核 / 推荐效果同级。幂等：按 path 判重。
 */
const menus = [
  { path: '/shop-order-mails', name: '订单邮件监控', component: 'views/shop/order/OrderMailMonitor.vue', icon: 'Message', sort: 15, hidden: 0 },
  { path: '/shop-articles', name: '文章管理', component: 'views/shop/content/ArticleAdmin.vue', icon: 'Document', sort: 16, hidden: 0 },
  { path: '/shop-bundles', name: '搭配购', component: 'views/shop/marketing/BundleList.vue', icon: 'Goods', sort: 17, hidden: 0 },
  { path: '/shop-channel-products', name: '渠道商品', component: 'views/shop/channel/ChannelProductList.vue', icon: 'Sell', sort: 18, hidden: 0 },
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
    logInfo(`种入商城运营补充菜单失败: ${err instanceof Error ? err.message : String(err)}`)
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
    logInfo(`已回滚商城运营补充菜单 (id=${ids.join(',')})`)
  } catch (err) {
    logInfo(`回滚商城运营补充菜单失败: ${err instanceof Error ? err.message : String(err)}`)
    throw err
  }
}
