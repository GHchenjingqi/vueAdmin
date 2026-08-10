import User from '../models/User.js'
import Role from '../models/Role.js'
import UserRole from '../models/UserRole.js'
import Department from '../models/Department.js'
import { Op } from 'sequelize'

interface ApproverRule {
  ruleType: string
  ruleConfig: string | null
}

export async function resolveApprovers(rules: ApproverRule[], context: { startedBy: number }): Promise<number[]> {
  const userIdsSet = new Set<number>()

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
        leaderIds.forEach(id => userIdsSet.add(id))
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
          userRoles.forEach(ur => userIdsSet.add(ur.userId))
        }
        break
      }
      case 'dept': {
        const deptIds: number[] = config.deptIds || []
        if (deptIds.length > 0) {
          const users = await User.findAll({ where: { deptId: { [Op.in]: deptIds }, status: 1 } })
          users.forEach(u => userIdsSet.add(u.id))
        }
        break
      }
      case 'user': {
        const userIds: number[] = config.userIds || []
        userIds.forEach(id => userIdsSet.add(id))
        break
      }
    }
  }

  // 排除发起人自身（除非规则明确包含 creator）
  const hasCreatorRule = rules.some(r => r.ruleType === 'creator')
  if (!hasCreatorRule) {
    userIdsSet.delete(context.startedBy)
  }

  return Array.from(userIdsSet)
}

async function resolveDirectLeader(userId: number, level: number): Promise<number[]> {
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