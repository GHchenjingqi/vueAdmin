/**
 * 定时任务 Service 层
 *
 * 职责：封装定时任务管理的所有业务逻辑
 */

import Task from '../models/Task.js'
import { reloadTask, getRunningTasks, runTaskNow } from '../utils/scheduler.js'
import { AppError } from '../middleware/errorHandler.js'

/**
 * 获取任务列表
 */
export async function listTasks() {
  const tasks = await Task.findAll({ order: [['id', 'ASC']] })
  const runningIds = getRunningTasks()
  const data = tasks.map(t => ({ ...t.toJSON(), isRunning: runningIds.includes(t.id) }))
  return data
}

/**
 * 创建定时任务
 */
export async function createTask(data: {
  name: string
  cronExpression: string
  handler: string
  status?: number
  description?: string
}) {
  const { name, cronExpression, handler, status = 1, description } = data
  if (!name || !cronExpression || !handler) {
    throw new AppError(400, '任务名称、Cron表达式和处理函数不能为空')
  }

  const task = await Task.create({ name, cronExpression, handler, status, description })
  await reloadTask(task.id)
  return { task, name }
}

/**
 * 更新定时任务
 */
export async function updateTask(
  id: number,
  data: {
    name?: string
    cronExpression?: string
    handler?: string
    status?: number
    description?: string
  },
) {
  const task = await Task.findByPk(id)
  if (!task) throw new AppError(404, '任务不存在')

  const { name, cronExpression, handler, status, description } = data
  await task.update({ name, cronExpression, handler, status, description })
  await reloadTask(task.id)
  return { task, name: task.name }
}

/**
 * 手动执行一次任务
 */
export async function executeTask(id: number) {
  const task = await Task.findByPk(id)
  if (!task) throw new AppError(404, '任务不存在')

  runTaskNow(task.id)
  return { name: task.name }
}

/**
 * 删除定时任务
 */
export async function deleteTask(id: number) {
  const task = await Task.findByPk(id)
  if (!task) throw new AppError(404, '任务不存在')

  task.status = 0
  await task.save()
  await reloadTask(task.id)
  await task.destroy()
  return { name: task.name }
}