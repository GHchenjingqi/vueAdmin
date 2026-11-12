import cron from 'node-cron'
import Task from '../models/Task.js'
import Log from '../models/Log.js'
import { Op } from 'sequelize'
import { logInfo } from './fileLogger.js'

const runningJobs = new Map()

const handlers = {
  async cleanupLogs() {
    const deleted = await Log.destroy({
      where: { createdAt: { [Op.lt]: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) } },
    })
    return `清理了 ${deleted} 条过期日志`
  },

  async cleanupOldFiles() {
    return '文件清理任务已执行（暂无待清理文件）'
  },

  async heartbeat() {
    return '心跳检测正常'
  },

  /** 订单自动完结：动态导入避免调度器启动时拖入商城模型依赖 */
  async autoCompleteOrders() {
    const { autoCompleteShippedOrders } = await import('../modules/shop/services/orderCompletionService.js')
    const r = await autoCompleteShippedOrders()
    return `扫描 ${r.scanned} 单/${r.tenants} 租户，完结 ${r.completed} 单；跳过 售后中 ${r.skippedRma}、无运单 ${r.skippedNoShipment}、未到期 ${r.skippedNotDue}（${r.days} 天规则）`
  },

  /** 审核规则化：低风险评价自动批、高风险转人工；动态导入避免拖入商城模型依赖 */
  async autoModeration() {
    const { runAutoModeration } = await import('../modules/shop/services/autoModerationService.js')
    const r = await runAutoModeration()
    if (!r.enabled) return `未启用（功能开关 moderation_auto_approve 关闭），本轮零变更`
    return `扫描 ${r.scannedReviews} 条评价/${r.tenants} 租户，自动批准 ${r.autoApproved} 条、转人工 ${r.manualReviews} 条（阈值 ${r.threshold}）；待审售后 ${r.scannedRmas} 单，其中高风险 ${r.highRiskRmas} 单需人工优先处理；失败 ${r.failed}`
  },
}

async function startJob(task) {
  try {
    if (runningJobs.has(task.id)) {
      runningJobs.get(task.id).stop()
      runningJobs.delete(task.id)
    }

    if (!cron.validate(task.cronExpression)) {
      return
    }

    const job = cron.schedule(task.cronExpression, async () => {
      try {
        const handler = handlers[task.handler]
        if (!handler) {
          await Task.update({ lastResult: '未知的处理函数', lastRunAt: new Date() }, { where: { id: task.id } })
          return
        }
        const result = await handler()
        await Task.update({ lastResult: result, lastRunAt: new Date() }, { where: { id: task.id } })
        logInfo(`定时任务 [${task.name}] 执行完成: ${result}`)
      } catch (err) {
        await Task.update({ lastResult: `执行失败: ${err.message}`, lastRunAt: new Date() }, { where: { id: task.id } })
        logInfo(`定时任务 [${task.name}] 执行失败: ${err.message}`)
      }
    })

    runningJobs.set(task.id, job)
  } catch (err) {
    logInfo(`启动定时任务 [${task.name}] 失败: ${err.message}`)
  }
}

export async function initScheduler() {
  const tasks = await Task.findAll()
  for (const task of tasks) {
    if (task.status === 1) {
      await startJob(task)
      logInfo(`定时任务 [${task.name}] 已启动 (${task.cronExpression})`)
    }
  }
  logInfo(`定时任务调度器初始化完成，共 ${tasks.length} 个任务`)
}

export async function reloadTask(taskId) {
  const task = await Task.findByPk(taskId)
  if (!task) return
  if (task.status === 1) {
    await startJob(task)
  } else {
    if (runningJobs.has(task.id)) {
      runningJobs.get(task.id).stop()
      runningJobs.delete(task.id)
    }
  }
}

export async function runTaskNow(taskId) {
  const task = await Task.findByPk(taskId)
  if (!task) return
  const handler = handlers[task.handler]
  if (!handler) {
    await Task.update({ lastResult: '未知的处理函数', lastRunAt: new Date() }, { where: { id: task.id } })
    return
  }
  try {
    const result = await handler()
    await Task.update({ lastResult: result, lastRunAt: new Date() }, { where: { id: task.id } })
    logInfo(`定时任务 [${task.name}] 手动执行完成: ${result}`)
  } catch (err) {
    await Task.update({ lastResult: `执行失败: ${err.message}`, lastRunAt: new Date() }, { where: { id: task.id } })
    logInfo(`定时任务 [${task.name}] 手动执行失败: ${err.message}`)
  }
}

export function getRunningTasks() {
  return Array.from(runningJobs.keys())
}

export { startJob }
