import type { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import * as auditLogService from '../services/auditLogService.js'
import { scrape1688Batch } from '../services/scrape1688Service.js'
import { transferImages } from '../services/imageTransferService.js'
import { executeImport } from '../services/productImportService.js'
import { makeSlug } from '../utils/scrape1688.js'

/**
 * 1688 采集控制器
 *
 * 两步流程（与批量导入 preview/commit 同构）：
 *  1) POST /shop/spus/scrape-1688/preview  —— 传 1688 URL 列表，抓取 + 图片转存，
 *     返回结构化预览（不写库）。
 *  2) POST /shop/spus/scrape-1688/commit   —— 传 preview 结果 + 每个商品的目标类目，
 *     复用 executeImport 写库（draft 状态）。
 *
 * 图片在 preview 阶段即下载到本地（imageTransferService），commit 只写 URL，
 * 保证"采集完成即图片已本地化"，不依赖人工上传。
 */

/** 仅接受 1688 商品详情页链接（防 SSRF：Playwright 不应打开任意 URL） */
const offerUrlSchema = z
  .string()
  .url()
  .refine((u) => /^https:\/\/(detail|m)\.1688\.com\/offer\/\d+\.html/.test(u), {
    message: '仅支持 1688 商品详情页链接（detail.1688.com/offer/xxx.html）',
  })

const previewSchema = z.object({
  urls: z.array(offerUrlSchema).min(1).max(20),
})

const commitSchema = z.object({
  items: z
    .array(
      z.object({
        url: offerUrlSchema,
        title: z.string().min(1),
        description: z.string().nullable().optional(),
        cover: z.string().nullable().optional(),
        images: z.array(z.string()).default([]),
        categoryId: z.number().int().positive(),
        skus: z
          .array(
            z.object({
              spec: z.record(z.string()).default({}),
              price: z.number().nullable().optional(),
            }),
          )
          .min(1),
      }),
    )
    .min(1)
    .max(20),
  /** 汇率：CNY → 站点默认币种，默认 1（直接存 CNY 数值） */
  fxRate: z.number().positive().default(1),
  /** 目标币种，默认 CNY */
  currency: z.string().length(3).default('CNY'),
})

/** POST /shop/spus/scrape-1688/preview */
export const scrapePreview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = previewSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ code: 400, message: '参数错误', data: { errors: parsed.error.flatten().fieldErrors } })
      return
    }
    const { urls } = parsed.data

    const scraped = await scrape1688Batch(urls)

    // 图片转存（每个商品并行度 3，商品之间串行避免并发过高）
    const items = []
    for (const r of scraped) {
      if (!r.product) {
        items.push({ url: r.url, error: r.error, product: null })
        continue
      }
      const slug = makeSlug(r.product.title, r.url)
      const transferred = await transferImages(r.product.images, slug)
      const okImages = transferred.filter((t) => !t.error).map((t) => t.url)
      const cover = transferred.find((t) => !t.error)?.url ?? null
      items.push({
        url: r.url,
        error: null,
        product: {
          slug,
          title: r.product.title,
          description: r.product.description,
          cover,
          images: okImages,
          skus: r.product.skus,
          categoryPath: r.product.categoryPath,
          imageErrors: transferred.filter((t) => t.error).map((t) => ({ url: t.url, error: t.error })),
        },
      })
    }

    res.json({
      code: 0,
      data: {
        total: items.length,
        succeeded: items.filter((i) => i.product).length,
        failed: items.filter((i) => !i.product).length,
        items,
      },
    })
  } catch (err) {
    next(err)
  }
}

/** POST /shop/spus/scrape-1688/commit */
export const scrapeCommit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parsed = commitSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ code: 400, message: '参数错误', data: { errors: parsed.error.flatten().fieldErrors } })
      return
    }
    const { items, fxRate, currency } = parsed.data

    // 转成 executeImport 的 ImportPlan 形状
    const spus = items.map((it) => ({
      slug: makeSlug(it.title, it.url),
      categoryId: it.categoryId,
      brandId: null,
      name: { zh: it.title, en: it.title },
      description: it.description ? { zh: it.description, en: it.description } : null,
      cover: it.cover ?? null,
      images: it.images,
      skus: it.skus.map((sku, i) => ({
        skuCode: `C1688-${extractOfferId(it.url) ?? makeSlug(it.title, it.url).slice(0, 20)}-${i + 1}`.toUpperCase(),
        spec: Object.keys(sku.spec).length ? sku.spec : null,
        barcode: null,
        hsCode: null,
        originCountry: null,
        declaredValue: null,
        price: sku.price != null ? { currency, amount: Math.round(sku.price * fxRate * 100) / 100 } : null,
      })),
    }))

    const result = await executeImport({ spus, errors: [], totalRows: spus.length }, false)
    res.json({ code: 0, data: result })

    await auditLogService.recordAdminAction(req, 'spu.scraped_from_1688', 'config', null, {
      total: items.length,
      createdSpus: result.createdSpus,
      createdSkus: result.createdSkus,
      failedCount: result.failed.length,
    })
  } catch (err) {
    next(err)
  }
}
