import * as favoriteService from '../services/favoriteService.js'
import { portalUserId } from '../middleware/portalAuth.js'

export async function list(req: any, res: any, next: any) {
  try {
    res.json({ code: 0, data: await favoriteService.listFavorites(portalUserId(req), req.query) })
  } catch (err) {
    next(err)
  }
}

export async function add(req: any, res: any, next: any) {
  try {
    res.json({ code: 0, data: await favoriteService.addFavorite(portalUserId(req), Number(req.params.promptId)) })
  } catch (err) {
    next(err)
  }
}

export async function remove(req: any, res: any, next: any) {
  try {
    res.json({ code: 0, data: await favoriteService.removeFavorite(portalUserId(req), Number(req.params.promptId)) })
  } catch (err) {
    next(err)
  }
}
