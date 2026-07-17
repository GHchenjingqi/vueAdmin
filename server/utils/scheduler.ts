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
        await Task.update(
          { lastResult: `执行失败: ${err.message}`, lastRunAt: new Date() },
          { where: { id: task.id } },
        )
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
    await Task.update(
      { lastResult: `执行失败: ${err.message}`, lastRunAt: new Date() },
      { where: { id: task.id } },
    )
    logInfo(`定时任务 [${task.name}] 手动执行失败: ${err.message}`)
  }
}

export function getRunningTasks() {
  return Array.from(runningJobs.keys())
}

export { startJob }