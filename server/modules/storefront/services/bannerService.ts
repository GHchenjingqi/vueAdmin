import { Op } from 'sequelize'
import { ShopBanner } from '../../shop/models/index.js'
import type { StorefrontSite } from '../middleware/siteContext.js'
import { getTenantContext } from '../../tenant/context.js'

/**
 * 首页 Banner CMS 服务
 *
 * 前台：listBanners —— 仅 enabled + 当前时间在 [startAt,endAt] 区间，按 position + sortOrder。
 * 后台：listAllBanners / createBanner / updateBanner / deleteBanner。
 * 站点隔离对齐 cmsService：siteId = site.shopId ?? 0（默认站点为 0）。
 */

export interface BannerView {
  id: number
  position: string
  title: string
  subtitle: string | null
  linkUrl: string | null
  buttonLabel: string | null
  image: string
  sortOrder: number
}

export interface BannerListQuery {
  position?: 'hero' | 'secondary'
}

function tid(site?: StorefrontSite): number {
  return site?.tenantId ?? getTenantContext()?.tenantId ?? 1
}

function siteIdOf(site: StorefrontSite): number {
  return site.shopId ?? 0
}

/** 当前时间是否落在 [startAt,endAt] 展示窗口内（空边界=无限制） */
function inWindow(row: { startAt: Date | null; endAt: Date | null }): boolean {
  const now = new Date()
  if (row.startAt && now < new Date(row.startAt)) return false
  if (row.endAt && now > new Date(row.endAt)) return false
  return true
}

function toView(r: ShopBanner): BannerView {
  return {
    id: r.id,
    position: r.position,
    title: r.title,
    subtitle: r.subtitle,
    linkUrl: r.linkUrl,
    buttonLabel: r.buttonLabel,
    image: r.image,
    sortOrder: r.sortOrder,
  }
}

/** GET 前台：按 position 过滤 + 启用 + 时段窗口 + 排序 */
export async function listBanners(site: StorefrontSite, q: BannerListQuery = {}): Promise<BannerView[]> {
  const where: Record<string, unknown> = { tenantId: tid(site), siteId: siteIdOf(site), enabled: true }
  if (q.position) where.position = q.position

  const rows = await ShopBanner.findAll({
    where,
    order: [
      ['sortOrder', 'DESC'],
      ['id', 'DESC'],
    ],
  })
  return rows.filter(inWindow).map(toView)
}

/** 后台列表：含未启用，可按 position 过滤 */
export async function listAllBanners(
  site: StorefrontSite,
  q: BannerListQuery = {},
): Promise<BannerView[]> {
  const where: Record<string, unknown> = { tenantId: tid(site), siteId: siteIdOf(site) }
  if (q.position) where.position = q.position
  const rows = await ShopBanner.findAll({
    where,
    order: [
      ['sortOrder', 'DESC'],
      ['id', 'DESC'],
    ],
  })
  return rows.map(toView)
}

export interface BannerCreateInput {
  position?: 'hero' | 'secondary'
  title: string
  subtitle?: string | null
  linkUrl?: string | null
  buttonLabel?: string | null
  image: string
  enabled?: boolean
  sortOrder?: number
  startAt?: Date | string | null
  endAt?: Date | string | null
}

export async function createBanner(
  site: StorefrontSite,
  input: BannerCreateInput,
): Promise<{ id: number }> {
  const row = await ShopBanner.create({
    tenantId: tid(site),
    siteId: siteIdOf(site),
    position: input.position ?? 'hero',
    title: input.title,
    subtitle: input.subtitle ?? null,
    linkUrl: input.linkUrl ?? null,
    buttonLabel: input.buttonLabel ?? null,
    image: input.image,
    enabled: input.enabled ?? true,
    sortOrder: input.sortOrder ?? 0,
    startAt: input.startAt ? new Date(input.startAt) : null,
    endAt: input.endAt ? new Date(input.endAt) : null,
  })
  return { id: row.id }
}

export interface BannerUpdateInput {
  position?: 'hero' | 'secondary'
  title?: string
  subtitle?: string | null
  linkUrl?: string | null
  buttonLabel?: string | null
  image?: string
  enabled?: boolean
  sortOrder?: number
  startAt?: Date | string | null
  endAt?: Date | string | null
}

async function findAdminBanner(site: StorefrontSite, id: number): Promise<ShopBanner> {
  const row = await ShopBanner.findOne({ where: { id, tenantId: tid(site), siteId: siteIdOf(site) } })
  if (!row) {
    const err = new Error('banner not found') as Error & { statusCode?: number }
    err.statusCode = 404
    throw err
  }
  return row
}

export async function updateBanner(
  site: StorefrontSite,
  id: number,
  input: BannerUpdateInput,
): Promise<{ id: number }> {
  const row = await findAdminBanner(site, id)
  await row.update({
    ...(input.position !== undefined ? { position: input.position } : {}),
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.subtitle !== undefined ? { subtitle: input.subtitle } : {}),
    ...(input.linkUrl !== undefined ? { linkUrl: input.linkUrl } : {}),
    ...(input.buttonLabel !== undefined ? { buttonLabel: input.buttonLabel } : {}),
    ...(input.image !== undefined ? { image: input.image } : {}),
    ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    ...(input.startAt !== undefined ? { startAt: input.startAt ? new Date(input.startAt) : null } : {}),
    ...(input.endAt !== undefined ? { endAt: input.endAt ? new Date(input.endAt) : null } : {}),
  })
  return { id: row.id }
}

export async function deleteBanner(site: StorefrontSite, id: number): Promise<{ id: number }> {
  const row = await findAdminBanner(site, id)
  await row.destroy()
  return { id }
}
