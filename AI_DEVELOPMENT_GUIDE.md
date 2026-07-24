# AI 助手项目开发规范

> 本文档供 AI 代码助手读取，用于理解项目的架构、约定和编码规范，以便在协助开发时遵循正确的模式。

---

## 一、项目概述

- **项目名称**：vue-admin（后台管理系统）
- **版本**：1.0.0
- **技术栈**：Vue 3 + TypeScript + Element Plus + Pinia + Vue Router 4 + Axios + ECharts + AI 代码生成助手
- **构建工具**：Vite 6
- **包管理**：npm
- **Node 版本**：参见 `.nvmrc`

### 技术栈详解

| 类别 | 技术 | 版本 | 说明 |
|------|------|------|------|
| 框架 | Vue | ^3.4.0 | Composition API + `<script setup>` |
| 语言 | TypeScript | ~5.8 | strict 模式开启 |
| UI 库 | Element Plus | ^2.7.0 | 按需自动导入 |
| 状态管理 | Pinia | ^3.0.4 | 组合式 API 风格 |
| 路由 | Vue Router | ^4.3.0 | 动态路由 + 懒加载 |
| HTTP | Axios | ^1.7.0 | 封装拦截器、Token 刷新 |
| 图标 | Element Plus Icons | ^2.3.1 | 全局注册 |
| 图表 | ECharts | ^6.1.0 | 全量导入 |
| 测试 | Vitest | ^4.1.9 | + jsdom + @vue/test-utils |
| 代码检查 | ESLint 9 (flat config) | - | + typescript-eslint + eslint-plugin-vue |
| 格式化 | Prettier | ^3.0.0 | 配置见 `.prettierrc` |
| 类型检查 | vue-tsc | ^3.3.5 | `npm run typecheck` |
| CSS 预处理器 | Sass | ^1.101.0 | scss |
| 代码提交 | husky + lint-staged | - | pre-commit 自动 lint |
| AI 提供商 | openai | ^4.47.0 | OpenAI/兼容 API 客户端（后端） |
| Markdown 增强 | marked + katex + mermaid + highlight.js | ^12.0.0 / ^0.17.0 / ^11.16.0 / ^11.11.1 | AI 助手 Markdown 渲染 |
| 性能监控 | web-vitals + @sentry/vue | ^5.3.0 / ^10.63.0 | Core Web Vitals + Sentry RUM |

---

## 二、项目目录结构

```
d:\codes\web/
├── src/
│   ├── __tests__/          # 单元测试
│   ├── api/                # API 接口层（每个业务模块一个文件）
│   │   ├── index.ts        # 统一导出所有 API
│   │   ├── auth.ts         # 认证相关
│   │   ├── user.ts         # 用户管理
│   │   ├── menu.ts         # 菜单管理
│   │   ├── role.ts         # 角色管理
│   │   ├── dept.ts         # 部门管理
│   │   ├── dashboard.ts    # 仪表盘
│   │   ├── notice.ts       # 公告管理
│   │   ├── message.ts      # 站内消息
│   │   ├── dict.ts         # 字典管理
│   │   ├── log.ts          # 系统日志
│   │   ├── task.ts         # 定时任务
│   │   ├── server.ts       # 服务器监控
│   │   ├── setting.ts      # 系统设置
│   │   ├── onlineUser.ts   # 在线用户
│   │   ├── upload.ts       # 文件上传
│   │   ├── search.ts       # 全局搜索
│   │   └── ai.ts           # AI 代码生成（聊天 / 文件应用 / 提供商管理）
│   ├── assets/             # 静态资源（主题样式等）
│   ├── components/         # 通用组件
│   │   ├── ProForm/        # 专业表单组件（ProFormItem + index.vue）
│   │   ├── ProTable/       # 专业表格组件（SearchForm + ColumnSettings + TablePagination）
│   │   ├── layout/         # 布局组件（Header/Sidebar/Breadcrumb/NavTabs/NotificationCenter）
│   │   ├── CrudPage.vue    # CRUD 页面模板
│   │   ├── CrudTable.vue   # CRUD 表格
│   │   ├── VirtualTable.vue# 虚拟滚动表格（基于 ElTableV2）
│   │   ├── FormDialog.vue  # 表单对话框
│   │   ├── TableCard.vue   # 表格卡片容器
│   │   ├── PageHeader.vue  # 页面头部
│   │   ├── SearchBar.vue   # 搜索栏
│   │   ├── ErrorBoundary.vue # 错误边界
│   │   ├── Permission.vue  # 权限组件
│   │   ├── Watermark.vue   # 水印组件
│   │   ├── EmptyState.vue  # 空状态组件
│   │   ├── SkeletonLoader.vue # 通用骨架屏组件
│   │   ├── PageSkeleton.vue  # 页面级骨架屏组件
│   │   ├── MenuIcon.vue    # 菜单图标组件（动态 SVG）
│   │   └── AIAssistant/    # AI 代码生成助手（浮动按钮 + 抽屉对话 + 代码预览）
│   │       └── index.vue
│   ├── composables/        # 组合式函数
│   │   ├── useCrud.ts      # 通用 CRUD 逻辑封装
│   │   ├── useDialog.ts    # 对话框逻辑
│   │   ├── useExport.ts    # 导出逻辑
│   │   ├── useExportProgress.ts # 导出进度
│   │   ├── useRequestCache.ts # 请求缓存
│   │   └── useSSE.ts       # SSE 连接管理（指数退避重连 / 心跳 / 自动 ticket）
│   ├── directives/         # 自定义指令
│   │   └── permission.ts   # v-permission 权限指令
│   ├── i18n/               # 国际化
│   │   ├── index.ts        # 轻量级 i18n 工具（非 vue-i18n）
│   │   ├── zh-CN.ts        # 中文语言包
│   │   └── en-US.ts        # 英文语言包
│   ├── router/             # 路由配置
│   │   ├── index.ts        # 路由实例 + 守卫
│   │   ├── dynamicRoutes.ts# 动态路由生成（根据后端菜单配置）
│   │   ├── initSession.ts  # 会话初始化（刷新后恢复登录态 + 站点信息）
│   │   ├── keepAlive.ts    # 路由组件缓存管理（白名单动态配置）
│   │   └── preload.ts      # 路由预加载策略
│   ├── stores/             # Pinia 状态管理
│   │   ├── index.ts        # 统一导出入口
│   │   ├── pinia.ts        # Pinia 实例（独立文件，避免循环依赖）
│   │   ├── appStore.ts     # 应用全局状态（侧边栏、主题等）
│   │   ├── userStore.ts    # 用户认证状态
│   │   ├── menuStore.ts    # 菜单状态
│   │   ├── themeStore.ts   # 主题状态（主色、字号）
│   │   ├── layoutStore.ts  # 布局状态（多标签页、导航模式）
│   │   ├── localeStore.ts  # 语言状态（中英文切换）
│   │   ├── settingStore.ts # 系统设置状态
│   │   ├── siteStore.ts    # 站点信息状态
│   │   └── notificationStore.ts # 通知状态
│   ├── types/              # 类型定义
│   │   ├── api.ts          # 业务模型类型（从 server/shared/schemas 自动同步）
│   │   └── response.ts     # API 响应类型（ApiResponse / PaginatedData）
│   ├── utils/              # 工具函数
│   │   ├── request.ts      # Axios HTTP 客户端（核心，含拦截器/Token 刷新/缓存）
│   │   ├── errors.ts       # 错误类型定义
│   │   ├── error.ts        # 错误处理辅助
│   │   ├── requestCache.ts # GET 请求缓存
│   │   ├── response.ts     # 响应处理
│   │   ├── debounce.ts     # 防抖工具
│   │   ├── download.ts     # 文件下载
│   │   ├── nprogress.ts    # 进度条封装
│   │   ├── sanitize.ts     # 输入清理
│   │   ├── validators.ts   # 表单校验规则
│   │   ├── dynamicIcons.ts # 动态图标注册
│   │   ├── mdEditorSetup.ts# Markdown 编辑器增强配置（Mermaid + KaTeX）
│   │   └── webVitals.ts    # Core Web Vitals 性能指标上报（Sentry）
│   ├── views/              # 页面视图
│   │   ├── user/           # 用户管理子组件
│   │   │   ├── UserFormDialog.vue   # 用户表单弹窗
│   │   │   └── UserImportDialog.vue # 用户导入弹窗
│   │   ├── Layout.vue      # 主布局（含 AI 助手悬浮按钮）
│   │   ├── Dashboard.vue   # 仪表盘（骨架屏）
│   │   ├── Login.vue       # 登录
│   │   ├── LoginPage.vue   # 登录页配置页
│   │   ├── Register.vue    # 注册
│   │   ├── Profile.vue     # 个人中心
│   │   ├── AiProviderManager.vue # AI 提供商管理页
│   │   ├── ...             # 其他业务页面
│   ├── App.vue             # 根组件
│   ├── env.d.ts            # 环境类型声明
│   └── main.ts             # 入口文件
├── server/                 # 后端 Express + TypeScript（不在前端规范范围）
├── .trae/rules/            # Trae IDE 项目规则
├── AI_DEVELOPMENT_GUIDE.md # 本文件
```

---

## 三、编码规范

### 3.1 TypeScript 严格模式

`tsconfig.json` 启用了严格模式：
- `strict: true` — 所有严格检查
- `noUnusedLocals: true` — 禁止未使用的局部变量
- `noUnusedParameters: true` — 禁止未使用的参数（以 `_` 开头的参数除外）
- `isolatedModules: true` — 每个文件独立模块
- `skipLibCheck: true` — 跳过库类型检查（仅检查业务代码）

**AI 注意事项**：
- 类型必须精确，避免过度使用 `any`（ESLint 会对 `any` 发出警告）
- 未使用的变量/参数必须移除或以 `_` 前缀命名
- 路径别名 `@/` 映射到 `src/`，导入时优先使用 `@/` 别名

### 3.2 ESLint 规则（eslint.config.mjs）

- 继承：ESLint 推荐 + TypeScript ESLint 推荐 + Vue 3 推荐（flat 格式）
- `vue/multi-word-component-names`: `off` — 允许单文件组件名
- `@typescript-eslint/no-explicit-any`: `warn` — 允许但警告
- `@typescript-eslint/no-unused-vars`: `error` — 未使用变量报错（忽略 `_` 前缀）

### 3.3 Prettier 格式化（.prettierrc）

```json
{
  "semi": false,          // 无分号
  "singleQuote": true,    // 单引号
  "trailingComma": "all", // 尾部逗号
  "printWidth": 160,      // 较宽的行
  "tabWidth": 2,          // 2 空格缩进
  "arrowParens": "always",// 箭头函数始终加括号
  "endOfLine": "lf"       // LF 换行
}
```

### 3.4 文件编码

- **所有源文件必须使用 UTF-8 编码（无 BOM）**
- 涉及中文文本的文件（UI 标签、注释、文档、日志）必须确保 UTF-8 编码
- `.editorconfig` 已配置 `charset = utf-8`

### 3.5 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 组件名 | PascalCase（多词，但允许单文件） | `UserFormDialog.vue` |
| 文件名 | PascalCase 或 kebab-case | `ProFormItem.vue` |
| 变量/函数 | camelCase | `fetchData`, `isLoggedIn` |
| 类型/接口 | PascalCase | `ApiResponse<T>`, `CrudApi` |
| 枚举 | PascalCase | `LocaleKey` |
| Pinia Store | use + PascalCase | `useUserStore` |
| 组合式函数 | use + camelCase | `useCrud`, `useDialog` |
| API 对象 | camelCase | `userApi`, `menuApi` |

### 3.6 注释规范

- 使用 JSDoc 风格注释 `/** ... */` 描述函数/类/接口
- 单行注释使用 `//`
- 关键逻辑需要注释说明原因，而非描述做了什么

---

## 四、组件开发规范

### 4.1 单文件组件（SFC）结构

所有组件使用 `<script setup lang="ts">` 组合式 API 风格：

```vue
<template>
  <!-- 模板：Element Plus 组件 + 自定义样式 -->
</template>

<script setup lang="ts">
// 1. 导入
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'

// 2. Props / Emits 定义
const props = defineProps<{ ... }>()
const emit = defineEmits<{ ... }>()

// 3. 响应式状态
const loading = ref(false)

// 4. 计算属性
const computedValue = computed(() => ...)

// 5. 函数/方法
function handleAction() { ... }

// 6. 生命周期
onMounted(() => { ... })
</script>

<style lang="scss" scoped>
/* 组件样式：scoped + BEM 命名 */
</style>
```

### 4.2 Props 定义规范

- 优先使用 TypeScript 接口/字面量类型定义 Props
- 使用 `withDefaults` 提供默认值
- 复杂对象类型使用 `Record<string, unknown>` 而非 `object`

```typescript
const props = withDefaults(
  defineProps<{
    modelValue?: Record<string, unknown>
    schema: FormSchemaItem[]
    columns?: number
    gutter?: number
    showActions?: boolean
    loading?: boolean
  }>(),
  {
    columns: 3,
    gutter: 20,
    showActions: true,
    loading: false,
  },
)
```

### 4.3 Emits 定义规范

使用 TypeScript 函数重载语法：

```typescript
const emit = defineEmits<{
  (e: 'update:modelValue', value: Record<string, unknown>): void
  (e: 'submit', data: Record<string, unknown>): void
  (e: 'column-sort', params: { column: ColumnDef; key: string; order: string }): void
}>()
```

### 4.4 组件暴露（defineExpose）

需要父组件调用的方法通过 `defineExpose` 暴露：

```typescript
defineExpose({
  toggleRowSelection,
  clearSelection,
  refresh,
})
```

---

## 五、通用组件体系

### 5.1 ProForm 专业表单

- 目录：`src/components/ProForm/`
- 核心文件：`index.vue`（表单容器）、`ProformItem.vue`（表单项渲染）
- 特点：基于 schema 配置驱动，自动布局，支持函数式属性（动态解析）
- 表单项通过 `ProformItem.vue` 根据 `item.type` 自动渲染不同类型的输入组件

**Schema 定义**：

```typescript
interface FormItemSchema {
  prop: string                    // 字段名
  label?: string                  // 标签
  type?: string                   // 控件类型（input/select/switch/...）
  placeholder?: string | Function // 提示文字（支持函数）
  required?: boolean              // 必填
  disabled?: boolean | Function   // 禁用（支持函数）
  readonly?: boolean | Function   // 只读（支持函数）
  clearable?: boolean             // 可清除
  filterable?: boolean | Function // 可搜索（支持函数）
  multiple?: boolean | Function   // 多选（支持函数）
  hidden?: boolean | Function     // 隐藏（支持函数）
  options?: unknown[] | Function  // 选项列表（支持函数）
  optionLabel?: string            // 选项标签字段
  optionValue?: string            // 选项值字段
  optionDisabled?: string         // 选项禁用字段
  rules?: Record<string, unknown>[]  // 校验规则
  tip?: string | Function         // 提示文字
  props?: Record<string, unknown> | Function   // 透传属性
  componentProps?: Record<string, unknown> | Function // 组件属性
  formItemProps?: Record<string, unknown> | Function  // 表单项属性
  defaultValue?: unknown          // 默认值
  colProps?: Record<string, unknown>  // 布局属性
  slot?: string                   // 插槽名
  component?: string              // 自定义组件名
  [key: string]: unknown          // 扩展属性
}
```

**函数式属性解析**：通过 `resolveSchemaValue` 函数统一处理，函数签名 `(formData: Record<string, unknown>, item: FormItemSchema) => unknown`

### 5.2 ProTable 专业表格

- 目录：`src/components/ProTable/`
- 核心文件：`index.vue`（表格容器）、`SearchForm.vue`（搜索表单）、`ColumnSettings.vue`（列设置）、`TablePagination.vue`（分页）
- 特点：搜索、表格、分页一体化；支持列设置持久化；支持 Tab 切换；支持导出

**Props 核心属性**：
- `columns` — 列定义数组
- `data` — 表格数据
- `loading` — 加载状态
- `searchFields` — 搜索字段配置
- `orderTabs` — 订单状态 Tab
- `showActions` — 是否显示操作栏
- `virtual` — 是否启用虚拟滚动

**Events**：
- `query` — 查询事件，参数 `{ searchParams, pagination }`
- `column-sort` — 列排序事件
- `update:pagination` — 分页更新

### 5.3 VirtualTable 虚拟滚动表格

- 文件：`src/components/VirtualTable.vue`
- 基于 Element Plus 的 `ElTableV2` 组件封装
- 支持 `AutoResizer` 自适应尺寸
- 适用于大数据量场景

**Props**：
- `columns: ColumnDef[]` — 列定义（含 `prop/label/width/align/fixed/sortable/formatter`）
- `data: Record<string, unknown>[]` — 数据
- `rowHeight` — 行高（默认 50）
- `autoResize` — 是否自动调整尺寸

### 5.4 CrudPage + CrudTable

- `CrudPage.vue` — CRUD 页面模板，整合搜索/表格/分页/对话框
- `CrudTable.vue` — 简化版 CRUD 表格组件
- 配合 `useCrud` 组合式函数使用

---

## 六、状态管理规范（Pinia）

### 6.1 使用模式

所有 Store 使用**组合式 API（Setup Store）风格**：

```typescript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useAppStore = defineStore('app', () => {
  // ==================== State ====================
  const sidebarCollapsed = ref(false)

  // ==================== Getters ====================
  const isSidebarOpen = computed(() => !sidebarCollapsed.value)

  // ==================== Actions ====================
  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  return {
    sidebarCollapsed,
    isSidebarOpen,
    toggleSidebar,
  }
})
```

### 6.2 Store 职责划分

| Store | 文件 | 职责 |
|-------|------|------|
| `useAppStore` | `appStore.ts` | 侧边栏折叠、主题模式、语言等全局 UI 状态 |
| `useUserStore` | `userStore.ts` | 用户认证（Token/用户信息/登录态/强制改密） |
| `useMenuStore` | `menuStore.ts` | 菜单树、动态路由生成、当前菜单路径 |
| `useSettingStore` | `settingStore.ts` | 系统设置（从后端加载） |
| `useNotificationStore` | `notificationStore.ts` | 通知/消息中心 |

### 6.3 路由守卫与 Store 交互

在 `router/index.ts` 的路由守卫中通过 `pinia` 实例访问 Store：

```typescript
import { pinia } from '@/stores/pinia'
import { useUserStore } from '@/stores/userStore'

router.beforeEach((to, _from, next) => {
  const userStore = useUserStore(pinia)
  // ...
})
```

### 6.4 pinia 独立实例

`src/stores/pinia.ts` 单独导出 Pinia 实例，避免循环依赖：

```typescript
import { createPinia } from 'pinia'
export const pinia = createPinia()
```

---

## 七、API 请求规范

### 7.1 API 模块定义

每个业务模块独立一个 API 文件，使用对象字面量组织：

```typescript
// src/api/user.ts
import request from '@/utils/request'
import type { User } from '@/types/api'

export const userApi = {
  list(params: Record<string, unknown>) {
    return request.get<User[]>('/users', { params })
  },
  getById(id: number) {
    return request.get<User>(`/users/${id}`)
  },
  create(data: Partial<User>) {
    return request.post<User>('/users', data)
  },
  update(id: number, data: Partial<User>) {
    return request.put<User>(`/users/${id}`, data)
  },
  delete(id: number) {
    return request.delete<null>(`/users/${id}`)
  },
}
```

### 7.2 响应类型

所有 API 返回标准 `ApiResponse<T>` 结构：

```typescript
interface ApiResponse<T = unknown> {
  code: number          // 业务状态码（0 成功，非 0 失败）
  data: T               // 业务数据
  message?: string      // 提示信息
}

interface PaginatedData<T> {
  rows: T[]             // 数据列表
  total: number         // 总数
}
```

### 7.3 请求模块特性（src/utils/request.ts）

- **Token 自动注入**：请求拦截器自动添加 `Authorization` 头
- **Refresh Token 队列**：401 时自动续期，并发请求排队等待新 Token
- **GET 缓存**：GET 请求结果自动缓存（可通过 `skipCache` 跳过）
- **非 GET 清除缓存**：POST/PUT/DELETE 成功后自动清除相关缓存
- **进度条**：请求自动触发 NProgress
- **强制下线**：检测到 `kicked` 标志时清空状态并跳转登录页

### 7.4 API 统一导出

```typescript
// src/api/index.ts
export { userApi } from './user'
export { menuApi } from './menu'
export { dashboardApi } from './dashboard'
// ... 所有 API 模块
```

### 7.5 错误处理

使用统一的 `AppError` 类和错误转换机制：

```typescript
import { createAppError, AppError } from '@/utils/errors'
import { getErrorMessage } from '@/utils/error'

try {
  // ...
} catch (err: unknown) {
  ElMessage.error(getErrorMessage(err))
}
```

---

## 八、路由规范

### 8.1 路由定义

路由文件在 `src/router/index.ts`，使用 `createWebHistory` 模式：

```typescript
const routes = [
  {
    path: '/',
    name: 'Layout',
    component: Layout,
    meta: { requiresAuth: true },
    children: [
      {
        path: 'profile',
        name: 'profile',
        component: () => import('@/views/Profile.vue'),
        meta: { title: '个人中心' },
      },
    ],
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
  },
  // catch-all 重定向
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
]
```

### 8.2 动态路由

`src/router/dynamicRoutes.ts` 根据后端菜单配置动态生成路由，配合 `menuStore` 使用。

### 8.3 路由预加载

`src/router/preload.ts` 实现路由预加载策略：
- 高频路由（仪表盘、用户管理）优先预加载
- 低频路由（系统日志、服务器监控）延迟加载

### 8.4 路由守卫

路由守卫流程：
1. 检查 `requiresAuth` → 未登录跳转 `/login`
2. 已登录访问 `/login` → 重定向 `/`
3. 检查 `passwordResetRequired` → 跳转 `/force-password-change`

---

## 九、国际化规范（i18n）

### 9.1 使用方式

项目使用自定义轻量级 i18n 工具，非 vue-i18n：

```typescript
import { useI18n } from '@/i18n'

const { t } = useI18n()
// 使用：t('common.confirm') => '确定'
// 插值：t('user.welcome', { name: '张三' }) => '欢迎, 张三!'
```

### 9.2 翻译 Key 路径规则

```
模块.具体含义
示例：
- common.confirm
- common.cancel
- user.title
- user.createSuccess
- menu.fetchListFailed
- dashboard.totalUsers
- messages.deleteConfirm
```

### 9.3 语言包文件

- `src/i18n/zh-CN.ts` — 中文（默认语言）
- `src/i18n/en-US.ts` — 英文（兜底语言，翻译 Key 在中文找不到时尝试英文）

### 9.4 类型安全

```typescript
export type MessageSchema = typeof zhCN
type DotKey<T, Prefix extends string = ''> = {
  [K in keyof T]: T[K] extends Record<string, unknown>
    ? DotKey<T[K], `${Prefix}${K & string}.`>
    : `${Prefix}${K & string}`
}[keyof T]
```

`t` 函数的第一个参数类型为 `DotKey<MessageSchema>`，在编译期校验翻译 Key 的合法性。

---

## 十、类型定义规范

### 10.1 类型来源

业务模型类型从后端 Zod Schema 自动推断（`server/shared/schemas/`）：

```typescript
// src/types/api.ts
export type { User } from '@shared/schemas/user'
export type { Menu } from '@shared/schemas/menu'
export type { Role } from '@shared/schemas/role'
export type { Department } from '@shared/schemas/dept'
```

业务自有的类型（如 `Message`、`LogEntry`、`Task`、`DashboardStats`）在当前文件中定义。

### 10.2 API 响应类型

```typescript
// src/types/response.ts
export interface ApiResponse<T = unknown> {
  code: number
  data: T
  message?: string
}

export interface PaginatedData<T> {
  rows: T[]
  total: number
}

export type PaginatedResponse<T> = ApiResponse<PaginatedData<T>>
export type VoidResponse = ApiResponse<null>

export interface ListQueryParams {
  page?: number
  pageSize?: number
  keyword?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  [key: string]: unknown
}
```

---

## 十一、组合式函数规范（Composables）

### 11.1 useCrud

通用 CRUD 组合式函数，封装列表查询、分页、创建/编辑/删除/批量删除逻辑：

```typescript
const {
  list,             // 数据列表 Ref<T[]>
  loading,          // 加载状态
  pagination,       // 分页信息（pageNum/pageSize/total）
  form,             // 表单数据
  dialogVisible,    // 对话框可见性
  isEdit,           // 是否编辑模式
  submitLoading,    // 提交加载状态
  onQuery,          // 查询回调
  fetchData,        // 获取列表
  openCreate,       // 打开创建对话框
  openEdit,         // 打开编辑对话框
  handleSubmit,     // 提交表单
  handleDelete,     // 删除单条
  handleBatchDelete,// 批量删除
  refresh,          // 刷新列表
} = useCrud<EntityType>({
  api: entityApi,
  defaultForm: { ... },
  defaultSearchParams: { ... },
  defaultPagination: { pageNum: 1, pageSize: 10 },
})
```

### 11.2 useDialog

对话框逻辑封装，管理打开/关闭/提交状态。

### 11.3 useExport / useExportProgress

导出功能封装，支持进度显示。

---

## 十二、测试规范

### 12.1 测试框架

- **Vitest**：测试运行器
- **jsdom**：浏览器环境模拟
- **@vue/test-utils**：Vue 组件测试工具
- **Pinia**：`setActivePinia(createPinia())` 初始化状态

### 12.2 测试命令

```bash
npm test          # 运行所有测试
npm run test:watch # 监听模式
```

### 12.3 测试文件位置

所有测试文件位于 `src/__tests__/` 目录，按功能模块命名：
- `useCrud.test.ts` — useCrud 组合式函数测试
- `permission.test.ts` — 权限逻辑测试
- `userStore.test.ts` — userStore 测试
- `requestCache.test.ts` — 请求缓存测试
- `validators.test.ts` — 校验规则测试
- 等

### 12.4 测试编写示例

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

describe('模块名称', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('测试用例描述', () => {
    expect(result).toBe(expected)
  })
})
```

---

## 十三、Git 提交规范

### 13.1 Commit Message 格式

使用 husky + lint-staged 自动 lint，commit message 建议遵循以下格式：

```
<type>(<scope>): <subject>

<body>
```

### 13.2 类型

| Type | 说明 |
|------|------|
| feat | 新功能 |
| fix | 修复 Bug |
| refactor | 重构 |
| style | 样式修改 |
| docs | 文档 |
| test | 测试 |
| chore | 构建/工具 |

---

## 十四、AI 助手重要提示

### 14.1 代码修改原则

1. **先读后改**：修改文件前必须读取文件内容，理解现有代码风格
2. **保持风格一致**：模仿现有代码的命名、结构、模式
3. **最小修改**：只修改需要修改的部分，不引入无关变更
4. **类型安全**：修改后必须运行 `npm run typecheck` 确保类型正确
5. **遵循已有模式**：不要引入新的框架/库，除非明确要求

### 14.2 常用命令

```bash
npm run install:all  # 安装根目录 + server 依赖
npm run dev          # 启动开发服务器（tsc 编译 → node dist/app.js → 自动建库/迁移/种子）
npm run migrate      # 手动执行数据库迁移（tsc 编译 → node dist/scripts/migrate.js up）
npm run migrate:seed # 写入种子（空库 admin 等）
npm run migrate:status
npm run migrate:reset # 危险：清空后重建
npm run build        # 生产构建（前端 vite + 后端 tsc）
npm run typecheck    # TypeScript 类型检查（必须通过）
npm run lint         # ESLint 代码检查
npm run format       # Prettier 格式化
npm test             # 运行测试
```

> ⚠️ Windows 注意：`tsx`/`esbuild` 不稳定时，所有 server 脚本均使用 `tsc && node dist/...` 方式运行。

### 14.3 避免的操作

- **不要创建 README 或文档文件**（除非明确要求）
- **不要引入新的 npm 依赖**（除非明确要求）
- **不要修改 `tsconfig.json`、`eslint.config.mjs`、`.prettierrc`**（除非确实需要）
- **不要移除已有功能**（重构时需保持行为一致）
- **不要在代码中添加无关注释**（除非必要）

### 14.4 项目关键文件索引

| 文件 | 说明 |
|------|------|
| `src/main.ts` | 应用入口，组件注册、插件安装 |
| `src/App.vue` | 根组件 |
| `src/utils/request.ts` | HTTP 客户端（核心基础设施） |
| `src/utils/errors.ts` | 错误类型定义 |
| `src/router/index.ts` | 路由实例 + 守卫 |
| `src/router/dynamicRoutes.ts` | 动态路由生成 |
| `src/stores/pinia.ts` | Pinia 实例（避免循环依赖） |
| `src/stores/userStore.ts` | 用户认证 Store |
| `src/i18n/index.ts` | 国际化工具 |
| `src/types/api.ts` | 业务模型类型 |
| `src/types/response.ts` | API 响应类型 |
| `src/composables/useCrud.ts` | 通用 CRUD 组合式函数 |
| `src/composables/useSSE.ts` | SSE 连接管理（指数退避重连 / 心跳 / 自动 ticket） |
| `src/utils/webVitals.ts` | Core Web Vitals 性能指标上报 |
| `src/utils/mdEditorSetup.ts` | Markdown 编辑器增强配置（Mermaid + KaTeX） |
| `src/components/AIAssistant/index.vue` | AI 代码生成助手（浮动按钮 + 抽屉对话） |
| `src/components/SkeletonLoader.vue` | 通用骨架屏组件 |
| `src/components/PageSkeleton.vue` | 页面级骨架屏组件 |
| `src/router/initSession.ts` | 会话初始化（刷新后恢复登录态） |
| `src/router/keepAlive.ts` | 路由组件缓存管理 |
| `src/stores/themeStore.ts` | 主题状态（主色、字号） |
| `src/stores/layoutStore.ts` | 布局状态（多标签页、导航模式） |
| `src/stores/localeStore.ts` | 语言状态（中英文切换） |
| `src/stores/siteStore.ts` | 站点信息状态 |
| `server/.env` | 后端环境变量（DB_* / SERVER_PORT / JWT_SECRET） |
| `server/bootstrap.ts` | 启动：ensure DB → migrate → seed → listen |
| `server/utils/ensureDatabase.ts` | 自动建库（query + CREATE DATABASE IF NOT EXISTS） |
| `server/utils/migrator.ts` | Umzug 迁移/种子（Windows 路径 `/` 归一化） |
| `server/scripts/migrate.ts` | 迁移 CLI 入口 |
| `server/seeders/20260707_000001_admin_user.ts` | 默认管理员种子（运行时 bcrypt） |
| `.agents/skills/vue-admin-env-setup/SKILL.md` | 本地环境搭建 skill |

---

## 十五、SSE 连接管理（useSSE Composable）

### 15.1 概述

`src/composables/useSSE.ts` 提供了通用的 SSE（Server-Sent Events）连接管理 Composable，核心特性：

- **指数退避重连**：初始 3s，最大 30s，1.5 倍递增
- **心跳保活**：30s 间隔检测连接存活状态
- **自动 ticket 获取**：SSE 连接使用一次性 ticket，自动处理 token 刷新
- **完整生命周期清理**：组件卸载时自动断开

### 15.2 使用方式

```typescript
import { useSSE } from '@/composables/useSSE'

// 在组件中使用
const sse = useSSE({
  url: '/notices/sse',              // SSE 端点（不含 /api/v1 前缀）
  heartbeatInterval: 30_000,        // 心跳间隔（ms），默认 30s
  reconnect: {
    initialDelay: 3_000,            // 初始重连延迟
    maxDelay: 30_000,               // 最大重连延迟
    multiplier: 1.5,                // 指数退避倍数
  },
  maxRetries: -1,                   // 最大重连次数，-1 = 无限
})

// 订阅事件
sse.on('notice-published', () => {
  fetchUnreadCount()
})

sse.on('kicked', () => {
  performLogout()
})

sse.on('error', () => {
  console.warn('SSE 连接错误')
})

// 建立连接
sse.connect()

// 断开连接（主动）
sse.disconnect()

// 查看连接状态
if (sse.connected.value) {
  console.log('SSE 已连接')
}
```

### 15.3 可用事件

| 事件 | 说明 |
|------|------|
| `connected` | 连接建立 |
| `notice-published` | 新通知发布 |
| `notice-removed` | 通知被删除 |
| `kicked` | 被踢下线 |
| `error` | 连接错误 |
| `disconnected` | 已断开 |
| `*` | 所有事件（通配符） |

### 15.4 生命周期

- 组件挂载时调用 `sse.connect()` 建立连接
- 组件卸载时 `sse.disconnect()` 自动清理（内部已调用 `onUnmounted`）
- 手动调用 `disconnect()` 后不再自动重连

---

## 十六、AI 代码生成助手

### 16.1 概述

AI 助手是项目的**正式功能模块**，已接入前后端路由。前端组件位于 `src/components/AIAssistant/index.vue`。

### 16.2 前端组件结构

- **浮动触发按钮**：右下角圆形按钮，点击展开抽屉
- **抽屉式对话界面**：右侧抽屉，540px 宽，支持关闭
- **消息列表**：用户/AI 气泡式对话，支持 Markdown + 代码高亮
- **代码文件预览**：支持文件列表展开、代码复制、单文件/批量应用
- **AI 提供商管理**：内嵌弹窗，支持增删改查、启用/禁用切换
- **模型/提供商切换**：下拉菜单，支持多提供商多模型
- **Token 用量展示**：每条 AI 回复下方显示 Token 统计

### 16.3 AI API 调用

```typescript
import { aiApi } from '@/api/ai'

// 发送聊天消息
const res = await aiApi.chat({
  message: '帮我创建一个用户管理页面',
  providerId: 1,    // AI 提供商 ID
  model: 'claude-3', // 模型名称
})

// 应用生成的代码文件
const res = await aiApi.apply(files)

// 获取 AI 服务状态
const status = await aiApi.getStatus()

// 获取已启用提供商列表
const providers = await aiApi.getEnabledProviders()
```

### 16.4 Markdown 增强

- `src/utils/mdEditorSetup.ts`：md-editor-v3 增强配置，集成 Mermaid 图表 + KaTeX 公式渲染
- AI 助手中的 Markdown 渲染使用 `marked`（GFM 模式）+ `highlight.js`（懒加载）

---

## 十七、Web Vitals 性能监控

### 17.1 概述

`src/utils/webVitals.ts` 收集 Core Web Vitals 并上报到 Sentry，用于 RUM 真实用户监控。

### 17.2 监控指标

| 指标 | 说明 |
|------|------|
| CLS | Cumulative Layout Shift（累积布局偏移） |
| FCP | First Contentful Paint（首次内容绘制） |
| LCP | Largest Contentful Paint（最大内容绘制） |
| TTFB | Time to First Byte（首字节时间） |
| INP | Interaction to Next Paint（交互到下一次绘制） |

### 17.3 上报方式

```typescript
import { reportWebVitals } from '@/utils/webVitals'

// 在 main.ts 中调用
reportWebVitals()
```

所有指标通过 `Sentry.metrics.distribution()` 上报，附带 `rating` 标签。

---

## 十八、行级数据权限（dataScope）

### 18.1 概述

后端通过 `dataScope` 实现部门级数据隔离。角色配置 `dataScope` 字段：

- `1` = 全部数据
- `2` = 仅本部门
- `3` = 本级及以下部门

### 18.2 核心逻辑（server/utils/dataScope.ts）

```typescript
import { resolveDataScope, applyDataScopeWhere, isTargetInScope } from '@/server/utils/dataScope'

// 解析当前用户的数据范围
const scope = await resolveDataScope(userDeptId, roleIds)
// scope = { dataScope: 2, deptId: 3, deptIds: [3, 5, 6] }

// 将数据范围约束应用到查询 WHERE 条件
applyDataScopeWhere(where, reqUser, queryDeptId)

// 判断目标用户是否在数据范围内
if (isTargetInScope(targetDeptId, reqUser)) {
  // 允许访问
}
```

### 18.3 AI 注意事项

- 后端 `req.user` 已自动携带 `dataScope`、`deptId`、`deptIds` 字段
- 多角色取最宽松范围（min），任一角色为 `1` 则整体为全部
- 旧 Token 缺省 `dataScope` 时默认 scope=1（过渡兼容，无锁人风险）

---

## 十九、CSRF 纵深防御

### 19.1 三层防护

| 层 | 机制 | 说明 |
|----|------|------|
| 1 | `SameSite=Strict` Cookie | 跨站点请求自动不携带 Cookie |
| 2 | `originValidator` 中间件 | 非 GET 请求校验 Origin/Referer 白名单 |
| 3 | JWT-in-query 禁用 | SSE 端点不接受 `?token=` 查询参数 |

### 19.2 originValidator 配置

```typescript
// server/middleware/originValidator.ts
// 允许 Origin 白名单（支持环境变量 ALLOWED_ORIGINS 覆盖）
const ALLOWED_ORIGINS = [
  'http://localhost:5174',
  'https://localhost:5174',
  // ...
]
```

### 19.3 AI 注意事项

- 非 GET 请求均经过 Origin 校验，不在白名单内则返回 403
- 配置 `config.app.allowedOrigins` 或使用 `ALLOWED_ORIGINS` 环境变量
- 生产环境 `trust proxy` 已配置，确保 `req.ip` 获取真实客户端 IP

---

## 二十、本地环境搭建（MySQL / 迁移）

重新 clone 或换机器后，按下面顺序做；细节与决策树见项目 skill。

### 20.1 启动链路

```
server/.env
  → ensureDatabaseExists()      # query + CREATE DATABASE IF NOT EXISTS
  → sequelize.authenticate()
  → Umzug migrator.up()         # server/migrations/*.ts
  → seeder.up() if users = 0    # server/seeders/*.ts
  → HTTPS listen SERVER_PORT
```

### 20.2 最短路径

```bash
npm run install:all
# 配置 server/.env（DB_* 与本机 MySQL 一致）
npm run dev
```

> ⚠️ **Windows 注意**：`tsx` 依赖 `esbuild`，在部分 Windows 环境会报 `The service was stopped`。  
> 因此 `npm run dev` 实际执行 `tsc && node dist/app.js`，不依赖 `tsx`。  
> 首次启动或修改后端代码后需先编译（`tsc`），编译产物在 `server/dist/`。

失败时：

```bash
# 手动建库（utf8mb4）后
npm run migrate:status
npm run migrate
npm run migrate:seed
npm run dev
```

默认账号：`admin` / `123456`。API 前缀：`/api/v1`。健康检查：`/health`。

### 20.3 Windows 关键修复（已入库代码）

| 问题 | 修复位置 |
|------|----------|
| 根目录找不到 `tsx` | 根 `package.json`：`npm --prefix server run migrate*` |
| `server/package.json` 脚本（dev/migrate）使用 `tsx` 报 `The service was stopped` | `server/package.json`：改为 `tsc && node dist/...`，不依赖 `tsx` |
| Umzug glob 类型错误导致 pending=0 无表创建 | `server/utils/migrator.ts`：glob 改为 `'../migrations/*.{ts,js}'`（单字符串） |
| 自动建库失败 | `server/utils/ensureDatabase.ts`：使用 `query` |
| admin 密码无效 | seeder 运行时 `bcrypt.hash` |
| `dotenv` 包残缺（缺 package.json） | 用 `npm install dotenv --ignore-scripts` 重装 |

### 20.4 AI 排障原则

1. 先查 MySQL 服务 / `server/.env`，再查迁移状态，**不要先重写 ORM**
2. 若 `tsx`/`esbuild` 报 `The service was stopped`，改用 `tsc && node dist/...` 运行
3. 若 `npm install` 因 esbuild postinstall 失败，用 `npm install --ignore-scripts`
4. 若 `dotenv` 等包残缺，用 `npm install <包名> --ignore-scripts` 单独重装
5. 验证尽量用隔离库名与端口，避免覆盖现有开发库
6. 文档与示例不写真实密码
7. 改完用 `migrate:status`、`/health`、`/api/v1/auth/captcha` 验证
8. 完整 skill：`.agents/skills/vue-admin-env-setup/SKILL.md`
9. 静态自检：`node .agents/skills/vue-admin-env-setup/scripts/check-env.mjs`
