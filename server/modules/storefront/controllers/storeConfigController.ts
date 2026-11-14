import type { NextFunction, Request, Response } from 'express'
import Setting from '../../../models/Setting.js'
import { getSite } from '../middleware/siteContext.js'
import { getActiveCurrencyMonitored } from '../services/currencyConfig.js'

/**
 * GET /api/storefront/v1/store-config（P1-T06 → PLAN 5.4）
 *
 * 下发：{currency, market, version, siteName}
 *
 * siteName 来自系统设置 `site_title`（后台「站点标题」），用于 C 端标题模板、
 * og:site_name 与 Organization 结构化数据。此前这些位置**硬编码** 'Aurora Hair Studio'，
 * 多站点/换品牌时需要改代码发版。
 *
 * 回退链：settings.site_title → 环境变量 SITE_NAME → 'Aurora Hair Studio'。
 * 不回退为空串：titleTemplate 拼出 "xxx · " 的残缺标题比沿用默认更糟。
 */

const FALLBACK_SITE_NAME = 'Aurora Hair Studio'

async function resolveSiteName(): Promise<string> {
  try {
    const row = await Setting.findOne({ where: { optionKey: 'site_title' } })
    const raw = row?.optionValue
    if (typeof raw === 'string') {
      // settings 可能存 JSON 字符串（"xxx"）或裸文本，两种都兼容
      let value = raw.trim()
      if (value.startsWith('"') && value.endsWith('"')) {
        try {
          value = String(JSON.parse(value))
        } catch {
          /* 解析失败按裸文本处理 */
        }
      }
      if (value) return value.slice(0, 100)
    }
  } catch {
    // 设置表不可读时不阻断站点渲染
  }
  const envName = (process.env.SITE_NAME ?? '').trim()
  return envName || FALLBACK_SITE_NAME
}

export const config = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const site = getSite(res)
    const currency = await getActiveCurrencyMonitored()
    const siteName = await resolveSiteName()
    res.set('Cache-Control', 'public, max-age=30, stale-while-revalidate=30')
    res.json({
      code: 0,
      data: {
        currency,
        market: { country: 'US', language: site.defaultLocale },
        siteName,
        version: new Date().toISOString(),
      },
    })
  } catch (err) {
    next(err)
  }
}
