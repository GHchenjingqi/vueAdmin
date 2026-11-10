import type { QueryInterface } from 'sequelize'

/**
 * 首页 Banner 管理菜单（挂到 CMS 文章管理同级）。
 * 幂等：path 已存在则跳过。
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  const [existing] = await queryInterface.sequelize.query("SELECT id FROM menus WHERE path = '/banners' LIMIT 1")
  if ((existing as unknown[]).length > 0) return

  // 挂到「商城」(/shop) 下，与币种设置/支付通道同级
  const [parentRows] = await queryInterface.sequelize.query("SELECT id FROM menus WHERE path = '/shop' LIMIT 1")
  const parentRow = (parentRows as { id: number }[])[0]
  if (!parentRow) throw new Error('未找到商城父菜单 /shop，无法挂载 Banner 管理')
  const parentId = parentRow.id

  const now = new Date()
  await queryInterface.bulkInsert('menus', [
    {
      parentId: parentId as number,
      name: 'Banner 管理',
      path: '/banners',
      component: 'views/Banners.vue',
      icon: 'Picture',
      type: 'M',
      sort: 9,
      status: 1,
      hidden: 0,
      createdAt: now,
      updatedAt: now,
    },
  ])
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query("DELETE FROM menus WHERE path = '/banners'")
}
