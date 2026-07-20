/**
 * 通知公告控制器
 * @module noticeController
 */

import jwt from 'jsonwebtoken'
import { addClient } from '../utils/sseManager.js'
import { updateUserActivity } from '../utils/onlineUsers.js'
import config from '../config/index.js'
import {
  getUnreadCount,
  listUserNotices,
  listPublishedNotices,
  listAdminNotices,
  getNoticeById,
  createNotice,
  updateNotice,
  deleteNotice,
  markAllRead as markAllReadService,
} from '../services/noticeService.js'

/**
 * SSE 实时推送通知
 * GET /api/notices/sse?token=<jwt_token>
 */
export const sse = async (req, res, next) => {
  try {
    let userId = req.user?.id
    if (!req.user) {
      const authHeader = req.headers.authorization
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ code: 401, message: '未提供认证令牌' })
      }
      const token = authHeader.split(' ')[1]
      if (typeof token !== 'string' || !token) {
        return res.status(401).json({ code: 401, message: '无效的认证令牌' })
      }

      let decoded
      try {
        decoded = jwt.verify(token, config.jwt.secret)
      } catch (err) {
        if (err.name === 'TokenExpiredError') {
          return res.status(401).json({ code: 401, message: '认证令牌已过期，请重新登录', expired: true })
        }
        return res.status(401).json({ code: 401, message: '无效的认证令牌' })
      }

      userId = decoded.id
      req.user = decoded
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress
      updateUserActivity(userId, ip, req.headers['user-agent'], {
        username: decoded.username,
        nickname: decoded.nickname,
      })
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    })

    res.write(`event: connected\ndata: ${JSON.stringify({ userId })}\n\n`)

    addClient(userId, res)

    const heartbeat = setInterval(() => {
      try {
        res.write(`event: heartbeat\ndata: ${Date.now()}\n\n`)
      } catch {
        clearInterval(heartbeat)
      }
    }, 30000)

    req.on('close', () => {
      clearInterval(heartbeat)
    })
  } catch (err) {
    next(err)
  }
}

/**
 * 获取通知列表
 */
export const list = async (req, res, next) => {
  try {
    const { page = 1, pageSize = 10, keyword, type, status, view } = req.query

    if (view === 'unread-count') {
      const data = await getUnreadCount(req.user.id)
      return res.json({ code: 0, data })
    }

    if (view === 'user') {
      const data = await listUserNotices(req.user.id)
      return res.json({ code: 0, data })
    }

    if (status === 'published') {
      const data = await listPublishedNotices(Number(page), Number(pageSize))
      return res.json({ code: 0, data })
    }

    const data = await listAdminNotices({
      page: Number(page),
      pageSize: Number(pageSize),
      keyword: keyword as string,
      type: type as string,
      status: status as string,
    })
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

/**
 * 获取单个通知
 */
export const getById = async (req, res, next) => {
  try {
    const notice = await getNoticeById(Number(req.params.id))
    res.json({ code: 0, data: notice })
  } catch (err) {
    next(err)
  }
}

/**
 * 创建通知
 */
export const create = async (req, res, next) => {
  try {
    const user = req.user || {}
    const result = await createNotice({
      ...req.body,
      userId: user.id || null,
      username: user.username || null,
    })
    res.status(201).json({ code: 0, data: { id: result.id }, message: '创建成功' })
  } catch (err) {
    next(err)
  }
}

/**
 * 更新通知
 */
export const update = async (req, res, next) => {
  try {
    const user = req.user || {}
    await updateNotice(Number(req.params.id), {
      ...req.body,
      userId: user.id,
      username: user.username,
    })
    res.json({ code: 0, message: '更新成功' })
  } catch (err) {
    next(err)
  }
}

/**
 * 删除通知
 */
export const remove = async (req, res, next) => {
  try {
    await deleteNotice(Number(req.params.id))
    res.json({ code: 0, message: '删除成功' })
  } catch (err) {
    next(err)
  }
}

/**
 * 全部标记为已读
 */
export const markAllRead = async (req, res, next) => {
  try {
    const result = await markAllReadService(req.user.id)
    res.json({ code: 0, data: result, message: '全部标记为已读' })
  } catch (err) {
    next(err)
  }
}