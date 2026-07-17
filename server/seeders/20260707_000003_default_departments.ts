import type { QueryInterface } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.bulkInsert('departments', [
    {
      parentId: 0,
      name: '总公司',
      sort: 0,
      leader: '管理员',
      phone: '13800138000',
      status: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      parentId: 1,
      name: '技术部',
      sort: 0,
      leader: '张三',
      phone: '13900139001',
      status: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      parentId: 1,
      name: '市场部',
      sort: 1,
      leader: '李四',
      phone: '13900139002',
      status: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      parentId: 1,
      name: '财务部',
      sort: 2,
      leader: '王五',
      phone: '13900139003',
      status: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ])
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query('DELETE FROM departments WHERE name IN (?, ?, ?, ?)', {
    replacements: ['总公司', '技术部', '市场部', '财务部'],
  })
}