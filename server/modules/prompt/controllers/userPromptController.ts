import * as userPromptService from '../services/userPromptService.js'
import { portalUserId } from '../middleware/portalAuth.js'

export async function list(req: any, res: any, next: any) {
  try {
    res.json({ code: 0, data: await userPromptService.listMine(portalUserId(req), req.query) })
  } catch (err) {
    next(err)
  }
}

export async function getById(req: any, res: any, next: any) {
  try {
    res.json({ code: 0, data: await userPromptService.getMine(Number(req.params.id), portalUserId(req)) })
  } catch (err) {
    next(err)
  }
}

export async function create(req: any, res: any, next: any) {
  try {
    res.status(201).json({ code: 0, data: await userPromptService.createUserPrompt(req.body, portalUserId(req)) })
  } catch (err) {
    next(err)
  }
}

export async function update(req: any, res: any, next: any) {
  try {
    res.json({
      code: 0,
      data: await userPromptService.updateUserPrompt(Number(req.params.id), portalUserId(req), req.body),
    })
  } catch (err) {
    next(err)
  }
}

export async function submit(req: any, res: any, next: any) {
  try {
    res.json({ code: 0, data: await userPromptService.submitUserPrompt(Number(req.params.id), portalUserId(req)) })
  } catch (err) {
    next(err)
  }
}

export async function remove(req: any, res: any, next: any) {
  try {
    await userPromptService.deleteUserPrompt(Number(req.params.id), portalUserId(req))
    res.json({ code: 0, message: '删除成功' })
  } catch (err) {
    next(err)
  }
}
