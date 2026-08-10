import type { QueryInterface } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  const [existing] = await queryInterface.sequelize.query(
    "SELECT id FROM menus WHERE path = '/workflow' LIMIT 1",
  )
  if ((existing as any[]).length > 0) return

  const now = new Date()

  const parentResult = await queryInterface.sequelize.query(
    'INSERT INTO menus (parentId, name, path, icon, type, sort, status, hidden, createdAt, updatedAt) VALUES (0, :name, :path, :icon, :type, :sort, 1, 0, :now, :now)',
    {
      replacements: { name: '流程管理', path: '/workflow', icon: 'Connection', type: 'C', sort: 80, now },
    },
  )
  const parentId = parentResult[0] as number

  await queryInterface.bulkInsert('menus', [
    {
      parentId,
      name: '工作流管理',
      path: '/workflows',
      component: 'views/WorkflowList.vue',
      icon: 'List',
      type: 'M',
      sort: 0,
      status: 1,
      hidden: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      parentId,
      name: '运行实例',
      path: '/workflow-instances',
      component: 'views/WorkflowInstance.vue',
      icon: 'Monitor',
      type: 'M',
      sort: 1,
      status: 1,
      hidden: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      parentId,
      name: '审批中心',
      path: '/approval-center',
      component: 'views/ApprovalCenter.vue',
      icon: 'EditPen',
      type: 'M',
      sort: 2,
      status: 1,
      hidden: 0,
      createdAt: now,
      updatedAt: now,
    },
  ])
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(
    "DELETE FROM menus WHERE path IN ('/workflows', '/workflow-instances', '/approval-center', '/workflow')",
  )
}