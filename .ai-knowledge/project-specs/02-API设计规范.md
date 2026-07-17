# API 设计规范

## RESTful 风格

### 资源命名
- 使用复数名词：`/api/users`, `/api/roles`, `/api/menus`
- 使用 kebab-case：`/api/dict-types`, `/api/online-users`
- 嵌套资源：`/api/users/:id/roles`, `/api/users/:id/password`

### HTTP 方法
- `GET` - 获取资源（列表/单个）
- `POST` - 创建资源
- `PUT` - 完整更新资源
- `PATCH` - 部分更新资源（如仅修改密码）
- `DELETE` - 删除资源

### 请求参数
- 查询参数（GET）：`?page=1&pageSize=10&keyword=xxx`
- 路径参数：`/api/users/:id`
- 请求体（POST/PUT/PATCH）：JSON 格式

### 分页参数
```
GET /api/users?page=1&pageSize=10&keyword=admin
```
- `page` - 页码，默认 1
- `pageSize` - 每页条数，默认 10，最大 100
- 支持 `keyword` 模糊搜索
- 支持 `startDate`/`endDate` 时间范围筛选
- 支持 `status` 状态筛选

## 响应格式

### 统一响应结构
```json
{
  "code": 0,
  "data": {},
  "message": "操作成功"
}
```

### 成功响应
- `code: 0` 表示成功
- 列表数据：`{ code: 0, data: { list: [...], total: 100 } }`
- 单个数据：`{ code: 0, data: { id: 1, ... } }`
- 创建成功：`HTTP 201`，`{ code: 0, data: { id: 1, ... }, message: "创建成功" }`
- 更新/删除：`{ code: 0, message: "更新成功" }`

### 错误响应
```json
{
  "code": 400,
  "message": "参数校验失败",
  "errors": [
    { "field": "username", "message": "用户名不能为空" }
  ]
}
```

### 认证错误
```json
{
  "code": 401,
  "message": "认证令牌已过期，请重新登录",
  "expired": true
}
```

### 业务错误码
- `400` - 参数校验失败
- `401` - 未认证（无 token、token 过期、token 无效）
- `403` - 无权限
- `404` - 资源不存在
- `409` - 资源冲突（如用户名已存在）
- `429` - 请求频率限制
- `500` - 服务器内部错误

## 认证机制

### JWT 认证
- 登录成功后返回 `accessToken` 和 `refreshToken`
- `accessToken` 有效期：7 天
- `refreshToken` 有效期：30 天
- 所有需要认证的接口在请求头中携带：
  ```
  Authorization: Bearer <accessToken>
  ```
- accessToken 过期后用 refreshToken 换取新的 accessToken

### 验证码
- 登录前需要获取验证码：`GET /api/auth/captcha`
- 返回 SVG 图片和 captchaKey
- 登录时提交 captchaKey 和 captchaText

## 参数校验

### 使用 Zod Schema
```typescript
import { z } from 'zod'

export const createSchema = z.object({
  username: z.string().min(2).max(50),
  email: z.string().email(),
  status: z.number().int().min(0).max(1).default(1),
})
```

### 校验中间件
```typescript
router.post('/users', authMiddleware, validate(createSchema), userController.create)
```

## 文件上传

### 上传接口
- `POST /api/upload/file` - 单文件上传
- 使用 `multipart/form-data` 格式
- 字段名：`file`
- 返回：`{ code: 0, data: { url: "/uploads/xxx.jpg", filename: "xxx.jpg" } }`

### 文件限制
- 图片：最大 5MB，格式 jpg/png/gif/webp
- 导入文件：最大 10MB，格式 xlsx/csv

## 导出接口

### Excel 导出
- `GET /api/users/export?keyword=xxx` - 导出用户列表
- 返回 `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- 使用 ExcelJS 库生成

## API 文档

### OpenAPI 文档
- 使用 `swagger-jsdoc` 生成 OpenAPI 文档
- 使用 JSDoc 注释标记路由
- 文档地址：`/api/docs`（Redoc UI）
- JSON 地址：`/api/docs.json`
- 每个路由必须包含 `@openapi` 注释块

### 注释格式
```typescript
/**
 * @openapi
 * /users:
 *   get:
 *     tags: [用户管理]
 *     summary: 获取用户列表
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 10 }
 *     responses:
 *       200:
 *         description: 成功
 */
router.get('/users', authMiddleware, validate(paginationSchema), userController.list)
```

## 接口列表

### 认证模块
- `POST /api/auth/captcha` - 获取验证码
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/refresh` - 刷新 token
- `POST /api/auth/logout` - 退出登录
- `GET /api/auth/me` - 获取当前用户信息

### 用户管理
- `GET /api/users` - 用户列表
- `GET /api/users/:id` - 用户详情
- `POST /api/users` - 创建用户
- `PUT /api/users/:id` - 更新用户
- `DELETE /api/users/:id` - 删除用户
- `PATCH /api/users/:id/password` - 修改密码

### 角色管理
- `GET /api/roles` - 角色列表
- `GET /api/roles/:id` - 角色详情
- `POST /api/roles` - 创建角色
- `PUT /api/roles/:id` - 更新角色
- `DELETE /api/roles/:id` - 删除角色

### 菜单管理
- `GET /api/menus` - 菜单树
- `POST /api/menus` - 创建菜单
- `PUT /api/menus/:id` - 更新菜单
- `DELETE /api/menus/:id` - 删除菜单

### 部门管理
- `GET /api/depts` - 部门树
- `POST /api/depts` - 创建部门
- `PUT /api/depts/:id` - 更新部门
- `DELETE /api/depts/:id` - 删除部门

### 数据字典
- `GET /api/dict-types` - 字典类型列表
- `POST /api/dict-types` - 创建字典类型
- `PUT /api/dict-types/:id` - 更新字典类型
- `DELETE /api/dict-types/:id` - 删除字典类型
- `GET /api/dict-data` - 字典数据列表
- `POST /api/dict-data` - 创建字典数据
- `PUT /api/dict-data/:id` - 更新字典数据
- `DELETE /api/dict-data/:id` - 删除字典数据