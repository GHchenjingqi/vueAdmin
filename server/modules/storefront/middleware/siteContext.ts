import type { NextFunction, Request, Response } from 'express'
import { AppError } from '../../../middleware/errorHandler.js'
import { runInTenant } from '../../tenant/context.js'
import { ShopShop } from '../../shop/models/index.js'

/**
 * Storefront 站点上下文
 *
 * 公开接口不经过 authMiddleware，必须自己建立租户上下文，否则 service 层
 * getTenantContext() 为空会兜底成 tenantId=1，多站点会串数据。
 *
 * 站点 = 后台一条 shops 记录（其 channel 为 type=independent）。
 * 解析顺序：X-Site-Id / query.siteId → shops.id；未提供则回退默认租户 1。
 * 后续接真实域名时把 X-Site-Id 换成 Host → 站点映射即可，其余链路不变。
 */
export interface StorefrontSite {
  tenantId: number
  channelId: number | null
  shopId: number | null
  defaultCurrency: string
  defaultLocale: string
}

const DEFAULT_SITE: StorefrontSite = {
  tenantId: 1,
  channelId: null,
  shopId: null,
  defaultCurrency: 'USD',
  defaultLocale: 'en-US',
}

function parsePositiveInt(raw: unknown): number | undefined {
  if (typeof raw !== 'string' || raw.trim() === '') return undefined
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : undefined
}

function readCredential(credentials: Record<string, unknown> | null, key: string, fallback: string): string {
  const value = credentials?.[key]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback
}

export async function siteContext(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const shopId = parsePositiveInt(req.header('X-Site-Id')) ?? parsePositiveInt(req.query.siteId)
    let site: StorefrontSite = DEFAULT_SITE

    if (shopId !== undefined) {
      // 查站点记录时还没有租户上下文，用 bypass 避免被租户钩子过滤
      const shop = await runInTenant({ tenantId: null, bypass: true }, () => ShopShop.findByPk(shopId))
      if (!shop) throw new AppError(404, '站点不存在')
      site = {
        tenantId: shop.tenantId,
        channelId: shop.channelId,
        shopId: shop.id,
        defaultCurrency: readCredential(shop.credentials, 'defaultCurrency', DEFAULT_SITE.defaultCurrency).toUpperCase(),
        defaultLocale: readCredential(shop.credentials, 'defaultLocale', DEFAULT_SITE.defaultLocale),
      }
    }

    res.locals.site = site
    runInTenant({ tenantId: site.tenantId }, () => next())
  } catch (err) {
    next(err)
  }
}

/** 从 res.locals 取站点上下文（供 controller 使用） */
export function getSite(res: Response): StorefrontSite {
  return (res.locals.site as StorefrontSite | undefined) ?? DEFAULT_SITE
}
