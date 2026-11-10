import type { QueryInterface } from 'sequelize'

/**
 * 邮件营销菜单（对会员/用户群发；与 /shop-customers 会员管理同父）。
 * 幂等：path 已存在则跳过。
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  const [existing] = await queryInterface.sequelize.query("SELECT id FROM menus WHERE path = '/mail-campaigns' LIMIT 1")
  if ((existing as unknown[]).length > 0) return

  const [parentRows] = await queryInterface.sequelize.query("SELECT id, parentId FROM menus WHERE path = '/shop-customers' LIMIT 1")
  const parentRow = (parentRows as { id: number; parentId: number | null }[])[0]
  const parentId = parentRow?.parentId ?? null

  const now = new Date()
  await queryInterface.bulkInsert('menus', [
    {
      parentId: parentId as number,
      name: '邮件营销',
      path: '/mail-campaigns',
      component: 'views/MailCampaigns.vue',
      icon: 'Message',
      type: 'M',
      sort: 10,
      status: 1,
      hidden: 0,
      createdAt: now,
      updatedAt: now,
    },
  ])
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query("DELETE FROM menus WHERE path = '/mail-campaigns'")
}
