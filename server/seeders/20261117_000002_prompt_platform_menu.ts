import type { QueryInterface } from 'sequelize'

/** 提示词平台字典菜单，并授权给管理员角色（roleId=1） */
export async function up(queryInterface: QueryInterface): Promise<void> {
  const [existing] = await queryInterface.sequelize.query("SELECT id FROM menus WHERE path = '/prompt-platforms' LIMIT 1")
  if ((existing as any[]).length === 0) {
    const [parentRows] = await queryInterface.sequelize.query("SELECT id FROM menus WHERE path = '/prompt-hub' LIMIT 1")
    const parentId = (parentRows as any[])[0]?.id ?? 0
    const now = new Date()
    await queryInterface.sequelize.query(
      'INSERT INTO menus (parentId, name, path, component, icon, type, sort, status, hidden, createdAt, updatedAt) VALUES (:parentId, :name, :path, :component, :icon, :type, :sort, 1, 0, :now, :now)',
      { replacements: { parentId, name: '平台字典', path: '/prompt-platforms', component: 'views/prompt/PromptPlatform.vue', icon: 'Grid', type: 'M', sort: 3, now } },
    )
  }
  await queryInterface.sequelize.query(`
    INSERT INTO role_menus (roleId, menuId, createdAt, updatedAt)
    SELECT 1, m.id, NOW(), NOW() FROM menus m
    WHERE m.path = '/prompt-platforms'
      AND NOT EXISTS (SELECT 1 FROM role_menus rm WHERE rm.roleId = 1 AND rm.menuId = m.id)
  `)
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query("DELETE FROM role_menus WHERE menuId IN (SELECT id FROM menus WHERE path = '/prompt-platforms')")
  await queryInterface.sequelize.query("DELETE FROM menus WHERE path = '/prompt-platforms'")
}
