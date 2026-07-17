/**
 * 消息管理控制器
 * @module messageController
 */

import { listMessages, createMessage, markMessageRead, markAllMessagesRead, deleteMessage } from '../services/messageService.js'

/**
 * 获取消息列表
 * - ?scope=unread-count 仅获取未读数
 */
export const list = async (req, res, next) => {
  try {
    const data = await listMessages(req.user.id, {
      page: Number(req.query.page) || 1,
      pageSize: Number(req.query.pageSize) || 10,
      type: req.query.type as string,
      isRead: req.query.isRead as string,
      scope: req.query.scope as string,
    })
    res.json({ code: 0, data })
  } catch (err) {
    next(err)
  }
}

/**
 * 发送消息
 */
export const create = async (req, res, next) => {
  try {
    const message = await createMessage({
      fromUserId: req.user.id,
      toUserId: req.body.toUserId || null,
      title: req.body.title,
      content: req.body.content,
      type: req.body.type,
    })
    res.status(201).json({ code: 0, data: message, message: '发送成功' })
  } catch (err) {
    next(err)
  }
}

/**
 * 更新消息（标记已读）
 */
export const update = async (req, res, next) => {
  try {
    const result = await markMessageRead(Number(req.params.id), req.body.isRead)
    if (result.markedRead) {
      return res.json({ code: 0, message: '已标记为已读' })
    }
    res.json({ code: 0, data: result })
  } catch (err) {
    next(err)
  }
}

/**
 * 批量标记已读
 */
export const readAll = async (req, res, next) => {
  try {
    await markAllMessagesRead(req.user.id)
    res.json({ code: 0, message: '全部已读' })
  } catch (err) {
    next(err)
  }
}

/**
 * 删除消息
 */
export const remove = async (req, res, next) => {
  try {
    await deleteMessage(Number(req.params.id))
    res.json({ code: 0, message: '删除成功' })
  } catch (err) {
    next(err)
  }
}