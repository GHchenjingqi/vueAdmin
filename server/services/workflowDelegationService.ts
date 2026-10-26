import { Op } from 'sequelize'
import WorkflowDelegation from '../models/WorkflowDelegation.js'
import User from '../models/User.js'

export interface DelegationInput {
  fromUserId: number
  toUserId: number
  startAt: Date
  endAt: Date | null
  remark?: string | null
}

/** 创建委托（同一委托人同一被委托人仅保留一条有效记录） */
export async function createDelegation(input: DelegationInput): Promise<WorkflowDelegation> {
  if (input.fromUserId === input.toUserId) {
    throw new Error('不能委托给自己')
  }
  const toUser = await User.findByPk(input.toUserId)
  if (!toUser) throw new Error('被委托人不存在')

  const existing = await WorkflowDelegation.findOne({
    where: { fromUserId: input.fromUserId, toUserId: input.toUserId, status: 1 },
  })
  if (existing) {
    existing.startAt = input.startAt
    existing.endAt = input.endAt
    existing.remark = input.remark ?? null
    await existing.save()
    return existing
  }
  return WorkflowDelegation.create({
    fromUserId: input.fromUserId,
    toUserId: input.toUserId,
    startAt: input.startAt,
    endAt: input.endAt,
    remark: input.remark ?? null,
    status: 1,
  })
}

export async function cancelDelegation(id: number, fromUserId: number): Promise<void> {
  const row = await WorkflowDelegation.findOne({ where: { id, fromUserId, status: 1 } })
  if (!row) throw new Error('委托记录不存在')
  row.status = 0
  await row.save()
}

export async function listMyDelegations(fromUserId: number): Promise<WorkflowDelegation[]> {
  return WorkflowDelegation.findAll({ where: { fromUserId, status: 1 }, order: [['createdAt', 'DESC']] })
}

/** 解析某用户当前有效的委托被委托人 ID（无则返回 null） */
export async function resolveDelegation(userId: number): Promise<number | null> {
  const now = new Date()
  const row = await WorkflowDelegation.findOne({
    where: {
      fromUserId: userId,
      status: 1,
      startAt: { [Op.lte]: now },
      [Op.or]: [{ endAt: null }, { endAt: { [Op.gte]: now } }],
    },
    order: [['createdAt', 'DESC']],
  })
  return row ? row.toUserId : null
}
