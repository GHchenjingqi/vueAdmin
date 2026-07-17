import { Router } from 'express'
import * as uploadController from '../controllers/uploadController.js'

const router = Router()

// GET /api/upload - 获取已上传的文件列表
router.get('/', uploadController.listFiles)

// POST /api/upload - 上传文件（单文件用 file 字段，批量用 files 字段 + header X-Upload-Batch: true）
router.post('/', uploadController.uploadFile)

// DELETE /api/upload/:id - 删除已上传的文件（id 为文件相对路径）
router.delete('/:id', uploadController.removeFile)

export default router