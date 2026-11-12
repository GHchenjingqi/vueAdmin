import type { Request, Response, NextFunction } from 'express'
import multer from 'multer'
import * as auditLogService from '../services/auditLogService.js'
import {
  rowsToRawRecords,
  buildPlan,
  parseFile,
  executeImport,
  type ImportError,
  type ImportResult,
} from '../services/productImportService.js'

/** multer memoryStorage：文件在内存解析，不入盘（导入是一次性计算，不长期保存用户原始文件） */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    const name = file.originalname.toLowerCase()
    if (name.endsWith('.csv') || name.endsWith('.xlsx')) cb(null, true)
    else cb(new Error('仅支持 .csv 或 .xlsx 文件'))
  },
})

/** POST /shop/spus/import/preview —— 上传文件解析并预校验（dryRun，不写库） */
export const preview = [
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const file = req.file
      if (!file) {
        res.status(400).json({ code: 400, message: '请上传文件' })
        return
      }
      const rows = await parseFile(file.buffer, file.originalname)
      const { records, header, skippedEmpty } = rowsToRawRecords(rows)
      const plan = buildPlan(records)

      // dryRun 执行：不写库，返回将导入计数
      const dryResult = await executeImport(plan, true)

      res.json({
        code: 0,
        data: {
          filename: file.originalname,
          totalRows: plan.totalRows,
          skippedEmpty,
          header,
          errors: plan.errors,
          willCreateSpus: dryResult.createdSpus,
          willCreateSkus: dryResult.createdSkus,
        },
      })
    } catch (err) {
      next(err)
    }
  },
]

/** POST /shop/spus/import/commit —— 真正执行导入（写库） */
export const commit = [
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const file = req.file
      if (!file) {
        res.status(400).json({ code: 400, message: '请上传文件' })
        return
      }
      const rows = await parseFile(file.buffer, file.originalname)
      const { records } = rowsToRawRecords(rows)
      const plan = buildPlan(records)

      // 有阻断错误时不执行
      if (plan.errors.length > 0) {
        res.status(400).json({
          code: 400,
          message: '文件存在校验错误，请先修正',
          data: { errors: plan.errors },
        })
        return
      }

      const result: ImportResult = await executeImport(plan, false)
      res.json({ code: 0, data: result })

      // 审计日志
      await auditLogService.recordAdminAction(req, 'spu.batch_imported', 'config', null, {
        filename: file.originalname,
        createdSpus: result.createdSpus,
        createdSkus: result.createdSkus,
        failedCount: result.failed.length,
      })
    } catch (err) {
      next(err)
    }
  },
]

/** GET /shop/spus/import-template —— 下载 CSV 模板（表头 + 1 行示例） */
export const template = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const header = [
      'categoryId',
      'slug',
      'name_en',
      'name_zh',
      'description_en',
      'cover',
      'images',
      'skuCode',
      'spec',
      'barcode',
      'hsCode',
      'originCountry',
      'declaredValue',
      'currency',
      'amount',
    ]
    const sample = [
      '1',
      'lace-wig-13x4-body-wave',
      '13x4 Lace Front Body Wave Wig',
      '13x4 蕾丝前额体波假发',
      'Premium human hair body wave wig',
      'https://cdn.example.com/cover.jpg',
      'https://cdn.example.com/1.jpg;https://cdn.example.com/2.jpg',
      'LW-13x4-BW-18',
      'length=18inch;color=Natural Black',
      '6923450657891',
      '6704.20.00',
      'CN',
      '85.00',
      'USD',
      '129.99',
    ]
    const csv = [header.join(','), sample.map((v) => `"${v.replace(/"/g, '""')}"`).join(',')].join('\r\n')

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="product-import-template.csv"')
    // BOM：Excel 直接双击打开时识别 UTF-8
    res.send('\uFEFF' + csv)
  } catch (err) {
    next(err)
  }
}

// multer 错误单独处理（文件过大 / 类型不符）
export function importMulterErrorHandler(err: unknown, _req: Request, res: Response, next: NextFunction): void {
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? '文件大小不能超过 5MB' : err.message
    res.status(400).json({ code: 400, message: msg })
    return
  }
  if (err instanceof Error) {
    res.status(400).json({ code: 400, message: err.message })
    return
  }
  next(err)
}
