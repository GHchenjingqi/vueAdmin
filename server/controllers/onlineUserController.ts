/**
 * 在线用户控制器
 * @module onlineUserController
 */

import { listOnlineUsers, kickUser } from '../services/onlineUserService.js'
import { logOperation } from '../utils/logger.js'

/**
 * 获取在线用户列表
 * - ?scope=count 获取在线人数
 */
export const list = async (req, res, next) => {
  try {
    const scope = req.query.scope as string | undefined
    const data = listOnlineUsers(scope)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

/**
 * 踢用户下线
 */
export const kick = async (req, res, next) => {
  try {
    const targetUserId = parseInt(req.params.userId)
    await kickUser(targetUserId, req.user.id, req.user?.username)
    logOperation(req, '强制下线用户', `用户ID: ${targetUserId}`)
    res.json({ code: 0, message: '用户已被强制下线' })
  } catch (err) {
    next(err)
  }
}