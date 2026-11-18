import type { QueryInterface } from 'sequelize'

/** 提示词平台后台菜单，并授权给管理员角色（roleId=1） */
export async function up(queryInterface: QueryInterface): Promise<void> {
  const [existing] = await queryInterface.sequelize.query("SELECT id FROM menus WHERE path = '/prompt-hub' LIMIT 1")
  if ((existing as any[]).length > 0) return

  const now = new Date()
  const parentResult = await queryInterface.sequelize.query(
    'INSERT INTO menus (parentId, name, path, icon, type, sort, status, hidden, createdAt, updatedAt) VALUES (0, :name, :path, :icon, :type, :sort, 1, 0, :now, :now)',
    { replacements: { name: '提示词平台', path: '/prompt-hub', icon: 'Collection', type: 'C', sort: 90, now } },
  )
  const parentId = parentResult[0] as unknown as number

  await queryInterface.bulkInsert('menus', [
    {
      parentId,
      name: '分类管理',
      path: '/prompt-categories',
      component: 'views/prompt/PromptCategory.vue',
      icon: 'FolderOpened',
      type: 'M',
      sort: 0,
      status: 1,
      hidden: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      parentId,
      name: '提示词管理',
      path: '/prompt-manage',
      component: 'views/prompt/PromptManage.vue',
      icon: 'Document',
      type: 'M',
      sort: 1,
      status: 1,
      hidden: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      parentId,
      name: '投稿审核',
      path: '/prompt-reviews',
      component: 'views/prompt/PromptReview.vue',
      icon: 'Stamp',
      type: 'M',
      sort: 2,
      status: 1,
      hidden: 0,
      createdAt: now,
      updatedAt: now,
    },
  ])

  await queryInterface.sequelize.query(`
    INSERT INTO role_menus (roleId, menuId, createdAt, updatedAt)
    SELECT 1, m.id, NOW(), NOW() FROM menus m
    WHERE m.path IN ('/prompt-hub', '/prompt-categories', '/prompt-manage', '/prompt-reviews')
      AND NOT EXISTS (SELECT 1 FROM role_menus rm WHERE rm.roleId = 1 AND rm.menuId = m.id)
  `)
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query(`
    DELETE FROM role_menus WHERE menuId IN (
      SELECT id FROM menus WHERE path IN ('/prompt-hub', '/prompt-categories', '/prompt-manage', '/prompt-reviews')
    )
  `)
  await queryInterface.sequelize.query("DELETE FROM menus WHERE path IN ('/prompt-hub', '/prompt-categories', '/prompt-manage', '/prompt-reviews')")
}
