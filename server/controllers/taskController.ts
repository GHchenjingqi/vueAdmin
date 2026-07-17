/**
 * 定时任务控制器
 * @module taskController
 */

import { listTasks, createTask, updateTask, executeTask, deleteTask } from '../services/taskService.js'
import { logOperation } from '../utils/logger.js'

/**
 * 获取任务列表
 */
export const list = async (req, res, next) => {
  try {
    const data = await listTasks()
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

/**
 * 创建定时任务
 */
export const create = async (req, res, next) => {
  try {
    const result = await createTask(req.body)
    logOperation(req, '创建定时任务', `任务: ${result.name}`)
    res.status(201).json({ code: 0, data: result.task, message: '创建成功' })
  } catch (err) {
    next(err)
  }
}

/**
 * 更新定时任务
 */
export const update = async (req, res, next) => {
  try {
    const result = await updateTask(Number(req.params.id), req.body)
    logOperation(req, '更新定时任务', `任务: ${result.name}`)
    res.json({ code: 0, data: result.task, message: '更新成功' })
  } catch (err) {
    next(err)
  }
}

/**
 * 手动执行一次任务
 */
export const execute = async (req, res, next) => {
  try {
    const result = await executeTask(Number(req.params.id))
    logOperation(req, '手动执行定时任务', `任务: ${result.name}`)
    res.json({ code: 0, message: `任务 [${result.name}] 已触发执行，请稍后查看结果` })
  } catch (err) {
    next(err)
  }
}

/**
 * 删除定时任务
 */
export const remove = async (req, res, next) => {
  try {
    const result = await deleteTask(Number(req.params.id))
    logOperation(req, '删除定时任务', `任务: ${result.name}`)
    res.json({ code: 0, message: '删除成功' })
  } catch (err) {
    next(err)
  }
}