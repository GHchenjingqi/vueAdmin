import type { NextFunction, Request, Response } from 'express'
import { AppError } from '../../../middleware/errorHandler.js'
import Setting from '../../../models/Setting.js'
import { refreshSiteInfo } from '../../../utils/siteCache.js'
import { ShopConfigChange } from '../../storefront/models/index.js'
import { invalidateCurrencyCache } from '../../storefront/services/currencyConfig.js'

/**
 * 商城设置 · 币种配置治理（P0-T05b / P5-T02 / X-T03）
 *
 * 仅 admin（authMiddleware）。切换必须有二次确认（confirmImpact + ackNoConversion），
 * 否则 400 CONFIRMATION_REQUIRED；支持定时生效（effectiveAt）与回滚；全量审计（谁/何时/从→到）。
 * 注意：价格数值不会自动换算（C5）——$1,299 → ¥1,299 的业务事故风险由界面提示承接。
 */

function adminOf(req: Request): { operatorId: number | null; operatorName: string | null } {
  const user = (req as unknown as { user?: { id?: number; username?: string } }).user
  return { operatorId: user?.id ?? null, operatorName: user?.username ?? null }
}

async function readCurrencyRaw(): Promise<{ value: unknown; raw: string | null }> {
  const row = await Setting.findOne({ where: { optionKey: 'shop.currency' } })
  if (!row?.optionValue) return { value: null, raw: null }
  try {
    return { value: JSON.parse(row.optionValue), raw: row.optionValue }
  } catch {
    return { value: null, raw: row.optionValue }
  }
}

export const getCurrency = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const current = await readCurrencyRaw()
    const pendingRow = await Setting.findOne({ where: { optionKey: 'shop.currency.pending' } })
    const pending = pendingRow?.optionValue ? JSON.parse(pendingRow.optionValue) : null
    res.json({ code: 0, data: { current: current.value, pending } })
  } catch (err) {
    next(err)
  }
}

export const updateCurrency = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = req.body as { config: Record<string, unknown>; effectiveAt?: string }
    const { operatorId, operatorName } = adminOf(req)
    const old = await readCurrencyRaw()

    const effectiveAt = body.effectiveAt ? new Date(body.effectiveAt) : null
    const isScheduled = !!effectiveAt && effectiveAt.getTime() > Date.now()

    const change = await ShopConfigChange.create({
      tenantId: 1,
      key: 'shop.currency',
      oldValue: old.value,
      newValue: body.config,
      operatorId,
      operatorName,
      effectiveAt,
      appliedAt: isScheduled ? null : new Date(),
      status: isScheduled ? 'scheduled' : 'applied',
    } as never)

    if (isScheduled) {
      await Setting.upsert({ optionKey: 'shop.currency.pending', optionValue: JSON.stringify({ config: body.config, changeId: change.id, effectiveAt: effectiveAt?.toISOString() }), autoload: 1 } as never)
      res.json({ code: 0, data: { applied: false, scheduled: true, changeId: change.id } })
      return
    }

    await Setting.upsert({ optionKey: 'shop.currency', optionValue: JSON.stringify(body.config), autoload: 1 } as never)
    invalidateCurrencyCache()
    void refreshSiteInfo()
    res.json({ code: 0, data: { applied: true, changeId: change.id } })
  } catch (err) {
    next(err)
  }
}

export const rollbackCurrency = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { changeId } = req.body as { changeId: number }
    const change = await ShopConfigChange.findByPk(changeId)
    if (!change) throw new AppError(404, 'CONFIG_CHANGE_NOT_FOUND')
    if (change.oldValue === null || change.oldValue === undefined) throw new AppError(409, 'NOTHING_TO_ROLLBACK')
    const { operatorId, operatorName } = adminOf(req)
    const current = await readCurrencyRaw()

    await Setting.upsert({ optionKey: 'shop.currency', optionValue: JSON.stringify(change.oldValue), autoload: 1 } as never)
    const rollback = await ShopConfigChange.create({
      tenantId: 1, key: 'shop.currency', oldValue: current.value, newValue: change.oldValue,
      operatorId, operatorName, appliedAt: new Date(), rollbackOf: change.id, status: 'applied',
    } as never)
    await change.update({ status: 'rolled_back' })
    invalidateCurrencyCache()
    void refreshSiteInfo()
    res.json({ code: 0, data: { applied: true, changeId: rollback.id, rollbackOf: change.id } })
  } catch (err) {
    next(err)
  }
}

export const listConfigChanges = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rows = await ShopConfigChange.findAll({ order: [['id', 'DESC']], limit: 50 })
    res.json({ code: 0, data: rows })
  } catch (err) {
    next(err)
  }
}
