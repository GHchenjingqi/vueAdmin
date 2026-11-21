import * as portalService from '../services/portalService.js'
import * as platformService from '../services/platformService.js'
import * as promptService from '../services/promptService.js'
import * as registerService from '../services/registerService.js'
import { portalUserId } from '../middleware/portalAuth.js'

export async function categories(_req: any, res: any, next: any) {
  try {
    res.json({ code: 0, data: await portalService.listPublishedCategories() })
  } catch (err) {
    next(err)
  }
}

export async function platforms(_req: any, res: any, next: any) {
  try {
    res.json({ code: 0, data: await platformService.listPlatformOptions() })
  } catch (err) {
    next(err)
  }
}

/** 投稿表单用：库里已有的模型名（去重），可下拉选择或手动录入新值 */
export async function modelOptions(_req: any, res: any, next: any) {
  try {
    res.json({ code: 0, data: await promptService.listModelOptions() })
  } catch (err) {
    next(err)
  }
}

/** 投稿表单用：可关联的已发布提示词（远程搜索），编辑时排除自身防环 */
export async function parentOptions(req: any, res: any, next: any) {
  try {
    const keyword = req.query.keyword ? String(req.query.keyword) : undefined
    const excludeId = req.query.excludeId ? Number(req.query.excludeId) : undefined
    res.json({ code: 0, data: await promptService.listParentOptions(keyword, excludeId) })
  } catch (err) {
    next(err)
  }
}

export async function list(req: any, res: any, next: any) {
  try {
    res.json({ code: 0, data: await portalService.listPublishedPrompts(req.query, portalUserId(req) || undefined) })
  } catch (err) {
    next(err)
  }
}

export async function detail(req: any, res: any, next: any) {
  try {
    res.json({
      code: 0,
      data: await portalService.getPublishedPrompt(Number(req.params.id), portalUserId(req) || undefined),
    })
  } catch (err) {
    next(err)
  }
}

export async function related(req: any, res: any, next: any) {
  try {
    res.json({
      code: 0,
      data: await portalService.listRelated(Number(req.params.id), portalUserId(req) || undefined),
    })
  } catch (err) {
    next(err)
  }
}

/** 前台注册：写入框架 users 表，随后由前端调用 /auth/login 登录 */
export async function register(req: any, res: any, next: any) {
  try {
    res.status(201).json({ code: 0, data: await registerService.register(req.body) })
  } catch (err) {
    next(err)
  }
}
