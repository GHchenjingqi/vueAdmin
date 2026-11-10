import type { QueryInterface } from 'sequelize'

/**
 * 会员管理菜单（C 端顾客体系，挂「系统管理」父菜单下）。
 * 注意区分：/users 用户管理 = B 端管理员账号；/shop-customers 会员管理 = C 端顾客。
 * 幂等：path 已存在则跳过。
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  const [existing] = await queryInterface.sequelize.query("SELECT id FROM menus WHERE path = '/shop-customers' LIMIT 1")
  if ((existing as unknown[]).length > 0) return

  const [parentRows] = await queryInterface.sequelize.query("SELECT id, parentId FROM menus WHERE path = '/users' LIMIT 1")
  const parentRow = (parentRows as { id: number; parentId: number | null }[])[0]
  // 父菜单取「用户管理」同级（系统管理）；找不到则挂顶层
  let parentId: number | null = parentRow?.parentId ?? null
  if (parentId === undefined || parentId === null) {
    const [sysRows] = await queryInterface.sequelize.query("SELECT id FROM menus WHERE name = '系统管理' LIMIT 1")
    parentId = ((sysRows as { id: number }[])[0]?.id as number | undefined) ?? null
  }

  const now = new Date()
  await queryInterface.bulkInsert('menus', [
    {
      parentId: parentId as number,
      name: '会员管理',
      path: '/shop-customers',
      component: 'views/CustomerList.vue',
      icon: 'Star',
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
  await queryInterface.sequelize.query("DELETE FROM menus WHERE path = '/shop-customers'")
}
