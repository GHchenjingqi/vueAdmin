import User from '../models/User.js'
import Role from '../models/Role.js'
import UserRole from '../models/UserRole.js'
import Department from '../models/Department.js'
import { Op } from 'sequelize'
import { createCache } from './cache.js'

interface ApproverRule {
  ruleType: string
  ruleConfig: string | null
}

// 审批人解析结果按「规则 + 发起人 + 表单输入」缓存（默认 60s TTL 兜底）。
// 测试环境（NODE_ENV=test）下 createCache 自动禁用，保证单测确定性。
const approverCache = createCache<number[]>({ max: 1000, maxAgeMs: 60 * 1000 })

function approverCacheKey(rules: ApproverRule[], startedBy: number, input?: Record<string, unknown>): string {
  return JSON.stringify({ r: rules, s: startedBy, i: input || {} })
}

export async function resolveApprovers(
  rules: ApproverRule[],
  context: { startedBy: number; input?: Record<string, unknown> },
): Promise<number[]> {
  return approverCache.getOrSet(approverCacheKey(rules, context.startedBy, context.input), () =>
    resolveApproversUncached(rules, context),
  )
}

async function resolveApproversUncached(rules: ApproverRule[], context: { startedBy: number; input?: Record<string, unknown> }): Promise<number[]> {
  const userIdsSet = new Set<number>()
  const input = context.input || {}

  for (const rule of rules) {
    const config = rule.ruleConfig ? JSON.parse(rule.ruleConfig) : {}

    switch (rule.ruleType) {
      case 'creator': {
        userIdsSet.add(context.startedBy)
        break
      }
      case 'direct_leader': {
        const level = config.level || 1
        const leaderIds = await resolveDirectLeader(context.startedBy, level)
        leaderIds.forEach((id) => userIdsSet.add(id))
        break
      }
      case 'dept_manager': {
        const user = await User.findByPk(context.startedBy)
        if (user?.deptId) {
          const dept = await Department.findByPk(user.deptId)
          if (dept?.leader) {
            const leader = await User.findOne({ where: { nickname: dept.leader } })
            if (leader) userIdsSet.add(leader.id)
          }
        }
        break
      }
      case 'role': {
        const roleIds: number[] = config.roleIds || []
        if (roleIds.length > 0) {
          const userRoles = await UserRole.findAll({ where: { roleId: { [Op.in]: roleIds } } })
          userRoles.forEach((ur) => userIdsSet.add(ur.userId))
        }
        break
      }
      case 'dept': {
        const deptIds: number[] = config.deptIds || []
        if (deptIds.length > 0) {
          const users = await User.findAll({ where: { deptId: { [Op.in]: deptIds }, status: 1 } })
          users.forEach((u) => userIdsSet.add(u.id))
        }
        break
      }
      case 'user': {
        const userIds: number[] = config.userIds || []
        userIds.forEach((id) => userIdsSet.add(id))
        break
      }
      case 'field': {
        // 从表单字段解析审批人：字段值可为 userId（默认）或 username
        const fieldKey: string = config.fieldKey
        if (fieldKey && input[fieldKey] !== undefined && input[fieldKey] !== null && input[fieldKey] !== '') {
          const raw = input[fieldKey]
          const values = Array.isArray(raw) ? raw : String(raw).split(',').map((s) => s.trim()).filter(Boolean)
          if (config.resolve === 'username') {
            for (const name of values) {
              const u = await User.findOne({ where: { username: String(name) } })
              if (u) userIdsSet.add(u.id)
            }
          } else {
            for (const v of values) {
              const id = Number(v)
              if (Number.isFinite(id) && id > 0) userIdsSet.add(id)
            }
          }
        }
        break
      }
    }
  }

  // 排除发起人自身（除非规则明确包含 creator）
  const hasCreatorRule = rules.some((r) => r.ruleType === 'creator')
  if (!hasCreatorRule) {
    userIdsSet.delete(context.startedBy)
  }

  return Array.from(userIdsSet)
}

export async function resolveDirectLeader(userId: number, level: number): Promise<number[]> {
  const user = await User.findByPk(userId)
  if (!user?.deptId) return []

  let currentDeptId: number | null = user.deptId
  let currentLevel = 0

  while (currentDeptId && currentLevel < level) {
    const dept = await Department.findByPk(currentDeptId)
    if (!dept) break

    if (dept.leader) {
      const leader = await User.findOne({ where: { nickname: dept.leader } })
      if (leader) {
        if (currentLevel + 1 >= level) {
          return [leader.id]
        }
      }
    }

    currentDeptId = dept.parentId
    currentLevel++
  }

  return []
}
