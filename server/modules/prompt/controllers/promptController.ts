import * as promptService from '../services/promptService.js'

export async function list(req: any, res: any, next: any) {
  try {
    res.json({ code: 0, data: await promptService.listPrompts(req.query) })
  } catch (err) {
    next(err)
  }
}

export async function getById(req: any, res: any, next: any) {
  try {
    res.json({ code: 0, data: await promptService.getPromptById(Number(req.params.id)) })
  } catch (err) {
    next(err)
  }
}

export async function create(req: any, res: any, next: any) {
  try {
    res.status(201).json({ code: 0, data: await promptService.createPrompt(req.body, req.user.id) })
  } catch (err) {
    next(err)
  }
}

export async function update(req: any, res: any, next: any) {
  try {
    res.json({ code: 0, data: await promptService.updatePrompt(Number(req.params.id), req.body) })
  } catch (err) {
    next(err)
  }
}

export async function publish(req: any, res: any, next: any) {
  try {
    res.json({ code: 0, data: await promptService.publishPrompt(Number(req.params.id)) })
  } catch (err) {
    next(err)
  }
}

export async function offline(req: any, res: any, next: any) {
  try {
    res.json({ code: 0, data: await promptService.offlinePrompt(Number(req.params.id)) })
  } catch (err) {
    next(err)
  }
}

export async function remove(req: any, res: any, next: any) {
  try {
    await promptService.deletePrompt(Number(req.params.id))
    res.json({ code: 0, message: '删除成功' })
  } catch (err) {
    next(err)
  }
}

export async function stats(req: any, res: any, next: any) {
  try {
    res.json({ code: 0, data: await promptService.stats() })
  } catch (err) {
    next(err)
  }
}
