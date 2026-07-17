import { Router } from 'express'
import * as menuController from '../controllers/menuController.js'

const router = Router()

// RESTful 规范: GET /api/menus/tree - 获取侧边栏菜单树
router.get('/tree', menuController.tree)

// RESTful 规范: GET /api/menus/options - 获取菜单选项树
router.get('/options', menuController.options)

// RESTful 规范: GET /api/menus - 获取菜单列表
router.get('/', menuController.list)

// RESTful 规范: GET /api/menus/:id
router.get('/:id', menuController.getById)

// RESTful 规范: POST /api/menus
router.post('/', menuController.create)

// RESTful 规范: PUT /api/menus/:id
router.put('/:id', menuController.update)

// RESTful 规范: DELETE /api/menus/:id
router.delete('/:id', menuController.remove)

export default router