import { Router } from 'express'
import { authMiddleware } from '../middleware/auth.js'
import { validate } from '../middleware/validate.js'
import { paginationSchema, idParamSchema } from '../shared/schemas/common.js'
import { loginSchema, changePasswordSchema, resetPasswordSchema } from '../shared/schemas/auth.js'
import { createUserSchema, updateUserSchema, userQuerySchema } from '../shared/schemas/user.js'

import * as authController from '../controllers/authController.js'
import * as userController from '../controllers/userController.js'
import * as menuController from '../controllers/menuController.js'
import * as settingController from '../controllers/settingController.js'
import * as dictTypeController from '../controllers/dictTypeController.js'
import * as dictDataController from '../controllers/dictDataController.js'
import * as noticeController from '../controllers/noticeController.js'
import * as logController from '../controllers/logController.js'
import * as uploadController from '../controllers/uploadController.js'
import * as dashboardController from '../controllers/dashboardController.js'
import * as deptController from '../controllers/deptController.js'
import * as roleController from '../controllers/roleController.js'
import * as searchController from '../controllers/searchController.js'
import * as messageController from '../controllers/messageController.js'
import * as taskController from '../controllers/taskController.js'
import * as onlineUserController from '../controllers/onlineUserController.js'
import * as serverController from '../controllers/serverController.js'
import aiRoutes from './ai.routes.js'

const router = Router()

// ==================== 公开接口（无需认证） ====================

/**
 * @openapi
 * /auth/captcha:
 *   get:
 *     tags: [认证]
 *     summary: 获取验证码（SVG 图片）
 *     parameters:
 *       - in: query
 *         name: t
 *         schema: { type: string }
 *         description: 时间戳（缓存刷新）
 *     responses:
 *       200:
 *         description: SVG 验证码图片
 *         content:
 *           image/svg+xml:
 *             schema:
 *               type: string
 *               description: SVG 图片内容
 *       429:
 *         description: 请求过于频繁
 */
router.get('/auth/captcha', authController.captcha)

/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [认证]
 *     summary: 用户登录
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username: { type: string, description: 用户名 }
 *               password: { type: string, description: 密码 }
 *               captchaKey: { type: string, description: 验证码 ID }
 *               captchaText: { type: string, description: 验证码内容 }
 *               rememberMe: { type: boolean, description: 记住登录状态 }
 *             example:
 *               username: admin
 *               password: admin123
 *               captchaKey: "abc123"
 *               captchaText: "8A3F"
 *               rememberMe: true
 *     responses:
 *       200:
 *         description: 登录成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 0 }
 *                 data:
 *                   type: object
 *                   properties:
 *                     accessToken: { type: string, description: Access Token }
 *                     refreshToken: { type: string, description: Refresh Token }
 *                     user:
 *                       type: object
 *                       properties:
 *                         id: { type: integer }
 *                         username: { type: string }
 *                         nickname: { type: string }
 *                         avatar: { type: string }
 *       401:
 *         description: 用户名或密码错误
 *       429:
 *         description: 登录尝试过于频繁
 */
router.post('/auth/login', validate(loginSchema), authController.login)

/**
 * @openapi
 * /auth/token:
 *   post:
 *     tags: [认证]
 *     summary: 刷新 Access Token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [refreshToken]
 *             properties:
 *               refreshToken: { type: string, description: Refresh Token }
 *     responses:
 *       200:
 *         description: 刷新成功，返回新的 Token 对
 *       401:
 *         description: Refresh Token 无效或已过期
 */
router.post('/auth/token', authController.refresh)

/**
 * @openapi
 * /auth/session:
 *   delete:
 *     tags: [认证]
 *     summary: 退出登录（删除会话）
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken: { type: string, description: 要删除的 Refresh Token }
 *     responses:
 *       200:
 *         description: 退出成功
 */
router.delete('/auth/session', authController.logout)

/**
 * @openapi
 * /auth/password/forgot:
 *   post:
 *     tags: [认证]
 *     summary: 忘记密码（发送重置邮件）
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email, description: 注册邮箱 }
 *     responses:
 *       200:
 *         description: 重置邮件已发送
 *       404:
 *         description: 邮箱未注册
 */
router.post('/auth/password/forgot', authController.forgotPassword)

/**
 * @openapi
 * /auth/password/reset:
 *   post:
 *     tags: [认证]
 *     summary: 使用重置令牌设置新密码
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, password]
 *             properties:
 *               token: { type: string, description: 重置令牌（邮件中的链接） }
 *               password: { type: string, description: 新密码 }
 *     responses:
 *       200:
 *         description: 密码重置成功
 *       400:
 *         description: 令牌无效或已过期
 */
router.post('/auth/password/reset', validate(resetPasswordSchema), authController.resetPassword)

/**
 * @openapi
 * /auth/password:
 *   patch:
 *     tags: [认证]
 *     summary: 修改当前用户密码
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [oldPassword, newPassword]
 *             properties:
 *               oldPassword: { type: string, description: 旧密码 }
 *               newPassword: { type: string, description: 新密码 }
 *     responses:
 *       200:
 *         description: 密码修改成功
 *       400:
 *         description: 旧密码错误
 */
router.patch('/auth/password', authMiddleware, validate(changePasswordSchema), authController.changePassword)

/**
 * @openapi
 * /auth/sse-ticket:
 *   post:
 *     tags: [认证]
 *     summary: 获取 SSE 一次性连接票据（30 秒有效，仅限一次使用）
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 返回 ticket 字符串
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 0 }
 *                 data:
 *                   type: object
 *                   properties:
 *                     ticket: { type: string, description: 一次性 SSE 连接票据 }
 */
router.post('/auth/sse-ticket', authMiddleware, authController.createSseTicket)

/**
 * @openapi
 * /site/info:
 *   get:
 *     tags: [系统设置]
 *     summary: 获取站点公开信息
 *     responses:
 *       200:
 *         description: 站点信息
 */
router.get('/site/info', settingController.siteInfo)

// ==================== 认证接口 ====================

/**
 * @openapi
 * /auth/profile:
 *   get:
 *     tags: [认证]
 *     summary: 获取当前用户信息
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 用户信息
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data: { $ref: '#/components/schemas/User' }
 */
router.get('/auth/profile', authMiddleware, authController.profile)

// ==================== 全局搜索 ====================

/**
 * @openapi
 * /search:
 *   get:
 *     tags: [搜索]
 *     summary: 全局搜索（按用户菜单权限过滤）
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: keyword
 *         required: true
 *         schema: { type: string }
 *         description: 搜索关键词
 *     responses:
 *       200:
 *         description: 搜索结果
 */
router.get('/search', authMiddleware, searchController.globalSearch)

// ==================== 用户管理 ====================

/**
 * @openapi
 * /users:
 *   get:
 *     tags: [用户管理]
 *     summary: 用户列表（分页、搜索、导出）
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *         description: 页码
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 10 }
 *         description: 每页条数
 *       - in: query
 *         name: keyword
 *         schema: { type: string }
 *         description: 搜索关键词（用户名/昵称/邮箱）
 *       - in: query
 *         name: status
 *         schema: { type: integer, enum: [0, 1] }
 *         description: 状态筛选（0=禁用, 1=启用）
 *       - in: query
 *         name: deptId
 *         schema: { type: integer }
 *         description: 部门 ID
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date }
 *         description: 创建日期起始
 *       - in: query
 *         name: endDate
 *         schema: { type: string, format: date }
 *         description: 创建日期结束
 *       - in: query
 *         name: export
 *         schema: { type: string, enum: ['true'] }
 *         description: 设为 'true' 导出 Excel
 *     responses:
 *       200:
 *         description: 用户列表（分页数据）
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: integer, example: 0 }
 *                 data:
 *                   type: object
 *                   properties:
 *                     list: { type: array, items: { $ref: '#/components/schemas/User' } }
 *                     total: { type: integer, example: 42 }
 *                     page: { type: integer, example: 1 }
 *                     pageSize: { type: integer, example: 10 }
 */
router.get('/users', authMiddleware, validate(userQuerySchema, 'query'), userController.list)

/**
 * @openapi
 * /users/export:
 *   get:
 *     tags: [用户管理]
 *     summary: 导出用户列表 Excel
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Excel 文件下载
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 */
router.get('/users/export', authMiddleware, userController.exportUsers)

/**
 * @openapi
 * /users/template:
 *   get:
 *     tags: [用户管理]
 *     summary: 下载用户导入模板
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Excel 模板文件下载
 */
router.get('/users/template', authMiddleware, userController.downloadTemplate)

/**
 * @openapi
 * /users/import:
 *   post:
 *     tags: [用户管理]
 *     summary: 批量导入用户
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Excel 文件
 *     responses:
 *       200:
 *         description: 导入结果
 */
router.post('/users/import', authMiddleware, userController.importUsers)

/**
 * @openapi
 * /users/{id}/password:
 *   patch:
 *     tags: [用户管理]
 *     summary: 管理员重置用户密码
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
 *             required: [password]
 *             properties:
 *               password: { type: string, description: 新密码 }
 *     responses:
 *       200:
 *         description: 密码重置成功
 */
router.patch('/users/:id/password', authMiddleware, validate(idParamSchema, 'params'), userController.changePassword)

/**
 * @openapi
 * /users/{id}:
 *   get:
 *     tags: [用户管理]
 *     summary: 获取单个用户
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: 用户信息
 */
router.get('/users/:id', authMiddleware, validate(idParamSchema, 'params'), userController.getById)

/**
 * @openapi
 * /users:
 *   post:
 *     tags: [用户管理]
 *     summary: 创建用户
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username: { type: string }
 *               password: { type: string }
 *               email: { type: string }
 *               phone: { type: string }
 *               status: { type: integer }
 *               deptId: { type: integer }
 *               roleIds: { type: array, items: { type: integer } }
 *     responses:
 *       201:
 *         description: 创建成功
 */
router.post('/users', authMiddleware, validate(createUserSchema), userController.create)

/**
 * @openapi
 * /users/{id}:
 *   put:
 *     tags: [用户管理]
 *     summary: 更新用户
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
 *               username: { type: string }
 *               email: { type: string }
 *               phone: { type: string }
 *               avatar: { type: string }
 *               bio: { type: string }
 *               status: { type: integer }
 *               deptId: { type: integer }
 *               roleIds: { type: array, items: { type: integer } }
 *     responses:
 *       200:
 *         description: 更新成功
 */
router.put('/users/:id', authMiddleware, validate(idParamSchema, 'params'), validate(updateUserSchema), userController.update)

/**
 * @openapi
 * /users/batch:
 *   delete:
 *     tags: [用户管理]
 *     summary: 批量删除用户
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ids]
 *             properties:
 *               ids:
 *                 type: array
 *                 items: { type: integer }
 *                 description: 要删除的用户 ID 列表
 *     responses:
 *       200:
 *         description: 批量删除成功
 */
router.delete('/users/batch', authMiddleware, userController.batchRemove)

/**
 * @openapi
 * /users/{id}:
 *   delete:
 *     tags: [用户管理]
 *     summary: 删除用户
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: 用户 ID
 *     responses:
 *       200:
 *         description: 删除成功
 *       404:
 *         description: 用户不存在
 */
router.delete('/users/:id', authMiddleware, validate(idParamSchema, 'params'), userController.remove)

// ==================== 菜单管理 ====================

/**
 * @openapi
 * /menus:
 *   get:
 *     tags: [菜单管理]
 *     summary: 菜单列表（scope=tree 菜单树, scope=options 选项树, scope=admin 后台列表）
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: scope
 *         schema:
 *           type: string
 *           enum: [tree, options, admin]
 *         description: 返回格式
 *     responses:
 *       200:
 *         description: 菜单列表
 */
router.get('/menus', authMiddleware, menuController.list)
// GET /menus/tree - 获取侧边栏菜单树（兼容旧版前端直呼 /menus/tree）
router.get('/menus/tree', authMiddleware, (req, res, next) => {
  req.query.scope = 'tree'
  menuController.list(req, res, next)
})
// GET /menus/options - 获取菜单选项树（兼容旧版前端直呼 /menus/options）
router.get('/menus/options', authMiddleware, (req, res, next) => {
  req.query.scope = 'options'
  menuController.list(req, res, next)
})

/**
 * @openapi
 * /menus/{id}:
 *   get:
 *     tags: [菜单管理]
 *     summary: 获取单个菜单
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: 菜单信息
 */
router.get('/menus/:id', authMiddleware, menuController.getById)

/**
 * @openapi
 * /menus:
 *   post:
 *     tags: [菜单管理]
 *     summary: 创建菜单
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, path, type]
 *             properties:
 *               parentId: { type: integer, description: 父菜单 ID }
 *               name: { type: string, description: 菜单名称 }
 *               path: { type: string, description: 路由路径 }
 *               component: { type: string, description: 组件路径 }
 *               icon: { type: string, description: 图标名称 }
 *               sort: { type: integer, description: 排序号 }
 *               type: { type: string, enum: [M, C, F], description: M=目录, C=菜单, F=按钮 }
 *               permission: { type: string, description: 权限标识 }
 *               status: { type: integer, enum: [0, 1], description: 0=禁用, 1=启用 }
 *               hidden: { type: integer, enum: [0, 1], description: 0=显示, 1=隐藏 }
 *     responses:
 *       201:
 *         description: 创建成功
 */
router.post('/menus', authMiddleware, menuController.create)

/**
 * @openapi
 * /menus/{id}:
 *   put:
 *     tags: [菜单管理]
 *     summary: 更新菜单
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
 *               parentId: { type: integer }
 *               name: { type: string }
 *               path: { type: string }
 *               component: { type: string }
 *               icon: { type: string }
 *               sort: { type: integer }
 *               type: { type: string, enum: [M, C, F] }
 *               permission: { type: string }
 *               status: { type: integer, enum: [0, 1] }
 *               hidden: { type: integer, enum: [0, 1] }
 *     responses:
 *       200:
 *         description: 更新成功
 */
router.put('/menus/:id', authMiddleware, menuController.update)

/**
 * @openapi
 * /menus/{id}:
 *   delete:
 *     tags: [菜单管理]
 *     summary: 删除菜单（同时删除子菜单及关联权限）
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
router.delete('/menus/:id', authMiddleware, menuController.remove)

// ==================== 系统设置 ====================

/**
 * @openapi
 * /settings:
 *   get:
 *     tags: [系统设置]
 *     summary: 获取所有系统设置（键值对映射）
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: key
 *         schema: { type: string }
 *         description: 指定获取单个设置项
 *     responses:
 *       200:
 *         description: 设置键值对映射
 */
router.get('/settings', authMiddleware, settingController.list)

/**
 * @openapi
 * /settings/{key}:
 *   get:
 *     tags: [系统设置]
 *     summary: 获取单个设置项
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 设置值
 *       404:
 *         description: 设置项不存在
 */
router.get('/settings/:key', authMiddleware, settingController.getByKey)

/**
 * @openapi
 * /settings:
 *   put:
 *     tags: [系统设置]
 *     summary: 批量保存系统设置（全量替换）
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: '键值对映射，例如 site_name: 我的站点、watermark_enabled: "1"'
 *             example:
 *               site_name: 我的站点
 *               site_description: Vue Admin 后台管理系统
 *               watermark_enabled: "1"
 *               watermark_text: 内部资料
 *     responses:
 *       200:
 *         description: 保存成功
 */
router.put('/settings', authMiddleware, settingController.save)

/**
 * @openapi
 * /settings/{key}:
 *   delete:
 *     tags: [系统设置]
 *     summary: 删除设置项
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 删除成功
 *       404:
 *         description: 设置项不存在
 */
router.delete('/settings/:key', authMiddleware, settingController.remove)

// ==================== 字典类型管理 ====================

/**
 * @openapi
 * /dict/types:
 *   get:
 *     tags: [字典管理]
 *     summary: 字典类型列表
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: scope
 *         schema: { type: string, enum: [all] }
 *         description: scope=all 获取全部启用类型
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 10 }
 *       - in: query
 *         name: keyword
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 字典类型列表
 */
router.get('/dict/types', authMiddleware, dictTypeController.list)

/**
 * @openapi
 * /dict/types/{id}:
 *   get:
 *     tags: [字典管理]
 *     summary: 获取字典类型详情
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: 字典类型信息
 */
router.get('/dict/types/:id', authMiddleware, dictTypeController.getById)

/**
 * @openapi
 * /dict/types:
 *   post:
 *     tags: [字典管理]
 *     summary: 创建字典类型
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, type]
 *             properties:
 *               name: { type: string, description: 显示名称 }
 *               type: { type: string, description: 字典类型标识 }
 *               status: { type: integer, enum: [0, 1], description: 0=禁用, 1=启用 }
 *               sort: { type: integer, description: 排序号 }
 *               remark: { type: string, description: 备注 }
 *     responses:
 *       201:
 *         description: 创建成功
 */
router.post('/dict/types', authMiddleware, dictTypeController.create)

/**
 * @openapi
 * /dict/types/{id}:
 *   put:
 *     tags: [字典管理]
 *     summary: 更新字典类型
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
 *               type: { type: string }
 *               status: { type: integer, enum: [0, 1] }
 *               sort: { type: integer }
 *               remark: { type: string }
 *     responses:
 *       200:
 *         description: 更新成功
 */
router.put('/dict/types/:id', authMiddleware, dictTypeController.update)

/**
 * @openapi
 * /dict/types/{id}:
 *   delete:
 *     tags: [字典管理]
 *     summary: 删除字典类型（同时删除关联的字典数据）
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
router.delete('/dict/types/:id', authMiddleware, dictTypeController.remove)

/**
 * @openapi
 * /dict/cache/refresh:
 *   post:
 *     tags: [字典管理]
 *     summary: 刷新字典缓存
 *     description: 清空后端内存中的字典选项缓存，下次查询时从数据库重新加载
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 缓存刷新成功
 */
router.post('/dict/cache/refresh', authMiddleware, dictTypeController.refreshCache)

// ==================== 字典数据管理 ====================

/**
 * @openapi
 * /dict/data:
 *   get:
 *     tags: [字典管理]
 *     summary: 字典数据列表
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: scope
 *         schema: { type: string, enum: [options] }
 *         description: scope=options&type=xxx 获取选项列表
 *       - in: query
 *         name: type
 *         schema: { type: string }
 *         description: 字典类型标识（配合 scope=options 使用）
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 10 }
 *       - in: query
 *         name: keyword
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: integer, enum: [0, 1] }
 *     responses:
 *       200:
 *         description: 字典数据列表
 */
router.get('/dict/data', authMiddleware, dictDataController.list)

/**
 * @openapi
 * /dict/data/{id}:
 *   get:
 *     tags: [字典管理]
 *     summary: 获取字典数据详情
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: 字典数据信息
 */
router.get('/dict/data/:id', authMiddleware, dictDataController.getById)

/**
 * @openapi
 * /dict/data:
 *   post:
 *     tags: [字典管理]
 *     summary: 创建字典数据
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [dictTypeId, label, value]
 *             properties:
 *               dictTypeId: { type: integer, description: 所属字典类型 ID }
 *               label: { type: string, description: 显示标签 }
 *               value: { type: string, description: 字典值 }
 *               sort: { type: integer, description: 排序号 }
 *               status: { type: integer, enum: [0, 1], description: 0=禁用, 1=启用 }
 *               remark: { type: string, description: 备注 }
 *     responses:
 *       201:
 *         description: 创建成功
 */
router.post('/dict/data', authMiddleware, dictDataController.create)

/**
 * @openapi
 * /dict/data/{id}:
 *   put:
 *     tags: [字典管理]
 *     summary: 更新字典数据
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
 *               dictTypeId: { type: integer }
 *               label: { type: string }
 *               value: { type: string }
 *               sort: { type: integer }
 *               status: { type: integer, enum: [0, 1] }
 *               remark: { type: string }
 *     responses:
 *       200:
 *         description: 更新成功
 */
router.put('/dict/data/:id', authMiddleware, dictDataController.update)

/**
 * @openapi
 * /dict/data/{id}:
 *   delete:
 *     tags: [字典管理]
 *     summary: 删除字典数据
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
router.delete('/dict/data/:id', authMiddleware, dictDataController.remove)

// ==================== 通知管理 ====================

/**
 * @openapi
 * /notices/sse:
 *   get:
 *     tags: [通知管理]
 *     summary: SSE 实时推送通知（EventSource 连接）
 *     parameters:
 *       - in: query
 *         name: ticket
 *         schema: { type: string }
 *         description: 通过 /auth/sse-ticket 获取的一次性票据（30 秒有效）
 *     responses:
 *       200:
 *         description: SSE 事件流
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *       401:
 *         description: 票据无效或已过期
 */
router.get('/notices/sse', (req, res, next) => {
  const { consumeSseTicket } = authController
  const ticket = req.query.ticket
  if (!ticket || typeof ticket !== 'string') {
    return res.status(401).json({ code: 401, message: '缺少 SSE 连接票据' })
  }
  const userInfo = consumeSseTicket(ticket)
  if (!userInfo) {
    return res.status(401).json({ code: 401, message: 'SSE 连接票据无效或已过期' })
  }
  req.user = userInfo
  next()
}, noticeController.sse)

/**
 * @openapi
 * /notices:
 *   get:
 *     tags: [通知管理]
 *     summary: 通知列表（分页）
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 10 }
 *       - in: query
 *         name: keyword
 *         schema: { type: string }
 *       - in: query
 *         name: view
 *         schema: { type: string, enum: [unread-count] }
 *         description: view=unread-count 获取未读通知数
 *     responses:
 *       200:
 *         description: 通知列表
 */
router.get('/notices', authMiddleware, noticeController.list)
// GET /notices/unread/count - 获取未读通知数（兼容旧版前端直呼此路径）
router.get('/notices/unread/count', authMiddleware, (req, res, next) => {
  req.query.view = 'unread-count'
  noticeController.list(req, res, next)
})

/**
 * @openapi
 * /notices/{id}:
 *   get:
 *     tags: [通知管理]
 *     summary: 获取通知详情
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: 通知信息
 */
router.get('/notices/:id', authMiddleware, noticeController.getById)

/**
 * @openapi
 * /notices:
 *   post:
 *     tags: [通知管理]
 *     summary: 创建通知（可选向指定用户推送）
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, content]
 *             properties:
 *               title: { type: string, description: 通知标题 }
 *               content: { type: string, description: 通知内容 }
 *               type: { type: string, description: 通知类型 }
 *               targetUserIds: { type: array, items: { type: integer }, description: 指定用户 ID 列表（为空则全员推送） }
 *               status: { type: integer, enum: [0, 1], description: 0=草稿, 1=发布 }
 *     responses:
 *       201:
 *         description: 创建成功
 */
router.post('/notices', authMiddleware, noticeController.create)

/**
 * @openapi
 * /notices/{id}:
 *   put:
 *     tags: [通知管理]
 *     summary: 更新通知
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
 *               title: { type: string }
 *               content: { type: string }
 *               type: { type: string }
 *               status: { type: integer, enum: [0, 1] }
 *     responses:
 *       200:
 *         description: 更新成功
 */
router.put('/notices/:id', authMiddleware, noticeController.update)

/**
 * @openapi
 * /notices/{id}:
 *   patch:
 *     tags: [通知管理]
 *     summary: 标记通知为已读
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
 *               isRead: { type: boolean, description: 是否已读 }
 *     responses:
 *       200:
 *         description: 操作成功
 */
router.patch('/notices/:id', authMiddleware, noticeController.update)

/**
 * @openapi
 * /notices:
 *   patch:
 *     tags: [通知管理]
 *     summary: 全部标记为已读
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               readAll: { type: boolean, description: 设为 true 全部已读 }
 *     responses:
 *       200:
 *         description: 操作成功
 */
router.patch('/notices', authMiddleware, noticeController.markAllRead)

/**
 * @openapi
 * /notices/{id}:
 *   delete:
 *     tags: [通知管理]
 *     summary: 删除通知
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
router.delete('/notices/:id', authMiddleware, noticeController.remove)

// ==================== 系统日志 ====================

/**
 * @openapi
 * /logs:
 *   get:
 *     tags: [系统日志]
 *     summary: 日志列表（分页、搜索、导出）
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 10 }
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [login, operation] }
 *         description: 日志类型
 *       - in: query
 *         name: action
 *         schema: { type: string }
 *         description: 操作动作
 *       - in: query
 *         name: keyword
 *         schema: { type: string }
 *         description: 搜索关键词
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: endDate
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: scope
 *         schema: { type: string, enum: [export, stats] }
 *         description: scope=export 导出, scope=stats&type=login-failures 登录失败统计
 *     responses:
 *       200:
 *         description: 日志列表
 */
router.get('/logs', authMiddleware, logController.list)

/**
 * @openapi
 * /logs:
 *   delete:
 *     tags: [系统日志]
 *     summary: 清理过期日志
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: beforeDays
 *         schema: { type: integer, default: 90 }
 *         description: 删除多少天前的日志
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [login, operation] }
 *         description: 日志类型
 *     responses:
 *       200:
 *         description: 清理成功
 */
router.delete('/logs', authMiddleware, logController.cleanup)

/**
 * @openapi
 * /logs/{id}:
 *   get:
 *     tags: [系统日志]
 *     summary: 获取日志详情
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: 日志详情
 */
router.get('/logs/:id', authMiddleware, logController.getById)

// ==================== 文件上传 ====================

/**
 * @openapi
 * /upload:
 *   get:
 *     tags: [文件上传]
 *     summary: 获取上传文件列表
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 文件列表
 */
router.get('/upload', authMiddleware, uploadController.listFiles)
// GET /upload/files - 获取文件列表（兼容旧版前端直呼此路径）
router.get('/upload/files', authMiddleware, uploadController.listFiles)

/**
 * @openapi
 * /upload:
 *   post:
 *     tags: [文件上传]
 *     summary: 上传文件（multipart/form-data）
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: 文件数据
 *               dir:
 *                 type: string
 *                 description: 上传子目录名称（可选）
 *     responses:
 *       201:
 *         description: 上传成功，返回文件信息
 */
router.post('/upload', authMiddleware, uploadController.uploadFile)

/**
 * @openapi
 * /upload/{id}:
 *   delete:
 *     tags: [文件上传]
 *     summary: 删除已上传文件
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
router.delete('/upload/:id', authMiddleware, uploadController.removeFile)

// ==================== 仪表盘 ====================

/**
 * @openapi
 * /dashboard/stats:
 *   get:
 *     tags: [仪表盘]
 *     summary: 获取仪表盘统计数据
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 统计数据（用户数、访问量、在线人数等）
 */
router.get('/dashboard/stats', authMiddleware, dashboardController.getStats)

// ==================== 部门管理 ====================

/**
 * @openapi
 * /departments:
 *   get:
 *     tags: [部门管理]
 *     summary: 部门列表
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: scope
 *         schema: { type: string, enum: [options] }
 *         description: scope=options 获取选项树
 *     responses:
 *       200:
 *         description: 部门列表
 */
router.get('/departments/options', authMiddleware, deptController.options)
router.get('/departments', authMiddleware, deptController.list)

/**
 * @openapi
 * /departments/{id}:
 *   get:
 *     tags: [部门管理]
 *     summary: 获取部门详情
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: 部门信息
 */
router.get('/departments/:id', authMiddleware, deptController.getById)

/**
 * @openapi
 * /departments:
 *   post:
 *     tags: [部门管理]
 *     summary: 创建部门
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               parentId: { type: integer, description: 上级部门 ID }
 *               name: { type: string, description: 部门名称 }
 *               sort: { type: integer, description: 排序号 }
 *               leader: { type: string, description: 负责人 }
 *               phone: { type: string, description: 联系电话 }
 *               email: { type: string, format: email, description: 邮箱 }
 *               status: { type: integer, enum: [0, 1], description: 0=禁用, 1=启用 }
 *     responses:
 *       201:
 *         description: 创建成功
 */
router.post('/departments', authMiddleware, deptController.create)

/**
 * @openapi
 * /departments/{id}:
 *   put:
 *     tags: [部门管理]
 *     summary: 更新部门
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
 *               parentId: { type: integer }
 *               name: { type: string }
 *               sort: { type: integer }
 *               leader: { type: string }
 *               phone: { type: string }
 *               email: { type: string }
 *               status: { type: integer, enum: [0, 1] }
 *     responses:
 *       200:
 *         description: 更新成功
 */
router.put('/departments/:id', authMiddleware, deptController.update)

/**
 * @openapi
 * /departments/{id}:
 *   delete:
 *     tags: [部门管理]
 *     summary: 删除部门（同时删除子部门）
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
router.delete('/departments/:id', authMiddleware, deptController.remove)

// ==================== 角色管理 ====================

/**
 * @openapi
 * /roles:
 *   get:
 *     tags: [角色管理]
 *     summary: 角色列表
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: scope
 *         schema: { type: string, enum: [all] }
 *         description: scope=all 获取所有启用角色
 *     responses:
 *       200:
 *         description: 角色列表
 */
router.get('/roles', authMiddleware, roleController.list)
// GET /roles/all - 获取全部启用角色（兼容旧版前端直呼此路径）
router.get('/roles/all', authMiddleware, (req, res, next) => {
  req.query.scope = 'all'
  roleController.list(req, res, next)
})

/**
 * @openapi
 * /roles/{id}:
 *   get:
 *     tags: [角色管理]
 *     summary: 获取角色详情
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: 角色信息（含关联菜单权限）
 */
router.get('/roles/:id', authMiddleware, roleController.getById)

/**
 * @openapi
 * /roles:
 *   post:
 *     tags: [角色管理]
 *     summary: 创建角色
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, code]
 *             properties:
 *               name: { type: string, description: 角色名称 }
 *               code: { type: string, description: 角色编码 }
 *               status: { type: integer, enum: [0, 1], description: 0=禁用, 1=启用 }
 *               sort: { type: integer, description: 排序号 }
 *               remark: { type: string, description: 备注 }
 *               menuIds: { type: array, items: { type: integer }, description: 关联菜单权限 ID 列表 }
 *     responses:
 *       201:
 *         description: 创建成功
 */
router.post('/roles', authMiddleware, roleController.create)

/**
 * @openapi
 * /roles/{id}:
 *   put:
 *     tags: [角色管理]
 *     summary: 更新角色
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
 *               code: { type: string }
 *               status: { type: integer, enum: [0, 1] }
 *               sort: { type: integer }
 *               remark: { type: string }
 *               menuIds: { type: array, items: { type: integer } }
 *     responses:
 *       200:
 *         description: 更新成功
 */
router.put('/roles/:id', authMiddleware, roleController.update)

/**
 * @openapi
 * /roles/{id}:
 *   delete:
 *     tags: [角色管理]
 *     summary: 删除角色
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
router.delete('/roles/:id', authMiddleware, roleController.remove)

// ==================== 消息通知 ====================

/**
 * @openapi
 * /messages:
 *   get:
 *     tags: [消息通知]
 *     summary: 消息列表
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 10 }
 *       - in: query
 *         name: scope
 *         schema: { type: string, enum: [unread-count] }
 *         description: scope=unread-count 获取未读数
 *     responses:
 *       200:
 *         description: 消息列表
 */
router.get('/messages', authMiddleware, messageController.list)

/**
 * @openapi
 * /messages:
 *   post:
 *     tags: [消息通知]
 *     summary: 发送消息
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, content]
 *             properties:
 *               title: { type: string, description: 消息标题 }
 *               content: { type: string, description: 消息内容 }
 *               type: { type: string, description: 消息类型 }
 *               receiverIds: { type: array, items: { type: integer }, description: 接收者 ID 列表 }
 *     responses:
 *       201:
 *         description: 发送成功
 */
router.post('/messages', authMiddleware, messageController.create)

/**
 * @openapi
 * /messages:
 *   patch:
 *     tags: [消息通知]
 *     summary: 全部标记为已读
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [readAll]
 *             properties:
 *               readAll: { type: boolean }
 *     responses:
 *       200:
 *         description: 操作成功
 */
router.patch('/messages', authMiddleware, messageController.readAll)

/**
 * @openapi
 * /messages/{id}:
 *   patch:
 *     tags: [消息通知]
 *     summary: 标记单条消息为已读
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
 *               isRead: { type: boolean }
 *     responses:
 *       200:
 *         description: 操作成功
 */
router.patch('/messages/:id', authMiddleware, messageController.update)

/**
 * @openapi
 * /messages/{id}:
 *   delete:
 *     tags: [消息通知]
 *     summary: 删除消息
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
router.delete('/messages/:id', authMiddleware, messageController.remove)

// ==================== 定时任务 ====================

/**
 * @openapi
 * /tasks:
 *   get:
 *     tags: [定时任务]
 *     summary: 任务列表
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 任务列表（含运行状态）
 */
router.get('/tasks', authMiddleware, taskController.list)

/**
 * @openapi
 * /tasks:
 *   post:
 *     tags: [定时任务]
 *     summary: 创建任务
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, taskKey, cron, handler]
 *             properties:
 *               name: { type: string, description: 任务名称 }
 *               taskKey: { type: string, description: 任务标识（唯一） }
 *               cron: { type: string, description: Cron 表达式 }
 *               handler: { type: string, description: 任务处理器路径 }
 *               params: { type: string, description: 执行参数（JSON） }
 *               status: { type: integer, enum: [0, 1], description: 0=暂停, 1=启动 }
 *               remark: { type: string, description: 备注 }
 *     responses:
 *       201:
 *         description: 创建成功
 */
router.post('/tasks', authMiddleware, taskController.create)

/**
 * @openapi
 * /tasks/{id}:
 *   put:
 *     tags: [定时任务]
 *     summary: 更新任务
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
 *               cron: { type: string }
 *               handler: { type: string }
 *               params: { type: string }
 *               status: { type: integer, enum: [0, 1] }
 *               remark: { type: string }
 *     responses:
 *       200:
 *         description: 更新成功
 */
router.put('/tasks/:id', authMiddleware, taskController.update)

/**
 * @openapi
 * /tasks/{id}:
 *   delete:
 *     tags: [定时任务]
 *     summary: 删除任务
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
router.delete('/tasks/:id', authMiddleware, taskController.remove)

/**
 * @openapi
 * /tasks/{id}/execute:
 *   post:
 *     tags: [定时任务]
 *     summary: 立即执行一次任务（手动触发）
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: 任务已触发执行
 */
router.post('/tasks/:id/execute', authMiddleware, taskController.execute)

// ==================== 在线用户 ====================

/**
 * @openapi
 * /online-users:
 *   get:
 *     tags: [在线用户]
 *     summary: 在线用户列表
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: scope
 *         schema: { type: string, enum: [count] }
 *         description: scope=count 获取在线人数
 *     responses:
 *       200:
 *         description: 在线用户列表或人数
 */
router.get('/online-users', authMiddleware, onlineUserController.list)

/**
 * @openapi
 * /online-users/{userId}/session:
 *   delete:
 *     tags: [在线用户]
 *     summary: 强制踢出用户下线
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: 踢出成功
 */
router.delete('/online-users/:userId/session', authMiddleware, onlineUserController.kick)

// ==================== 服务监控 ====================

/**
 * @openapi
 * /server/stats:
 *   get:
 *     tags: [服务监控]
 *     summary: 获取服务器实时状态（CPU、内存、磁盘等）
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 服务器状态信息
 */
router.get('/server/stats', authMiddleware, serverController.getStats)

// ==================== AI 助手 ====================
router.use(aiRoutes)

export default router