/**
 * AI 助手 API 路由
 *
 * 提供 AI 对话、代码生成、代码应用等功能
 * 所有接口需要 JWT 认证
 */

import { Router } from 'express'
import { authMiddleware } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { chatSchema, applySchema } from '../shared/schemas/ai.js'
import { createAiProviderSchema, updateAiProviderSchema, aiProviderQuerySchema, aiProviderIdSchema } from '../shared/schemas/aiProvider.js'
import * as aiController from '../controllers/aiController.js'
import * as aiProviderController from '../controllers/aiProviderController.js'

const router = Router()

// ==================== AI 助手接口 ====================

/**
 * @openapi
 * /ai/status:
 *   get:
 *     tags: [AI助手]
 *     summary: 获取 AI 服务状态
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: API 配置状态和知识库统计
 */
router.get('/ai/status', authMiddleware, aiController.status)

/**
 * @openapi
 * /ai/chat:
 *   post:
 *     tags: [AI助手]
 *     summary: 生成代码对话（支持指定 AI 提供商）
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message]
 *             properties:
 *               message: { type: string, description: 功能需求描述 }
 *               providerId: { type: integer, description: AI 提供商 ID，不传则使用默认提供商 }
 *               model: { type: string, description: 模型名称，可选 }
 *               history: { type: array, description: 对话历史，可选 }
 *     responses:
 *       200:
 *         description: 代码生成结果
 */
router.post('/ai/chat', authMiddleware, validate(chatSchema), aiController.chat)

/**
 * @openapi
 * /ai/apply:
 *   post:
 *     tags: [AI助手]
 *     summary: 将生成的代码应用到项目
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [files]
 *             properties:
 *               files: { type: array, description: 代码文件列表 }
 *               rollback: { type: boolean, description: 是否回滚，默认 false }
 *     responses:
 *       200:
 *         description: 应用结果
 */
router.post('/ai/apply', authMiddleware, validate(applySchema), aiController.apply)

/**
 * @openapi
 * /ai/rebuild-index:
 *   post:
 *     tags: [AI助手]
 *     summary: 重建知识库索引
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 重建结果
 */
router.post('/ai/rebuild-index', authMiddleware, aiController.rebuildIndex)

// ==================== AI 提供商管理接口 ====================

/**
 * @openapi
 * /ai/providers:
 *   get:
 *     tags: [AI提供商]
 *     summary: 获取 AI 提供商列表
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: enabled
 *         schema: { type: integer, enum: [0, 1] }
 *         description: 按状态筛选
 *       - in: query
 *         name: keyword
 *         schema: { type: string }
 *         description: 搜索关键词
 *     responses:
 *       200:
 *         description: 提供商列表
 */
router.get('/ai/providers', authMiddleware, validate(aiProviderQuerySchema, 'query'), aiProviderController.list)

/**
 * @openapi
 * /ai/providers/enabled:
 *   get:
 *     tags: [AI提供商]
 *     summary: 获取启用的 AI 提供商列表（简洁版）
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 启用的提供商列表
 */
router.get('/ai/providers/enabled', authMiddleware, aiProviderController.enabledList)

/**
 * @openapi
 * /ai/providers/{id}:
 *   get:
 *     tags: [AI提供商]
 *     summary: 获取 AI 提供商详情
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: 提供商详情
 */
router.get('/ai/providers/:id', authMiddleware, validate(aiProviderIdSchema, 'params'), aiProviderController.getById)

/**
 * @openapi
 * /ai/providers:
 *   post:
 *     tags: [AI提供商]
 *     summary: 创建 AI 提供商
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, apiBaseUrl, apiKey, models, defaultModel]
 *             properties:
 *               name: { type: string, description: 提供商名称 }
 *               apiBaseUrl: { type: string, description: API 基础地址 }
 *               apiKey: { type: string, description: API Key }
 *               models: { type: string, description: 可用模型列表，逗号分隔 }
 *               defaultModel: { type: string, description: 默认模型 }
 *               enabled: { type: integer, description: 是否启用 }
 *               sort: { type: integer, description: 排序号 }
 *               description: { type: string, description: 备注说明 }
 *     responses:
 *       201:
 *         description: 创建成功
 */
router.post('/ai/providers', authMiddleware, validate(createAiProviderSchema), aiProviderController.create)

/**
 * @openapi
 * /ai/providers/{id}:
 *   put:
 *     tags: [AI提供商]
 *     summary: 更新 AI 提供商
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               apiBaseUrl: { type: string }
 *               apiKey: { type: string }
 *               models: { type: string }
 *               defaultModel: { type: string }
 *               enabled: { type: integer }
 *               sort: { type: integer }
 *               description: { type: string }
 *     responses:
 *       200:
 *         description: 更新成功
 */
router.put('/ai/providers/:id', authMiddleware, validate(aiProviderIdSchema, 'params'), validate(updateAiProviderSchema), aiProviderController.update)

/**
 * @openapi
 * /ai/providers/{id}:
 *   delete:
 *     tags: [AI提供商]
 *     summary: 删除 AI 提供商
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: 删除成功
 */
router.delete('/ai/providers/:id', authMiddleware, validate(aiProviderIdSchema, 'params'), aiProviderController.remove)

export default router