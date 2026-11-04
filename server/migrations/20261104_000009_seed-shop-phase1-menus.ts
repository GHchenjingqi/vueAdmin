import type { QueryInterface } from 'sequelize'
import sequelize from '../config/database.js'
import { logInfo } from '../utils/fileLogger.js'

/**
 * 种入商城阶段 1（商品中心）菜单：
 * - 类目管理 /shop-category → views/shop/category/CategoryList.vue
 * - 品牌管理 /shop-brand → views/shop/brand/BrandList.vue
 * - 属性管理 /shop-attribute → views/shop/attribute/AttributeList.vue
 * - 商品管理 /shop-product → views/shop/product/SpuList.vue
 * - 编辑商品 /shop-product-edit → views/shop/product/SpuEdit.vue（hidden，路由可达不进侧边栏）
 *
 * 全部挂在「商城」目录（/shop）下，幂等：按 path 判重。
 */
const menus = [
  { path: '/shop-category', name: '类目管理', component: 'views/shop/category/CategoryList.vue', icon: 'Files', sort: 2, hidden: 0 },
  { path: '/shop-brand', name: '品牌管理', component: 'views/shop/brand/BrandList.vue', icon: 'PriceTag', sort: 3, hidden: 0 },
  { path: '/shop-attribute', name: '属性管理', component: 'views/shop/attribute/AttributeList.vue', icon: 'Collection', sort: 4, hidden: 0 },
  { path: '/shop-product', name: '商品管理', component: 'views/shop/product/SpuList.vue', icon: 'Goods', sort: 5, hidden: 0 },
  { path: '/shop-product-edit', name: '编辑商品', component: 'views/shop/product/SpuEdit.vue', icon: 'EditPen', sort: 6, hidden: 1 },
]

export async function up(_queryInterface: QueryInterface): Promise<void> {
  try {
    const [tables] = await sequelize.query("SHOW TABLES LIKE 'menus'")
    if ((tables as any[]).length === 0) return

    // 商城目录（阶段 0 迁移创建；此处兜底，保证依赖顺序无关）
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
    logInfo(`种入商城商品中心菜单失败: ${err instanceof Error ? err.message : String(err)}`)
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
    logInfo(`已回滚商城商品中心菜单 (id=${ids.join(',')})`)
  } catch (err) {
    logInfo(`回滚商城商品中心菜单失败: ${err instanceof Error ? err.message : String(err)}`)
    throw err
  }
}
