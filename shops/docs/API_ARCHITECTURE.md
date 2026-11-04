# 商城项目接口架构学习笔记

## 一、项目概览

技术栈：Vue 3 + Vite + TypeScript + Element Plus + Pinia + Express(Sequelize + MySQL)

```
D:\codes\web
├── src/                  ← 前端（已有）
│   ├── api/              ← 接口定义层（按业务领域拆分）
│   ├── utils/request.ts  ← Axios 封装（拦截器/Token/缓存）
│   ├── types/response.ts ← 响应类型定义
│   └── views/shop/       ← 商城前端页面（已有）
├── server/               ← 后端（已有）
│   ├── routes/index.ts   ← 路由总入口（挂载 /api/v1/shop）
│   ├── middleware/       ← auth / validate / errorHandler
│   ├── shared/schemas/   ← Zod Schema（前后端共享）
│   └── modules/shop/     ← 商城后端模块（控制器/服务/模型）
└── shops/                ← 新建子目录（本次交付）
```

---

## 二、接口调用全链路

```
前端页面
  ↓ 调用 xxxApi.method()
src/api/shop.ts
  ↓ request.get/post/put/delete(url, config)
src/utils/request.ts (Axios 实例)
  ↓ baseURL = /api/v1 + Authorization: Bearer <token>
  ↓ GET 缓存检查（requestCache）
Vite 代理 → Express 服务
  ↓ server/routes/index.ts: router.use('/shop', shopRoutes)
server/modules/shop/routes/index.ts
  ↓ authMiddleware → validate(schema) → controller
server/modules/shop/controllers/*.ts
  ↓ 解析 req.body / req.params，调 service
server/modules/shop/services/*.ts
  ↓ 注入 tenantId（租户隔离）
server/modules/shop/models/*.ts (Sequelize)
  ↓ MySQL
```

---

## 三、前端接口定义模式

### 3.1 请求封装（src/utils/request.ts）

- baseURL: `/api/v1`
- 请求拦截器：自动注入 `Bearer token`，GET 请求走缓存
- 响应拦截器：把 `AxiosResponse` 解包为 `ApiResponse<T>`，code !== 0 抛出 `AppError`
- 401 自动刷新 Token（队列机制），强制下线跳转登录页
- HTTP 状态码映射为中文提示

### 3.2 API 文件组织（src/api/*.ts）

每个业务域一个文件，导出一个对象，方法返回 `Promise<ApiResponse<T>>`：

```typescript
// src/api/shop.ts
import request from '@/utils/request'

export const categoryApi = {
  tree() {
    return request.get<CategoryTreeNode[]>('/shop/categories')
  },
  create(data: { parentId: number; name: I18nText }) {
    return request.post<Category>('/shop/categories', data)
  },
  update(id: number, data: Partial<...>) {
    return request.put<Category>(`/shop/categories/${id}`, data)
  },
  remove(id: number) {
    return request.delete<null>(`/shop/categories/${id}`)
  },
}
```

商城 API 集中定义在 `src/api/shop.ts`；`src/api/index.ts` 仅聚合导出 `shopApi`，
其余对象由页面按需从 `@/api/shop` 直接导入。

### 3.3 响应类型

```typescript
// src/types/response.ts
interface ApiResponse<T = unknown> {
  code: number      // 0 = 成功
  data: T
  message?: string
}
```

---

## 四、后端接口注册模式

### 4.1 路由挂载

```
server/routes/index.ts
  └── router.use('/shop', shopRoutes)   ← 挂载到 /api/v1/shop

server/modules/shop/routes/index.ts     ← 商城模块路由
```

### 4.2 路由中间件链

每个接口按顺序经过：

1. `authMiddleware` — 鉴权 + 建立租户上下文
2. `validate(schema, 'body'|'query'|'params')` — Zod 参数校验
3. `controller.method` — 业务处理

### 4.3 控制器模式

```typescript
// server/modules/shop/controllers/categoryController.ts
export const create = async (req, res, next) => {
  try {
    const data = await categoryService.createCategory(req.body)
    res.json({ code: 0, data })
  } catch (err) {
    next(err)   // 统一 errorHandler 处理
  }
}
```

### 4.4 服务层（租户隔离）

```typescript
// server/modules/shop/services/categoryService.ts
import { getTenantContext } from '../../../modules/tenant/context.js'

const tid = (): number => getTenantContext()?.tenantId ?? 1

export async function getCategoryTree() {
  const rows = await ShopCategory.findAll({
    where: { tenantId: tid() },   // ← 显式注入租户 ID
    order: [['sort', 'ASC'], ['id', 'ASC']],
  })
  return buildTree(rows)
}
```

### 4.5 Zod Schema（前后端共享）

```
server/shared/schemas/shop.ts
  ├── i18nTextSchema          ← 多语言文本 { "zh-CN": "...", "en-US": "..." }
  ├── shopPaginationSchema    ← 分页 + keyword（passthrough 保留筛选字段）
  ├── spuStatusSchema         ← 状态机枚举
  ├── createCategorySchema    ← 类目创建
  ├── createSpuSchema         ← SPU 创建
  └── ...
```

---

## 五、商城业务域一览

| 阶段 | 业务域 | 路由前缀 | 前端 API 对象 |
|------|--------|----------|--------------|
| 1 | 类目 | /shop/categories | categoryApi |
| 1 | 品牌 | /shop/brands | brandApi |
| 1 | 属性 | /shop/attributes | attributeApi |
| 1 | SPU（商品） | /shop/spus | spuApi |
| 1 | SKU | /shop/skus | skuApi |
| 1 | 价格（多币种） | /shop/skus/:id/prices | priceApi |
| 1 | 汇率快照 | /shop/rates | rateApi |
| 2 | 渠道 | /shop/channels | channelApi |
| 2 | 店铺 | /shop/shops | shopStoreApi |
| 2 | 渠道商品 | /shop/channel-products | channelProductApi |
| 2 | 发布审批 | /shop/spus/:id/submit-for-publish | publishApi |
| 3 | 仓库 | /shop/warehouses | warehouseApi |
| 3 | 库存 | /shop/inventory | inventoryApi |
| 3 | 订单 | /shop/orders | orderApi |
| 4 | 营销 | /shop/promotions, /shop/coupons | marketingApi |
| 4 | 数据参谋 | /shop/analytics | analyticsApi |

---

## 六、关键设计要点

1. **多语言**：类目/SPU 名称用 `I18nText = Record<string, string>` 存储 JSON，如 `{ "zh-CN": "服饰", "en-US": "Apparel" }`

2. **状态机**：SPU 状态 `draft → review → listed → published → unlisted → archived`，阶段 2 起由工作流审批驱动

3. **多币种定价**：每个 SKU 可挂多个币种价格，通过汇率快照换算 USD 汇总

4. **租户隔离**：所有 service 层查询显式 `where: { tenantId: tid() }`，平台超管兜底 tenantId=1

5. **GET 缓存**：前端 Axios 拦截器自动缓存 GET 请求，非 GET 成功后按 URL 失效缓存

6. **类型安全**：`request.get<T>()` 泛型约束 → 返回 `Promise<ApiResponse<T>>`，TS 编译期校验

---

## 七、新增接口步骤（速查）

**新增后端接口：**
1. `server/shared/schemas/shop.ts` — 定义 Zod Schema
2. `server/modules/shop/models/` — 如需新表，建 Sequelize Model
3. `server/modules/shop/services/` — 写业务逻辑（注入 tenantId）
4. `server/modules/shop/controllers/` — 包装 service，res.json({ code: 0, data })
5. `server/modules/shop/routes/index.ts` — 注册路由 + 中间件链

**新增前端接口：**
1. `src/api/shop.ts` — 定义 interface + API 方法
2. `src/api/index.ts` — 导出新 API 对象（如新建文件）
3. 页面中 `import { xxxApi } from '@/api/shop'` 调用
