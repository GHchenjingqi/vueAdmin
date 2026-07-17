import type { QueryInterface } from 'sequelize'

export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.bulkInsert('tasks', [
    {
      name: '日志清理',
      cronExpression: '0 3 * * *',
      handler: 'cleanupLogs',
      status: 1,
      description: '每天凌晨3点清理90天前的日志',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      name: '心跳检测',
      cronExpression: '*/5 * * * *',
      handler: 'heartbeat',
      status: 1,
      description: '每5分钟执行一次心跳检测',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ])
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query('DELETE FROM tasks WHERE handler IN (?, ?)', {
    replacements: ['cleanupLogs', 'heartbeat'],
  })
}