/**
 * 消息管理 Service 层
 *
 * 职责：封装消息管理的所有业务逻辑
 */

import { Op } from 'sequelize'
import Message from '../models/Message.js'
import User from '../models/User.js'
import { AppError } from '../middleware/errorHandler.js'

interface MessageQuery {
  page?: number
  pageSize?: number
  type?: string
  isRead?: string
  scope?: string
}

/**
 * 获取未读消息数量
 */
export async function getUnreadMessageCount(userId: number) {
  const count = await Message.count({
    where: { [Op.or]: [{ toUserId: userId }, { toUserId: null }], isRead: false },
  })
  return { count }
}

/**
 * 获取消息列表（分页）
 */
export async function listMessages(userId: number, query: MessageQuery) {
  const { page = 1, pageSize = 10, type, isRead, scope } = query

  if (scope === 'unread-count') {
    return getUnreadMessageCount(userId)
  }

  const offset = (Number(page) - 1) * Number(pageSize)
  const where: Record<string, unknown> = { [Op.or]: [{ toUserId: userId }, { toUserId: null }] }

  if (type && ['system', 'notice', 'private'].includes(type)) where.type = type
  if (isRead !== undefined && isRead !== '') {
    where.isRead = isRead === '1' || isRead === 'true'
  }

  const { rows, count } = await Message.findAndCountAll({
    where,
    offset,
    limit: Number(pageSize),
    order: [['createdAt', 'DESC']],
    include: [{ model: User, as: 'fromUser', attributes: ['id', 'username', 'nickname'] }],
  })

  const unreadCount = await Message.count({
    where: { [Op.or]: [{ toUserId: userId }, { toUserId: null }], isRead: false },
  })

  return { rows, total: count, unreadCount }
}

/**
 * 发送消息
 */
export async function createMessage(data: {
  fromUserId: number
  toUserId?: number | null
  title: string
  content: string
  type?: string
}) {
  const { fromUserId, toUserId, title, content, type } = data
  if (!title || !content) throw new AppError(400, '标题和内容不能为空')

  const message = await Message.create({
    fromUserId,
    toUserId: toUserId || null,
    title,
    content,
    type: type || 'notice',
  })

  return message
}

/**
 * 标记消息已读
 */
export async function markMessageRead(id: number, isRead: boolean) {
  const message = await Message.findByPk(id)
  if (!message) throw new AppError(404, '消息不存在')

  if (isRead) {
    message.isRead = true
    message.readAt = new Date()
    await message.save()
    return { markedRead: true }
  }

  return message
}

/**
 * 批量标记已读
 */
export async function markAllMessagesRead(userId: number) {
  await Message.update(
    { isRead: true, readAt: new Date() },
    { where: { toUserId: userId, isRead: false } },
  )
}

/**
 * 删除消息
 */
export async function deleteMessage(id: number) {
  const message = await Message.findByPk(id)
  if (!message) throw new AppError(404, '消息不存在')

  await message.destroy()
}