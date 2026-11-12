import type { QueryInterface } from 'sequelize'

/**
 * 注册「审核规则化」定时任务（降本 P1）
 *
 * 复用既有 Task 调度器与 TaskManager 页面：运营可直接启停、手动执行、查看上次结果，
 * 无需新增接口或页面。handler 对应 server/utils/scheduler.ts 的 autoModeration。
 *
 * 默认停用（status=0）：自动审核属高风险变更，需同时满足两层显式开启才生效：
 * 1) 在任务管理页启用本任务；2) 打开功能开关 moderation_auto_approve。
 * 幂等：按 handler 去重，重复执行不会插入第二行。
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  const [rows] = await queryInterface.sequelize.query("SELECT id FROM tasks WHERE handler = 'autoModeration' LIMIT 1")
  if ((rows as unknown[]).length > 0) return

  const now = new Date()
  await queryInterface.bulkInsert('tasks', [
    {
      name: '审核规则化',
      cronExpression: '0 * * * *',
      handler: 'autoModeration',
      status: 0,
      description:
        '每小时扫描待审评价：低风险（已购验证/高评分/无引流与争议词/无图）自动批准并写审计日志，高风险转人工；RMA 与退款只做高风险统计提醒，绝不改状态或自动退款。需同时打开功能开关 moderation_auto_approve（默认关闭）才会生效',
      lastRunAt: null,
      lastResult: null,
      createdAt: now,
      updatedAt: now,
    },
  ])
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.sequelize.query("DELETE FROM tasks WHERE handler = 'autoModeration'")
}
