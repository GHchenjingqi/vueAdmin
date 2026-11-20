/**
 * 仪表盘 Service 层
 *
 * 职责：封装仪表盘统计数据的业务逻辑
 */

import { Op } from 'sequelize'
import User from '../models/User.js'
import Prompt from '../modules/prompt/models/Prompt.js'
import { createCache } from '../utils/cache.js'

/** 仪表盘统计：提示词组 + 用户组，与云端 prompt-cloud 返回结构保持一致 */
export interface DashboardStats {
  promptTotal: number
  promptPublished: number
  promptPending: number
  promptSequence: number
  userTotal: number
  userTodayNew: number
  userActive: number
  userContributors: number
}

const dashboardCache = createCache<DashboardStats>({
  namespace: 'dashboard',
  max: 20,
  maxAgeMs: 60 * 1000,
})

const count = async (...args: any[]): Promise<number> =>
  (await (Prompt.count as any)(...args)) as number

/**
 * 获取仪表盘统计数据
 */
export async function getDashboardStats(): Promise<DashboardStats> {
  return dashboardCache.getOrSet('stats', async () => {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const notDeleted = { isDeleted: 0 } as any
    const [promptTotal, promptPublished, promptPending, promptSequence, contributorRows] = await Promise.all([
      count({ where: notDeleted }),
      count({ where: { ...notDeleted, status: 'published' } }),
      count({ where: { ...notDeleted, status: 'pending' } }),
      count({ where: { ...notDeleted, type: 'sequence' } }),
      Prompt.findAll({ where: { ...notDeleted, source: 'user' }, attributes: ['authorId'], group: ['authorId'], raw: true }) as Promise<unknown[]>,
    ])

    const [userTotal, userTodayNew, userActive] = await Promise.all([
      (User.count() as unknown) as Promise<number>,
      (User.count({ where: { createdAt: { [Op.gte]: todayStart } } }) as unknown) as Promise<number>,
      (User.count({ where: { status: 1 } }) as unknown) as Promise<number>,
    ])

    return {
      promptTotal,
      promptPublished,
      promptPending,
      promptSequence,
      userTotal,
      userTodayNew,
      userActive,
      userContributors: contributorRows.length,
    }
  })
}
