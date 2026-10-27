/**
 * 委托审批控制器：用户把待办临时委托给他人
 */
import { Op } from 'sequelize'
import User from '../models/User.js'
import { AppError } from '../middleware/errorHandler.js'
import { createDelegation, cancelDelegation, listMyDelegations } from '../services/workflowDelegationService.js'

/** 设置委托（当前用户 → 他人） */
export const setDelegation = async (req, res, next) => {
  try {
    const fromUserId = req.user.id
    const { toUserId, startAt, endAt, remark } = req.body
    if (toUserId === fromUserId) throw new AppError(400, '不能委托给自己')

    const toUser = await User.findByPk(toUserId)
    if (!toUser) throw new AppError(404, '被委托人不存在')

    const delegation = await createDelegation({
      fromUserId,
      toUserId,
      startAt: startAt ? new Date(startAt) : new Date(),
      endAt: endAt ? new Date(endAt) : null,
      remark: remark || null,
    })
    res.json({ code: 0, data: delegation, message: '委托已设置' })
  } catch (err) {
    next(err)
  }
}

/** 我的委托列表 */
export const listDelegations = async (req, res, next) => {
  try {
    const list = await listMyDelegations(req.user.id)
    const enriched = await Promise.all(
      list.map(async (d) => {
        const toUser = await User.findByPk(d.toUserId)
        return { ...d.toJSON(), toUserName: toUser?.nickname || toUser?.username || '-' }
      }),
    )
    res.json({ code: 0, data: enriched })
  } catch (err) {
    next(err)
  }
}

/** 取消委托 */
export const cancelDelegationById = async (req, res, next) => {
  try {
    await cancelDelegation(Number(req.params.id), req.user.id)
    res.json({ code: 0, message: '委托已取消' })
  } catch (err) {
    next(err)
  }
}
