import type { QueryInterface } from 'sequelize'

/**
 * 注册「订单自动完结」定时任务（降本 P0-2）
 *
 * 复用既有 Task 调度器与 TaskManager 页面：运营可直接启停、手动执行、查看上次结果，
 * 无需新增接口或页面。handler 对应 server/utils/scheduler.ts 的 autoCompleteOrders。
 * 幂等：按 handler 去重，重复执行不会插入第二行。
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  const [rows] = await queryInterface.sequelize.query(
    "SELECT id FROM tasks WHERE handler = 'autoCompleteOrders' LIMIT 1",
  )
  if ((rows as unknown[]).length > 0) return

  const now = new Date()
  await queryInterface.bulkInsert('tasks', [
    {
      name: '订单自动完结',
      cronExpression: '0 2 * * *',
      handler: 'autoCompleteOrders',
      status: 1,
      description: '每天凌晨2点，将发货满14天且无进行中售后的订单自动置为 done（天数可用 ORDER_AUTO_COMPLETE_DAYS 覆盖）；不自动结算佣金/退款',
      lastRunAt: null,
      lastResult: null,
      createdAt: now,
      updatedAt: now,
    },
  ])
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query("DELETE FROM tasks WHERE handler = 'autoCompleteOrders'")
}
