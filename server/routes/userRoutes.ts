import { Router } from 'express'
import * as userController from '../controllers/userController.js'

const router = Router()

// GET /api/users - 用户列表
router.get('/', userController.list)

// GET /api/users/:id - 用户详情
router.get('/:id', userController.getById)

// POST /api/users - 创建用户
router.post('/', userController.create)

// PUT /api/users/:id - 更新用户
router.put('/:id', userController.update)

// PATCH /api/users/:id/password - 修改密码（{ oldPassword, password } 自助改密，{ password, reset: true } 管理员重置）
router.patch('/:id/password', userController.changePassword)

// DELETE /api/users/:id - 删除用户
router.delete('/:id', userController.remove)

export default router