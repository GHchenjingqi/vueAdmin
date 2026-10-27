/**
 * 常用驳回理由控制器：从硬编码改为数据库可维护。
 * 列表返回全部（含停用），前端按 enabled 过滤为预设；维护接口供运营/管理员增删改。
 */
import WorkflowRejectReason from '../models/WorkflowRejectReason.js'
import { AppError } from '../middleware/errorHandler.js'

/** 列表（全部，按 sort 升序） */
export const listRejectReasons = async (_req: any, res: any, next: any) => {
  try {
    const list = await WorkflowRejectReason.findAll({ order: [['sort', 'ASC'], ['id', 'ASC']] })
    res.json({ code: 0, data: list, message: 'ok' })
  } catch (err) {
    next(err)
  }
}

/** 新增 */
export const createRejectReason = async (req: any, res: any, next: any) => {
  try {
    const { content, sort, enabled } = req.body
    const reason = await WorkflowRejectReason.create({
      content,
      sort: sort ?? 0,
      enabled: enabled ?? 1,
      createdBy: req.user?.id ?? null,
    })
    res.json({ code: 0, data: reason, message: '已添加' })
  } catch (err) {
    next(err)
  }
}

/** 修改 */
export const updateRejectReason = async (req: any, res: any, next: any) => {
  try {
    const id = Number(req.params.id)
    const reason = await WorkflowRejectReason.findByPk(id)
    if (!reason) throw new AppError(404, '理由不存在')
    const { content, sort, enabled } = req.body
    if (content !== undefined) reason.content = content
    if (sort !== undefined) reason.sort = sort
    if (enabled !== undefined) reason.enabled = enabled
    await reason.save()
    res.json({ code: 0, data: reason, message: '已更新' })
  } catch (err) {
    next(err)
  }
}

/** 删除 */
export const deleteRejectReason = async (req: any, res: any, next: any) => {
  try {
    const id = Number(req.params.id)
    const deleted = await WorkflowRejectReason.destroy({ where: { id } })
    if (!deleted) throw new AppError(404, '理由不存在')
    res.json({ code: 0, message: '已删除' })
  } catch (err) {
    next(err)
  }
}
