/**
 * 业务模型类型定义
 *
 * 类型来源：从 server/shared/schemas/ 的 Zod Schema 自动推断
 * Schema 变更时前端类型自动同步，无需手动维护
 */

export type { User } from '@shared/schemas/user'
export type { Menu } from '@shared/schemas/menu'
export type { Role } from '@shared/schemas/role'
export type { Department } from '@shared/schemas/dept'
export type { Notice } from '@shared/schemas/notice'
export type { DictType, DictData } from '@shared/schemas/dict'

/** 站内消息实体 */
export interface Message {
  id: number
  title: string
  content?: string
  senderId?: number
  senderName?: string
  receiverId?: number
  read?: boolean
  sendTime?: string
  type?: string
}

/** 日志条目 */
export interface LogEntry {
  id: number
  username?: string
  operation?: string
  module?: string
  ip?: string
  method?: string
  path?: string
  status?: number
  cost?: number
  message?: string
  createdAt?: string
  type?: 'login' | 'operation' | 'error'
}

/** 定时任务 */
export interface Task {
  id: number
  name: string
  cronExpression: string
  target: string
  params?: string
  status: number
  lastRunAt?: string
  nextRunAt?: string
  createdAt?: string
}

/** 在线用户 */
export interface OnlineUser {
  id: string
  username: string
  nickname?: string
  ip?: string
  userAgent?: string
  loginAt?: string
  lastActiveAt?: string
}

/** 系统设置 */
export interface SystemSetting {
  key: string
  value?: string
  type?: string
  description?: string
  updatedAt?: string
}

/** 仪表盘统计数据 */
export interface DashboardStats {
  userCount?: number
  todayNewUsers?: number
  logCount?: number
  noticeCount?: number
  activeUsers?: number
  [key: string]: unknown
}
