import { AppError } from '../../../middleware/errorHandler.js'
import { getTenantContext } from '../../tenant/context.js'
import { ShopWarehouse, ShopInventory } from '../models/index.js'

/**
 * 仓库路由规则（P5-T04 多仓与更精细配送策略）。
 *
 * - 路由顺序：区域命中（servedCountries 白名单命中 / 未配置=服务全部）→ priority 升序 → 可用量降序；
 * - 同一 SKU 多仓发货的库存口径：以 inventoryService.occupy 的「跨仓聚合 + 行锁」为准
 *   （本服务只做路由决策与配送承诺，不改变库存口径），保证 available = Σ(quantity - locked) 一致；
 * - 配送承诺按仓计算：取路由后的主仓 deliveryEstimateDays 作为该单/该 SKU 的配送承诺。
 */

const tid = (): number => getTenantContext()?.tenantId ?? 1

export interface RoutedWarehouse {
  warehouseId: number
  warehouseName: string
  warehouseType: string
  country: string
  priority: number
  deliveryEstimateDays: number
  available: number
  /** 是否命中目的国区域（无目的国/未配置白名单 → true） */
  servesCountry: boolean
}

export interface DeliveryCommitment {
  warehouseId: number
  warehouseName: string
  warehouseType: string
  deliveryEstimateDays: number
  available: number
}

function servedIncludes(served: unknown, country: string | null | undefined): boolean {
  if (!country) return true
  if (!Array.isArray(served) || served.length === 0) return true
  return served.includes(country)
}

/** 对某 SKU 的库存分布做路由排序（含区域命中 / 优先级 / 可用量） */
export async function routeWarehouses(skuId: number, country?: string | null): Promise<RoutedWarehouse[]> {
  const tId = tid()
  const inv = await ShopInventory.findAll({ where: { skuId, tenantId: tId } })
  if (inv.length === 0) return []
  const whs = await ShopWarehouse.findAll({ where: { id: inv.map((i) => i.warehouseId), tenantId: tId } })
  const whMap = new Map<number, ShopWarehouse>(whs.map((w) => [w.id, w]))
  const rows: RoutedWarehouse[] = inv.map((i) => {
    const w = whMap.get(i.warehouseId)
    return {
      warehouseId: i.warehouseId,
      warehouseName: w?.name ?? '',
      warehouseType: w?.type ?? 'direct',
      country: w?.country ?? 'CN',
      priority: w?.priority ?? 100,
      deliveryEstimateDays: w?.deliveryEstimateDays ?? 5,
      available: i.quantity - i.locked,
      servesCountry: servedIncludes(w?.servedCountries, country),
    }
  })
  rows.sort(
    (a, b) =>
      Number(b.servesCountry) - Number(a.servesCountry) ||
      a.priority - b.priority ||
      b.available - a.available,
  )
  return rows
}

/** P5-T04 修复：承诺仓与发货仓共用同一选仓口径（首个有货仓；全无货时回退 rows[0]） */
function primaryWarehouse(rows: RoutedWarehouse[]): RoutedWarehouse | undefined {
  return rows.find((r) => r.available > 0) ?? rows[0]
}

/** 为某 SKU 选取路由后的主仓（优先有货且区域命中的仓库） */
export async function pickWarehouse(skuId: number, country?: string | null): Promise<number> {
  const rows = await routeWarehouses(skuId, country)
  const withStock = primaryWarehouse(rows)
  if (!withStock || withStock.available <= 0) throw new AppError(400, `SKU ${skuId} 无可用库存`)
  return withStock.warehouseId
}

/** 按仓配送承诺：取路由后的主仓（区域命中 + 优先级 + 可用量），与实际发货仓一致 */
export async function getDeliveryCommitment(
  skuId: number,
  country?: string | null,
): Promise<DeliveryCommitment | null> {
  const rows = await routeWarehouses(skuId, country)
  const primary = primaryWarehouse(rows)
  if (!primary) return null
  return {
    warehouseId: primary.warehouseId,
    warehouseName: primary.warehouseName,
    warehouseType: primary.warehouseType,
    deliveryEstimateDays: primary.deliveryEstimateDays,
    available: primary.available,
  }
}
