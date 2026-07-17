import { Router } from 'express'
import * as settingController from '../controllers/settingController.js'

const router = Router()

// GET /api/settings - 获取所有设置（键值对映射）
router.get('/', settingController.list)

// GET /api/settings/:key - 获取单个设置
router.get('/:key', settingController.getByKey)

// PATCH /api/settings - 批量保存设置
router.patch('/', settingController.save)

// DELETE /api/settings/:key - 删除设置项
router.delete('/:key', settingController.remove)

export default router