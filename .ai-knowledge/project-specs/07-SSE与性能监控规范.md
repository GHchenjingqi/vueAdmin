# SSE 与性能监控规范

---

## 一、SSE 连接管理（useSSE Composable）

### 1.1 概述

`src/composables/useSSE.ts` 提供了通用的 SSE（Server-Sent Events）连接管理 Composable，核心特性：

- **指数退避重连**：初始 3s，最大 30s，1.5 倍递增
- **心跳保活**：30s 间隔检测连接存活状态
- **自动 ticket 获取**：SSE 连接使用一次性 ticket，自动处理 token 刷新
- **完整生命周期清理**：组件卸载时自动断开

### 1.2 使用方式

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

### 1.3 可用事件

| 事件 | 说明 |
|------|------|
| `connected` | 连接建立 |
| `notice-published` | 新通知发布 |
| `notice-removed` | 通知被删除 |
| `kicked` | 被踢下线 |
| `error` | 连接错误 |
| `disconnected` | 已断开 |
| `*` | 所有事件（通配符） |

### 1.4 生命周期

- 组件挂载时调用 `sse.connect()` 建立连接
- 组件卸载时 `sse.disconnect()` 自动清理（内部已调用 `onUnmounted`）
- 手动调用 `disconnect()` 后不再自动重连

### 1.5 后端 SSE 管理（server/utils/sseManager.ts）

- **一次性票据认证**：`/api/auth/sse-ticket` 获取 ticket，SSE 连接使用 `?ticket=xxx`
- **心跳保活**：30 秒间隔推送心跳事件 + `X-Accel-Buffering: no`，防止 Nginx/Ingress 缓冲断开
- **自动重连**：断线后 5 秒自动重连，最多重试 3 次

---

## 二、Web Vitals 性能监控

### 2.1 概述

`src/utils/webVitals.ts` 收集 Core Web Vitals 并上报到 Sentry，用于 RUM 真实用户监控。

### 2.2 监控指标

| 指标 | 说明 |
|------|------|
| CLS | Cumulative Layout Shift（累积布局偏移） |
| FCP | First Contentful Paint（首次内容绘制） |
| LCP | Largest Contentful Paint（最大内容绘制） |
| TTFB | Time to First Byte（首字节时间） |
| INP | Interaction to Next Paint（交互到下一次绘制） |

### 2.3 上报方式

```typescript
import { reportWebVitals } from '@/utils/webVitals'

// 在 main.ts 中调用
reportWebVitals()
```

所有指标通过 `Sentry.metrics.distribution()` 上报，附带 `rating` 标签（good / needs-improvement / poor）。

---

## 三、骨架屏组件

### 3.1 SkeletonLoader（src/components/SkeletonLoader.vue）

通用骨架屏组件，用于加载占位：

```vue
<SkeletonLoader :rows="5" :columns="3" />
```

- `rows`：行数
- `columns`：列数
- `width`：每列宽度
- `height`：每行高度
- `circle`：是否圆形（头像等）
- `rounded`：圆角大小

### 3.2 PageSkeleton（src/components/PageSkeleton.vue）

页面级骨架屏，用于整页加载占位：

```vue
<PageSkeleton />
```

模拟页面常见布局：头部 + 侧边栏 + 主体内容区域。

### 3.3 使用场景

- Dashboard 加载时显示骨架屏
- 列表页面数据加载时显示骨架屏
- 组件数据获取期间显示局部骨架屏

---

## 四、性能预算

### 4.1 预算配置（budget.json）

```json
{
  "maxBundleSize": "500KB",
  "maxInitialJs": "300KB",
  "maxInitialCss": "100KB",
  "lighthouseScore": 90
}
```

### 4.2 校验命令

```bash
# 可视化分析
npm run analyze

# 构建时校验
npm run build
```

### 4.3 Lighthouse CI（lighthouserc.json）

- 每次 CI 构建后自动运行 Lighthouse
- 校验性能预算（bundle 体积、Lighthouse 评分）
- 超出预算时 CI 失败
