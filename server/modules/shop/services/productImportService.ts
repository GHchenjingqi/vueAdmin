import { z } from 'zod'

/**
 * 商品批量导入核心（纯函数，无 IO）
 *
 * 职责：把 CSV/Excel 的二维行数组解析为「按 slug 归并的 SPU 计划 + 行级错误」。
 * - 同一 slug 的多行 → 归并为一个 SPU 的多个 SKU（一行一 SKU）。
 * - 逐行校验字段必填/枚举/数值范围，错误按 { row, field, message } 收集，不中断整批。
 * - buildPlan 纯产出数据，不写库；写库由 executeImport 负责（见 executeImport）。
 * - 图片仅存 URL，不下载（盗链转存留给 1688 阶段）。
 *
 * 约定列（表头大小写不敏感，别名见 COLUMN_ALIASES）：
 *   categoryId* | slug | name_en* | name_zh | description_en | cover |
 *   images(分号分隔) | skuCode* | spec(key=val;key=val) | barcode | hsCode |
 *   originCountry | declaredValue | currency* | amount*
 *   (* 必填)
 */

/** 归一化表头 → 标准列名 */
const COLUMN_ALIASES: Record<string, string> = {
  categoryid: 'categoryId',
  category_id: 'categoryId',
  slug: 'slug',
  name_en: 'nameEn',
  nameen: 'nameEn',
  name_zh: 'nameZh',
  namezh: 'nameZh',
  description_en: 'descriptionEn',
  descriptionen: 'descriptionEn',
  cover: 'cover',
  images: 'images',
  image: 'images',
  skucode: 'skuCode',
  sku_code: 'skuCode',
  code: 'skuCode',
  spec: 'spec',
  barcode: 'barcode',
  hscode: 'hsCode',
  hs_code: 'hsCode',
  origincountry: 'originCountry',
  origin_country: 'originCountry',
  declaredvalue: 'declaredValue',
  declared_value: 'declaredValue',
  currency: 'currency',
  amount: 'amount',
  price: 'amount',
}

export interface ImportError {
  row: number
  field: string | null
  message: string
}

export interface ImportSkuPlan {
  skuCode: string
  spec: Record<string, string> | null
  barcode: string | null
  hsCode: string | null
  originCountry: string | null
  declaredValue: number | null
  price: { currency: string; amount: number } | null
}

export interface ImportSpuPlan {
  slug: string | null
  categoryId: number
  brandId: number | null
  name: Record<string, string>
  description: Record<string, string> | null
  cover: string | null
  images: string[]
  skus: ImportSkuPlan[]
}

export interface ImportPlan {
  spus: ImportSpuPlan[]
  errors: ImportError[]
  /** 有效行数（不含表头，不含纯空行） */
  totalRows: number
}

/** 单行原始解析结果（字符串列，未做类型转换） */
export type RawRow = Record<string, string>

function normalizeHeader(h: string): string {
  return COLUMN_ALIASES[h.trim().toLowerCase()] ?? h.trim()
}

/** 把二维数组（含表头行）转成 RawRow[]；空行跳过；表头缺失列补空串 */
export function rowsToRawRecords(rows: string[][]): { records: RawRow[]; header: string[]; skippedEmpty: number } {
  if (rows.length === 0) return { records: [], header: [], skippedEmpty: 0 }
  const header = rows[0].map(normalizeHeader)
  const records: RawRow[] = []
  let skippedEmpty = 0
  for (let i = 1; i < rows.length; i += 1) {
    const line = rows[i]
    if (!line || line.every((c) => !c || String(c).trim() === '')) {
      skippedEmpty += 1
      continue
    }
    const rec: RawRow = {}
    for (let c = 0; c < header.length; c += 1) {
      const v = line[c]
      rec[header[c]] = v == null ? '' : String(v).trim()
    }
    records.push(rec)
  }
  return { records, header, skippedEmpty }
}

/** 解析 spec 列："color=red;size=M" → { color:'red', size:'M' }；非法项忽略 */
function parseSpec(raw: string): Record<string, string> | null {
  if (!raw) return null
  const out: Record<string, string> = {}
  for (const pair of raw.split(';')) {
    const idx = pair.indexOf('=')
    if (idx <= 0) continue
    const k = pair.slice(0, idx).trim()
    const v = pair.slice(idx + 1).trim()
    if (!k || !v || k.length > 50 || v.length > 200) continue
    out[k] = v
  }
  return Object.keys(out).length ? out : null
}

/** images 列：分号/换行分隔的 URL 列表 */
function parseImages(raw: string): string[] {
  if (!raw) return []
  return raw
    .split(/[;\n]/)
    .map((s) => s.trim())
    .filter((s) => /^https?:\/\//.test(s))
    .slice(0, 20)
}

function isBlank(v: string | undefined): boolean {
  return v == null || v.trim() === ''
}

/** 收集单行错误 */
function pushErr(errors: ImportError[], row: number, field: string | null, message: string): void {
  errors.push({ row, field, message })
}

/** 校验并转换单行为 SPU+SKU 片段；返回 null 表示该行有阻断错误（错误已收集） */
function parseRow(
  rec: RawRow,
  rowNo: number,
  errors: ImportError[],
): { categoryId: number; slug: string | null; name: Record<string, string>; description: Record<string, string> | null; cover: string | null; images: string[]; sku: ImportSkuPlan } | null {
  let ok = true
  // 必填：categoryId
  let categoryId = 0
  if (isBlank(rec.categoryId)) {
    pushErr(errors, rowNo, 'categoryId', 'categoryId 必填')
    ok = false
  } else {
    const n = Number(rec.categoryId)
    if (!Number.isInteger(n) || n < 1) {
      pushErr(errors, rowNo, 'categoryId', 'categoryId 须为正整数')
      ok = false
    } else categoryId = n
  }
  // 必填：name_en（i18nText 至少一个语言）
  const name: Record<string, string> = {}
  if (!isBlank(rec.nameEn)) name.en = rec.nameEn.trim()
  if (!isBlank(rec.nameZh)) name['zh-CN'] = rec.nameZh.trim()
  if (Object.keys(name).length === 0) {
    pushErr(errors, rowNo, 'name_en', '至少需要 name_en（或 name_zh）')
    ok = false
  }
  // 必填：skuCode
  const skuCode = (rec.skuCode ?? '').trim()
  if (!skuCode) {
    pushErr(errors, rowNo, 'skuCode', 'skuCode 必填')
    ok = false
  } else if (skuCode.length > 64) {
    pushErr(errors, rowNo, 'skuCode', 'skuCode 长度不能超过 64')
    ok = false
  }
  // 必填：currency + amount（成对）
  let price: ImportSkuPlan['price'] = null
  const currency = (rec.currency ?? '').trim().toUpperCase()
  const amountRaw = (rec.amount ?? '').trim()
  if (isBlank(rec.currency) && isBlank(rec.amount)) {
    // 两者都空 → 价格可选（导入后后台补），不阻断
  } else if (isBlank(rec.currency) || isBlank(rec.amount)) {
    pushErr(errors, rowNo, 'currency/amount', 'currency 与 amount 必须同时提供')
    ok = false
  } else {
    const amount = Number(amountRaw)
    if (!/^[A-Z]{3}$/.test(currency)) {
      pushErr(errors, rowNo, 'currency', 'currency 须为 3 位大写字母（如 USD）')
      ok = false
    }
    if (!Number.isFinite(amount) || amount < 0) {
      pushErr(errors, rowNo, 'amount', 'amount 须为非负数')
      ok = false
    }
    if (ok || (currency && Number.isFinite(amount))) price = { currency, amount: Math.round(amount * 100) / 100 }
  }
  // slug 格式（可选，留空由后端生成）
  const slugRaw = (rec.slug ?? '').trim().toLowerCase()
  let slug: string | null = null
  if (slugRaw) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slugRaw) || slugRaw.length > 200) {
      pushErr(errors, rowNo, 'slug', 'slug 须为小写字母/数字与连字符，且不以连字符开头结尾，≤200')
      ok = false
    } else slug = slugRaw
  }
  // 可选：cover / descriptionEn / hsCode / originCountry / declaredValue / barcode
  const cover = isBlank(rec.cover) ? null : rec.cover.trim()
  if (cover && !/^https?:\/\//.test(cover)) {
    pushErr(errors, rowNo, 'cover', 'cover 须为 http(s) URL')
    ok = false
  }
  const descriptionEn = isBlank(rec.descriptionEn) ? null : rec.descriptionEn.trim()
  const hsCode = isBlank(rec.hsCode) ? null : rec.hsCode.trim()
  const originCountry = isBlank(rec.originCountry) ? null : rec.originCountry.trim().toUpperCase()
  if (originCountry && !/^[A-Z]{2}$/.test(originCountry)) {
    pushErr(errors, rowNo, 'originCountry', 'originCountry 须为 2 位国家码（如 CN）')
    ok = false
  }
  let declaredValue: number | null = null
  if (!isBlank(rec.declaredValue)) {
    const dv = Number(rec.declaredValue)
    if (!Number.isFinite(dv) || dv < 0) {
      pushErr(errors, rowNo, 'declaredValue', 'declaredValue 须为非负数')
      ok = false
    } else declaredValue = dv
  }
  const barcode = isBlank(rec.barcode) ? null : rec.barcode.trim()

  if (!ok) return null
  return {
    categoryId,
    slug,
    name,
    description: descriptionEn ? { en: descriptionEn } : null,
    cover,
    images: parseImages(rec.images ?? ''),
    sku: {
      skuCode,
      spec: parseSpec(rec.spec ?? ''),
      barcode,
      hsCode,
      originCountry,
      declaredValue,
      price,
    },
  }
}

/** 把 RawRow[] 归并成 ImportPlan（同 slug 多 SKU 归并；slug 空则每行独立 SPU） */
export function buildPlan(records: RawRow[]): ImportPlan {
  const errors: ImportError[] = []
  const totalRows = records.length
  const bySlug = new Map<string, ImportSpuPlan>()
  const orphans: ImportSpuPlan[] = []
  const seenSkuCodes = new Set<string>()

  records.forEach((rec, idx) => {
    const rowNo = idx + 2 // 1-based + 表头占第 1 行
    const parsed = parseRow(rec, rowNo, errors)
    if (!parsed) return
    // SKU 编码批内去重
    if (seenSkuCodes.has(parsed.sku.skuCode)) {
      pushErr(errors, rowNo, 'skuCode', `SKU 编码 ${parsed.sku.skuCode} 在本文件内重复`)
      return
    }
    seenSkuCodes.add(parsed.sku.skuCode)

    const key = parsed.slug ?? `__row_${rowNo}`
    let spu = bySlug.get(key)
    if (!spu) {
      spu = {
        slug: parsed.slug,
        categoryId: parsed.categoryId,
        brandId: null,
        name: parsed.name,
        description: parsed.description,
        cover: parsed.cover,
        images: parsed.images,
        skus: [],
      }
      bySlug.set(key, spu)
      if (!parsed.slug) orphans.push(spu)
    } else {
      // 同 slug 归并：合并 name（后行语言覆盖前行缺失语言）、images
      for (const [k, v] of Object.entries(parsed.name)) if (!spu.name[k]) spu.name[k] = v
      if (!spu.description && parsed.description) spu.description = parsed.description
      if (!spu.cover && parsed.cover) spu.cover = parsed.cover
      for (const img of parsed.images) if (!spu.images.includes(img)) spu.images.push(img)
    }
    spu.skus.push(parsed.sku)
  })

  const spus = [...bySlug.values()]
  return { spus, errors, totalRows }
}

/** zod schema：导入行级字段（供外部复用/文档） */
export const importRowSchema = z.object({
  categoryId: z.number().int().min(1),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(200).optional(),
  nameEn: z.string().min(1).max(2000).optional(),
  nameZh: z.string().min(1).max(2000).optional(),
  skuCode: z.string().min(1).max(64),
  currency: z.string().length(3).optional(),
  amount: z.number().min(0).optional(),
})

// ==================== 执行导入（写库） ====================

import { Op } from 'sequelize'
import { getTenantContext } from '../../tenant/context.js'
import { ShopSpu, ShopSku, ShopProductPrice } from '../models/index.js'
import type { Transaction } from 'sequelize'

export interface ImportResult {
  createdSpus: number
  createdSkus: number
  failed: { skuCode: string; message: string }[]
  /** dryRun=true 时不写库，仅返回将要创建的计数 */
  dryRun: boolean
}

/** slug 冲突兜底：加 -import-<短随机> 后缀（仅导入场景，不改用户原始语义） */
function fallbackSlug(slug: string | null, i: number): string | null {
  if (slug) return slug
  return null // 空 slug 由前台生成式 slug 兜底（C 端已支持）
}

async function ensureSlugAvailable(slug: string | null, tenantId: number, tx: Transaction): Promise<string | null> {
  if (!slug) return null
  const exists = await ShopSpu.count({ where: { slug, tenantId }, transaction: tx })
  if (exists === 0) return slug
  // 冲突：加时间戳后缀
  const ts = Date.now().toString(36)
  const suffixed = `${slug}-import-${ts}`
  const sufExists = await ShopSpu.count({ where: { slug: suffixed, tenantId }, transaction: tx })
  return sufExists === 0 ? suffixed : `${suffixed}-${Math.random().toString(36).slice(2, 6)}`
}

/**
 * 执行导入计划（写库）：
 * - 逐 SPU 开事务：查 slug 可用 → 建 SPU → 建 SKU → 建 price（如有）。
 * - SKU 编码再次冲突（数据库层面）→ 记入 failed，不中断整批。
 * - dryRun=true 不写库，仅返回预计计数（前端预校验用）。
 * 复用 tenant 上下文（getTenantContext），与 spuService/skuService 同一隔离模型。
 */
export async function executeImport(plan: ImportPlan, dryRun = false): Promise<ImportResult> {
  const tenantId = getTenantContext()?.tenantId ?? 1
  const failed: { skuCode: string; message: string }[] = []
  let createdSpus = 0
  let createdSkus = 0

  if (dryRun) {
    for (const spu of plan.spus) createdSkus += spu.skus.length
    return { createdSpus: plan.spus.length, createdSkus, failed: [], dryRun: true }
  }

  const sequelize = ShopSpu.sequelize
  if (!sequelize) throw new Error('sequelize 未初始化')

  for (const spuPlan of plan.spus) {
    try {
      await sequelize.transaction(async (tx) => {
        const finalSlug = await ensureSlugAvailable(spuPlan.slug, tenantId, tx)
        const spu = await ShopSpu.create(
          {
            categoryId: spuPlan.categoryId,
            brandId: null,
            name: spuPlan.name,
            description: spuPlan.description,
            cover: spuPlan.cover,
            images: spuPlan.images.length ? spuPlan.images : null,
            slug: finalSlug,
            status: 'draft',
            tenantId,
          } as never,
          { transaction: tx },
        )
        createdSpus += 1

        for (const skuPlan of spuPlan.skus) {
          try {
            const sku = await ShopSku.create(
              {
                spuId: spu.id,
                code: skuPlan.skuCode,
                spec: skuPlan.spec,
                barcode: skuPlan.barcode,
                originCountry: skuPlan.originCountry,
                hsCode: skuPlan.hsCode,
                declaredValue: skuPlan.declaredValue,
                compliance: null,
                status: 'draft',
                tenantId,
              } as never,
              { transaction: tx },
            )
            createdSkus += 1

            if (skuPlan.price) {
              await ShopProductPrice.create(
                {
                  skuId: sku.id,
                  currency: skuPlan.price.currency,
                  amount: skuPlan.price.amount,
                  rateSnapshotId: null,
                  tenantId,
                } as never,
                { transaction: tx },
              )
            }
          } catch (err) {
            // SKU/price 单条失败不中断 SPU，仅记 failed
            failed.push({ skuCode: skuPlan.skuCode, message: err instanceof Error ? err.message : String(err) })
          }
        }
      })
    } catch (err) {
      // SPU 级失败：把该 SPU 下所有 SKU 记为 failed
      const msg = err instanceof Error ? err.message : String(err)
      for (const skuPlan of spuPlan.skus) failed.push({ skuCode: skuPlan.skuCode, message: msg })
    }
  }

  return { createdSpus, createdSkus, failed, dryRun: false }
}

/** 文件解析：CSV（exceljs 读纯文本）/ XLSX（exceljs 读工作簿）；返回二维行数组 */
export async function parseFile(buffer: Buffer, filename: string): Promise<string[][]> {
  const XLSX = await import('exceljs')
  if (filename.toLowerCase().endsWith('.xlsx')) {
    const wb = new XLSX.Workbook()
    await wb.xlsx.load(buffer as never)
    const ws = wb.worksheets[0]
    if (!ws) return [[]]
    const rows: string[][] = []
    ws.eachRow((row) => {
      const vals: string[] = []
      row.eachCell({ includeEmpty: true }, (cell) => {
        const v = cell.value
        if (v == null) vals.push('')
        else if (typeof v === 'string') vals.push(v)
        else if (typeof v === 'number' || typeof v === 'boolean') vals.push(String(v))
        else if (v instanceof Date) vals.push(v.toISOString())
        else if ('text' in v && typeof (v as { text?: unknown }).text === 'string') vals.push((v as { text: string }).text)
        else if ('result' in v && (v as { result?: unknown }).result != null) vals.push(String((v as { result: unknown }).result))
        else vals.push('')
      })
      rows.push(vals)
    })
    return rows
  }
  // CSV：exceljs 不直接支持，用内置 csv-parse 逻辑（简单逗号分隔 + 引号）
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '')
  return parseCsv(text)
}

/** 简易 CSV 解析（RFC 4180：双引号包裹 + 内嵌逗号/换行/转义引号） */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      field += ch
      i += 1
    } else {
      if (ch === '"') {
        inQuotes = true
        i += 1
      } else if (ch === ',') {
        row.push(field)
        field = ''
        i += 1
      } else if (ch === '\r') {
        i += 1
      } else if (ch === '\n') {
        row.push(field)
        rows.push(row)
        row = []
        field = ''
        i += 1
      } else {
        field += ch
        i += 1
      }
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

