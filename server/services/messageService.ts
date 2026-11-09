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
export async function createMessage(data: { fromUserId: number; toUserId?: number | null; title: string; content: string; type?: string }) {
  const { fromUserId, toUserId, title, content, type } = data
  if (!title || !content) throw new AppError(400, '标题和内容不能为空')
  if (type && !['system', 'notice', 'private'].includes(type)) {
    throw new AppError(400, `非法的消息类型: ${type}（仅支持 system / notice / private）`)
  }
  if (toUserId) {
    // 经租户 scope 钩子解析：指向其他租户的用户视为不存在
    const recipient = await User.findByPk(toUserId, { attributes: ['id'] })
    if (!recipient) throw new AppError(404, '接收者不存在')
  }

  const message = await Message.create({
    fromUserId,
    toUserId: toUserId || null,
    title,
    content,
    type: (type || 'notice') as 'system' | 'notice' | 'private',
  })

  return message
}

/**
 * 标记消息已读
 *
 * 消息是按人投递的私人数据：只能操作自己收到的（或自己发出的）消息，
 * 否则任意登录用户可用自增 id 读取/清除他人消息。
 */
export async function markMessageRead(id: number, isRead: boolean, userId: number) {
  const message = await Message.findByPk(id)
  if (!message) throw new AppError(404, '消息不存在')
  if (message.toUserId !== null && message.toUserId !== userId) throw new AppError(403, '无权操作该消息')

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
    {
      where: {
        [Op.or]: [{ toUserId: userId }, { toUserId: null }],
        isRead: false,
      },
    },
  )
}

/**
 * 删除消息
 */
export async function deleteMessage(id: number, userId: number) {
  const message = await Message.findByPk(id)
  if (!message) throw new AppError(404, '消息不存在')
  if (message.toUserId !== userId && message.fromUserId !== userId) throw new AppError(403, '无权删除该消息')

  await message.destroy()
}
