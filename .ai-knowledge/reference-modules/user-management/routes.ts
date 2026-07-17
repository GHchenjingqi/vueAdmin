import { Router } from 'express'
import { authMiddleware } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { paginationSchema, idParamSchema } from '../shared/schemas/common.js'
import { createUserSchema, updateUserSchema } from '../shared/schemas/user.js'
import * as userController from '../controllers/userController.js'

const router = Router()

/**
 * @openapi
 * /users:
 *   get:
 *     tags: [用户管理]
 *     summary: 获取用户列表（分页搜索）
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 10 }
 *       - in: query
 *         name: username
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 成功
 */
router.get('/', authMiddleware, validate(paginationSchema), userController.list)

/**
 * @openapi
 * /users/{id}:
 *   get:
 *     tags: [用户管理]
 *     summary: 获取单个用户
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: 成功
 */
router.get('/:id', authMiddleware, validate(idParamSchema), userController.getById)

/**
 * @openapi
 * /users:
 *   post:
 *     tags: [用户管理]
 *     summary: 创建用户
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password, email]
 *             properties:
 *               username: { type: string }
 *               password: { type: string }
 *               email: { type: string }
 *               nickname: { type: string }
 *               phone: { type: string }
 *               status: { type: integer }
 *               deptId: { type: integer }
 *     responses:
 *       201:
 *         description: 创建成功
 */
router.post('/', authMiddleware, validate(createUserSchema), userController.create)

/**
 * @openapi
 * /users/{id}:
 *   put:
 *     tags: [用户管理]
 *     summary: 更新用户信息
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: 更新成功
 */
router.put('/:id', authMiddleware, validate(updateUserSchema), userController.update)

/**
 * @openapi
 * /users/{id}:
 *   delete:
 *     tags: [用户管理]
 *     summary: 删除用户
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: 删除成功
 */
router.delete('/:id', authMiddleware, userController.remove)

export default router