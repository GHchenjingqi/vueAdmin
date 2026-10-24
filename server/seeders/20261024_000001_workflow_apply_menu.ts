import type { QueryInterface } from 'sequelize'

/**
 * 为「流程管理」下新增「发起申请」菜单，对应业务低代码发起页（views/ApplyWorkflow.vue）。
 * 幂等：path 已存在则跳过。
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  const [existing] = await queryInterface.sequelize.query("SELECT id FROM menus WHERE path = '/workflow-apply' LIMIT 1")
  if ((existing as any[]).length > 0) return

  const [parentRows] = await queryInterface.sequelize.query("SELECT id FROM menus WHERE path = '/workflow' LIMIT 1")
  const parentId = (parentRows as any[])[0]?.id
  if (!parentId) return

  const now = new Date()
  await queryInterface.bulkInsert('menus', [
    {
      parentId,
      name: '发起申请',
      path: '/workflow-apply',
      component: 'views/ApplyWorkflow.vue',
      icon: 'Promotion',
      type: 'M',
      sort: 3,
      status: 1,
      hidden: 0,
      createdAt: now,
      updatedAt: now,
    },
  ])
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query("DELETE FROM menus WHERE path = '/workflow-apply'")
}
