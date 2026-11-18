import * as reviewService from '../services/reviewService.js'

export async function list(req: any, res: any, next: any) {
  try {
    res.json({ code: 0, data: await reviewService.listPending(req.query) })
  } catch (err) {
    next(err)
  }
}

export async function approve(req: any, res: any, next: any) {
  try {
    res.json({ code: 0, data: await reviewService.approve(Number(req.params.id), req.user.id) })
  } catch (err) {
    next(err)
  }
}

export async function reject(req: any, res: any, next: any) {
  try {
    res.json({ code: 0, data: await reviewService.reject(Number(req.params.id), req.body.reason, req.user.id) })
  } catch (err) {
    next(err)
  }
}
