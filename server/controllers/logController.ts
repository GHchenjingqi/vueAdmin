/**
 * 系统日志控制器
 * @module logController
 */

import { exportLogs, getLoginFailures, listLogs, getLogById, cleanupLogs } from '../services/logService.js'

/**
 * 获取日志列表
 * - ?scope=export 导出 Excel
 * - ?scope=login-failures 登录失败统计
 */
export const list = async (req, res, next) => {
  try {
    const { page = 1, pageSize = 10, scope } = req.query

    if (scope === 'export') {
      const { buffer, filename } = await exportLogs({
        type: req.query.type as string,
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
      })
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      res.setHeader('Content-Disposition', `attachment; filename=${encodeURIComponent(filename)}`)
      return res.send(buffer)
    }

    if (scope === 'login-failures') {
      const data = await getLoginFailures({
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
      })
      return res.json({ code: 0, data })
    }

    const data = await listLogs({
      page: Number(page),
      pageSize: Number(pageSize),
      type: req.query.type as string,
      action: req.query.action as string,
      keyword: req.query.keyword as string,
      startDate: req.query.startDate as string,
      endDate: req.query.endDate as string,
    })
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

/**
 * 获取日志详情
 */
export const getById = async (req, res, next) => {
  try {
    const log = await getLogById(Number(req.params.id))
    res.json({ code: 0, data: log })
  } catch (err) {
    next(err)
  }
}

/**
 * 清理过期日志
 */
export const cleanup = async (req, res, next) => {
  try {
    const { deletedCount, scope } = await cleanupLogs({
      beforeDays: Number(req.query.beforeDays) || 90,
      type: req.query.type as string,
    })
    res.json({ code: 0, message: `清理成功，共删除 ${deletedCount} 条${scope}日志`, data: { deletedCount } })
  } catch (err) {
    next(err)
  }
}