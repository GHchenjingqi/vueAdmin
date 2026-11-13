import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'

/**
 * 1688 商品抓取服务
 *
 * 职责：给定 1688 商品详情页 URL，用 Playwright 打开并提取结构化商品数据。
 * 产出 ScrapedProduct，不含 IO 之外的副作用（不写库、不下载图片）。
 *
 * 数据来源（2026-11 实测 https://detail.1688.com/offer/730911221900.html）：
 * - 标题：document.title（格式「{商品标题} - 阿里巴巴」，清洗掉尾巴）。
 * - 主图与阶梯价：mtop.1688.wosc.queryofferskuselectormodel XHR 响应
 *   （skuSelectorModel.mainImageList[].fullPathImageURI + tradeModel.offerPriceRanges[]）。
 *   该响应是页面加载时页面自身发起的合法 XHR，无反爬风险。
 * - window 上无可靠内嵌全局数据（__INIT_PROPS__ 等实测为 null），不走该路径。
 *
 * 设计：
 * - 提取逻辑分纯函数（parse1688Json/parseTitle/parseSkuSelector）与 IO 层，
 *   纯函数可直接单测。
 * - 浏览器允许 SCRAPE_CHROMIUM_PATH 指定可执行文件（部署环境常见需求）。
 * - 每个 URL 独立 browser，超时与导航失败向上抛。
 */

export class ScrapeError extends Error {}

export interface ScrapedSku {
  /** 规格名 → 规格值，如 { 颜色: '红色', 尺码: 'L' } */
  spec: Record<string, string>
  /** 阶梯价最低价（CNY），无则 null */
  price: number | null
}

export interface ScrapedProduct {
  url: string
  title: string
  description: string | null
  /** 主图 + 详情图（远程 URL，未转存） */
  images: string[]
  /** 首图为 cover */
  cover: string | null
  skus: ScrapedSku[]
  /** 1688 一级/二级类目文本，用于后续映射到本地 categoryId */
  categoryPath: string[] | null
}

/** 从 document.title 清洗出商品标题（去掉「 - 阿里巴巴」尾巴） */
export function parseTitle(rawTitle: string | null | undefined): string | null {
  if (!rawTitle) return null
  const cleaned = rawTitle
    .replace(/\s*-\s*阿里巴巴\s*$/, '')
    .replace(/\s*-\s*1688\s*$/, '')
    .trim()
  return cleaned.length >= 2 ? cleaned : null
}

/** 从 SKU selector 响应解析主图与阶梯价（纯函数，可单测） */
export function parseSkuSelector(data: unknown): { images: string[]; skus: ScrapedSku[] } {
  const images: string[] = []
  const skus: ScrapedSku[] = []

  const model = (data as { data?: { skuSelectorBizModel?: { skuSelectorModel?: Record<string, unknown> } } })?.data
    ?.skuSelectorBizModel?.skuSelectorModel
  if (!model || typeof model !== 'object') return { images, skus }

  // 主图
  const mainImageList = (model as Record<string, unknown>).mainImageList
  if (Array.isArray(mainImageList)) {
    for (const img of mainImageList) {
      const uri = (img as Record<string, unknown>)?.fullPathImageURI
      if (typeof uri === 'string' && uri.startsWith('http')) images.push(uri)
    }
  }

  // 阶梯价：tradeModel.offerPriceRanges[] / currentPrices[]，取最低价
  const tradeModel = (model as Record<string, unknown>).tradeModel as Record<string, unknown> | undefined
  const ranges =
    (tradeModel?.offerPriceRanges as unknown[] | undefined) ??
    (tradeModel?.disPriceRanges as unknown[] | undefined) ??
    ((tradeModel?.offerPriceModel as Record<string, unknown> | undefined)?.currentPrices as unknown[] | undefined)

  // 阶梯价语义：取起批价（beginAmount 最小档的单价），不是所有档的最低单价。
  // 1688 阶梯价 beginAmount 越大单价越低；进货成本应按起批价核算。
  let moqPrice: number | null = null
  if (Array.isArray(ranges)) {
    let best: { beginAmount: number; price: number } | null = null
    for (const r of ranges) {
      const rec = r as Record<string, unknown>
      const beginAmount = Number(rec.beginAmount ?? 1)
      const p = Number(rec.discountPrice ?? rec.price)
      if (!Number.isFinite(p) || p <= 0) continue
      if (!best || beginAmount < best.beginAmount) best = { beginAmount, price: p }
    }
    if (best) moqPrice = best.price
  }

  if (moqPrice != null) {
    skus.push({ spec: {}, price: moqPrice })
  }

  return { images, skus }
}

/** 深度查找第一个满足条件的值 */
function deepFind(obj: unknown, predicate: (k: string, v: unknown) => boolean, depth = 0): unknown {
  if (depth > 12 || obj == null || typeof obj !== 'object') return undefined
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (predicate(k, v)) return v
    const nested = deepFind(v, predicate, depth + 1)
    if (nested !== undefined) return nested
  }
  return undefined
}

/** 把商品所有图片 URL 归一化为绝对 https 地址 */
function normalizeImages(arr: unknown): string[] {
  if (!Array.isArray(arr)) return []
  return arr
    .map((u) => {
      if (typeof u !== 'string') return ''
      let s = u.trim()
      if (s.startsWith('//')) s = 'https:' + s
      return s.startsWith('http') ? s : ''
    })
    .filter(Boolean)
}

/**
 * 从 1688 页面内嵌 JSON 解析商品（纯函数，可单测）。
 * 当前 1688 页面无内嵌全局数据，此函数保留用于兜底：
 * 若未来页面结构变化出现可解析的内嵌数据，仍能提取。
 */
export function parse1688Json(data: unknown): Partial<ScrapedProduct> | null {
  if (!data || typeof data !== 'object') return null

  const title = deepFind(data, (k, v) => k === 'subject' && typeof v === 'string' && v.length > 4) as string | undefined
  const images = normalizeImages(deepFind(data, (k, v) => (k === 'images' || k === 'imageList' || k === 'mainImages') && Array.isArray(v)))
  const priceVal = deepFind(data, (k, v) => (k === 'price' || k === 'priceRange') && (typeof v === 'number' || typeof v === 'string')) as number | string | undefined

  const skus: ScrapedSku[] = []
  const skuArr = deepFind(data, (k, v) => (k === 'skuInfos' || k === 'skuList' || k === 'skus') && Array.isArray(v)) as unknown[] | undefined
  if (Array.isArray(skuArr)) {
    for (const s of skuArr) {
      if (s && typeof s === 'object') {
        const rec = s as Record<string, unknown>
        const spec: Record<string, string> = {}
        const props = (rec.props ?? rec.propPath ?? rec.specs) as unknown
        if (typeof props === 'string') {
          for (const part of props.split(/[;；]/)) {
            const [k, v] = part.split(/[:：]/)
            if (k && v) spec[k.trim()] = v.trim()
          }
        } else if (Array.isArray(props)) {
          for (const p of props) {
            if (p && typeof p === 'object') {
              const pp = p as Record<string, unknown>
              const k = String(pp.k ?? pp.name ?? pp.key ?? '')
              const v = String(pp.v ?? pp.value ?? '')
              if (k && v) spec[k] = v
            }
          }
        }
        const price = Number(rec.price ?? rec.minPrice ?? 0) || null
        skus.push({ spec, price })
      }
    }
  }

  return {
    title: title ?? undefined,
    images,
    cover: images[0] ?? undefined,
    skus: skus.length ? skus : [{ spec: {}, price: Number(priceVal) || null }],
    description: null,
    categoryPath: null,
  }
}

/** 抓取单个 1688 商品页 */
export async function scrape1688(url: string, opts?: { timeoutMs?: number }): Promise<ScrapedProduct> {
  const timeoutMs = opts?.timeoutMs ?? 45_000
  let browser: Browser | null = null
  try {
    // 允许通过环境变量指定 Chromium 可执行文件（部署环境常见需求；
    // 未设置时用 Playwright 默认浏览器）
    const executablePath = process.env.SCRAPE_CHROMIUM_PATH || undefined
    browser = await chromium.launch({ headless: true, executablePath })
    const context: BrowserContext = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      locale: 'zh-CN',
      viewport: { width: 1440, height: 900 },
    })
    const page = await context.newPage()

    // 网络层捕获：页面自身发起的 SKU selector XHR 响应（含主图 + 阶梯价）
    let skuSelectorPayload: unknown = null
    page.on('response', async (res) => {
      if (skuSelectorPayload) return
      if (/mtop\.1688\.wosc\.queryofferskuselectormodel/.test(res.url())) {
        try {
          const body = await res.text()
          const m = body.match(/^[^(]*\((.*)\)\s*$/s)
          skuSelectorPayload = JSON.parse(m ? m[1] : body)
        } catch {
          skuSelectorPayload = null
        }
      }
    })

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
    // 等待 XHR 完成与渲染
    await page.waitForTimeout(8000)

    // 标题：document.title
    const rawTitle = await page.title().catch(() => null)
    const title = parseTitle(rawTitle)

    // 主图 + 阶梯价：XHR 捕获
    const parsed = parseSkuSelector(skuSelectorPayload)

    // 兜底：DOM 提取商品图（alicdn ibank 图，排除图标类 svg/tps 小图）
    let images = parsed.images
    if (!images.length) {
      const domImgs = (await page.evaluate(`(() => {
        const set = new Set();
        document.querySelectorAll('img').forEach(i => {
          const s = i.src || '';
          if (/cbu01\\.alicdn\\.com\\/img\\/ibank/.test(s)) set.add(s.split('?')[0].replace(/\\.webp$/, ''));
        });
        return Array.from(set);
      })()`).catch(() => [] as string[])) as string[]
      images = domImgs
    }

    if (!title && !images.length) {
      throw new ScrapeError('抓取失败：未提取到标题或图片（可能被反爬拦截或页面结构变化）')
    }

    return {
      url,
      title: title ?? '未命名商品',
      description: null,
      images,
      cover: images[0] ?? null,
      skus: parsed.skus.length ? parsed.skus : [{ spec: {}, price: null }],
      categoryPath: null,
    }
  } finally {
    await browser?.close()
  }
}

/** 批量抓取（串行，降低被限流概率）；单条失败返回 error 不中断 */
export async function scrape1688Batch(
  urls: string[],
  opts?: { timeoutMs?: number; onProgress?: (done: number, total: number) => void },
): Promise<{ url: string; product: ScrapedProduct | null; error: string | null }[]> {
  const results: { url: string; product: ScrapedProduct | null; error: string | null }[] = []
  let done = 0
  for (const url of urls) {
    try {
      const product = await scrape1688(url, { timeoutMs: opts?.timeoutMs })
      results.push({ url, product, error: null })
    } catch (err) {
      results.push({ url, product: null, error: err instanceof Error ? err.message : String(err) })
    }
    done++
    opts?.onProgress?.(done, urls.length)
  }
  return results
}