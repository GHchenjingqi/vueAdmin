/**
 * 通知公告 Service 层
 *
 * 职责：封装通知公告管理的所有业务逻辑
 */

import { Op } from 'sequelize'
import Notice from '../models/Notice.js'
import NoticeRead from '../models/NoticeRead.js'
import { AppError } from '../middleware/errorHandler.js'
import { broadcast } from '../utils/sseManager.js'

/**
 * 获取未读通知数量
 */
export async function getUnreadCount(userId: number) {
  const totalPublished = await Notice.count({ where: { status: 'published' } })
  const readCount = await NoticeRead.count({
    where: { userId },
    distinct: true,
    col: 'noticeId',
  })
  const unread = totalPublished - readCount
  return { total: Math.max(0, unread) }
}

/**
 * 获取用户通知列表（含已读状态）
 */
export async function listUserNotices(userId: number) {
  const notices = await Notice.findAll({
    where: { status: 'published' },
    order: [['isTop', 'DESC'], ['publishTime', 'DESC']],
    limit: 10,
    attributes: ['id', 'title', 'type', 'publishTime', 'isTop'],
  })
  const noticeIds = notices.map((n) => n.id)
  const readRecords = await NoticeRead.findAll({
    where: { userId, noticeId: { [Op.in]: noticeIds } },
  })
  const readSet = new Set(readRecords.map((r) => r.noticeId))
  const items = notices.map((n) => ({
    id: n.id,
    title: n.title,
    type: n.type,
    publishTime: n.publishTime,
    isTop: n.isTop,
    read: readSet.has(n.id),
  }))
  const unread = items.filter((i) => !i.read).length
  return { items, unread }
}

/**
 * 获取已发布通知分页列表
 */
export async function listPublishedNotices(page: number, pageSize: number) {
  const offset = (page - 1) * pageSize
  const { rows, count } = await Notice.findAndCountAll({
    where: { status: 'published' },
    order: [['isTop', 'DESC'], ['publishTime', 'DESC']],
    offset,
    limit: pageSize,
    attributes: ['id', 'title', 'content', 'type', 'publisherName', 'publishTime', 'isTop', 'createdAt'],
  })
  return { rows, total: count }
}

/**
 * 获取管理端通知分页列表
 */
export async function listAdminNotices(query: {
  page: number
  pageSize: number
  keyword?: string
  type?: string
  status?: string
}) {
  const { page, pageSize, keyword, type, status } = query
  const where: Record<string, unknown> = {}

  if (keyword) {
    where[Op.or] = [
      { title: { [Op.like]: `%${keyword}%` } },
      { content: { [Op.like]: `%${keyword}%` } },
    ]
  }
  if (type) where.type = type
  if (status) where.status = status

  const offset = (page - 1) * pageSize
  const { rows, count } = await Notice.findAndCountAll({
    where,
    order: [['isTop', 'DESC'], ['sort', 'ASC'], ['createdAt', 'DESC']],
    offset,
    limit: pageSize,
  })
  return { rows, total: count }
}

/**
 * 获取单个通知
 */
export async function getNoticeById(id: number) {
  const notice = await Notice.findByPk(id)
  if (!notice) throw new AppError(404, '通知不存在')
  return notice
}

/**
 * 创建通知
 */
export async function createNotice(data: {
  title: string
  content: string
  type?: string
  status?: string
  isTop?: number
  sort?: number
  userId?: number
  username?: string
}) {
  const { title, content, type, status, isTop, sort, userId, username } = data
  if (!title || !content) {
    throw new AppError(400, '标题和内容不能为空')
  }

  const notice = await Notice.create({
    title,
    content,
    type: type || 'notice',
    status: status || 'draft',
    publisherId: userId || null,
    publisherName: username || null,
    isTop: isTop || 0,
    sort: sort || 0,
    publishTime: status === 'published' ? new Date() : null,
  })

  if (status === 'published') {
    broadcast('notice-published', {
      id: notice.id,
      title: notice.title,
      type: notice.type,
      time: notice.publishTime,
    })
  }

  return { id: notice.id }
}

/**
 * 更新通知
 */
export async function updateNotice(
  id: number,
  data: {
    title?: string
    content?: string
    type?: string
    status?: string
    isTop?: number
    sort?: number
    isRead?: boolean
    userId?: number
    username?: string
  },
) {
  const notice = await Notice.findByPk(id)
  if (!notice) throw new AppError(404, '通知不存在')

  if (data.isRead) {
    const userId = data.userId
    if (userId) {
      await NoticeRead.findOrCreate({
        where: { noticeId: notice.id, userId },
        defaults: { noticeId: notice.id, userId },
      })
    }
    return { markedRead: true }
  }

  const { title, content, type, status, isTop, sort, userId, username } = data
  const updateData: Record<string, unknown> = { title, content, type, isTop, sort }

  let wasPublished = false
  let wasUnpublished = false
  if (status === 'published' && notice.status !== 'published') {
    updateData.status = 'published'
    updateData.publishTime = new Date()
    updateData.publisherId = userId || notice.publisherId
    updateData.publisherName = username || notice.publisherName
    wasPublished = true
  } else if (status === 'draft' && notice.status === 'published') {
    updateData.status = 'draft'
    wasUnpublished = true
  } else if (status) {
    updateData.status = status
  }

  await notice.update(updateData)

  if (wasPublished) {
    broadcast('notice-published', {
      id: notice.id,
      title: updateData.title || notice.title,
      type: updateData.type || notice.type,
      time: updateData.publishTime,
    })
  }
  if (wasUnpublished) {
    broadcast('notice-removed', { id: notice.id })
  }
}

/**
 * 删除通知
 */
export async function deleteNotice(id: number) {
  const notice = await Notice.findByPk(id)
  if (!notice) throw new AppError(404, '通知不存在')

  await notice.destroy()
}

/**
 * 全部标记为已读
 */
export async function markAllRead(userId: number) {
  const publishedNotices = await Notice.findAll({
    where: { status: 'published' },
    attributes: ['id'],
  })
  const noticeIds = publishedNotices.map((n) => n.id)
  if (noticeIds.length === 0) return { count: 0 }

  const existingReads = await NoticeRead.findAll({
    where: { userId, noticeId: { [Op.in]: noticeIds } },
    attributes: ['noticeId'],
  })
  const readSet = new Set(existingReads.map((r) => r.noticeId))
  const unreadIds = noticeIds.filter((id) => !readSet.has(id))

  const records = unreadIds.map((noticeId) => ({ noticeId, userId }))
  await NoticeRead.bulkCreate(records)
  return { count: unreadIds.length }
}