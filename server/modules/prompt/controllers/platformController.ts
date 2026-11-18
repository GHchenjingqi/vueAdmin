import * as platformService from '../services/platformService.js'

export async function list(req: any, res: any, next: any) {
  try {
    res.json({ code: 0, data: await platformService.listPlatforms(req.query) })
  } catch (err) {
    next(err)
  }
}

export async function options(req: any, res: any, next: any) {
  try {
    res.json({ code: 0, data: await platformService.listPlatformOptions() })
  } catch (err) {
    next(err)
  }
}

export async function create(req: any, res: any, next: any) {
  try {
    res.status(201).json({ code: 0, data: await platformService.createPlatform(req.body) })
  } catch (err) {
    next(err)
  }
}

export async function update(req: any, res: any, next: any) {
  try {
    res.json({ code: 0, data: await platformService.updatePlatform(Number(req.params.id), req.body) })
  } catch (err) {
    next(err)
  }
}

export async function remove(req: any, res: any, next: any) {
  try {
    await platformService.deletePlatform(Number(req.params.id))
    res.json({ code: 0, message: '删除成功' })
  } catch (err) {
    next(err)
  }
}
