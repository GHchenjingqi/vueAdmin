import express from 'express'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import cors from 'cors'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import * as Sentry from '@sentry/node'
import swaggerSpec from './swagger.js'
import apiRoutes from './routes/index.js'
import accessLog from './middleware/accessLog.js'
import { metricsMiddleware } from './middleware/metrics.js'
import errorHandler from './middleware/errorHandler.js'
import { slowQueryLogMiddleware } from './middleware/slowQueryLog.js'
import originValidator from './middleware/originValidator.js'
import bootstrap from './bootstrap.js'
import { closeRedis } from './config/redis.js'
import config from './config/index.js'
import { createPublicApp } from './public/index.js'
import { registerPublicModule } from './public/registry.js'
import { knowledgePublicModule } from './modules/knowledge/public.js'
import storefrontRoutes from './modules/storefront/routes/index.js'
import { logInfo } from './utils/fileLogger.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const app = express()

// 信任反向代理（Nginx / K8s Ingress），否则 req.ip 恒为代理 IP，
// 导致基于 IP 的限流、在线用户 IP 记录、强制下线判定全部失真。
// 1 表示信任前一跳代理（生产环境建议按实际跳数或代理 IP 段配置）。
app.set('trust proxy', 1)

// ---------- 安全中间件（P0 级别，必须启用）----------
// 自定义 CSP：允许开发模式下 Vite HMR WebSocket 连接
// 注意：禁用 HSTS（strictTransportSecurity），因为开发环境通常不使用 HTTPS，
// 启用 HSTS 会导致浏览器自动升级为 HTTPS 并产生 ERR_SSL_PROTOCOL_ERROR
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // 允许 Vite HMR WebSocket（开发模式）和 API 请求
        connectSrc: ["'self'", 'ws://localhost:24678', 'ws://127.0.0.1:24678'],
        // Vite 需要 unsafe-inline 进行 HMR
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://cdn.redoc.ly', 'https://unpkg.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com', 'https://unpkg.com'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
      },
    },
    // 禁用 HSTS：开发环境使用 HTTP 时，HSTS 会让浏览器强制升级到 HTTPS
    strictTransportSecurity: false,
    // 禁用 COOP（HTTP 下任何 COOP 头都会被浏览器忽略并产生警告）
    crossOriginOpenerPolicy: false,
  }),
)

// 移除 HTTP 下无意义的 COOP 头，避免浏览器控制台警告
app.use((_req, res, next) => {
  res.removeHeader('Cross-Origin-Opener-Policy')
  next()
})

// CORS 跨域白名单（来自 config.app.allowedOrigins / ALLOWED_ORIGINS，禁止硬编码内网 IP）
const allowedOrigins = config.app.allowedOrigins
app.use(
  cors({
    origin: (origin, callback) => {
      // 允许无 origin 的请求（服务端、Postman 等）
      if (!origin) return callback(null, true)
      if (allowedOrigins.includes(origin)) return callback(null, true)
      // 开发环境允许局域网 IP（形如 http://192.168.x.x:5173），生产仅白名单
      if (process.env.NODE_ENV !== 'production') {
        const ipOrigin = /^https?:\/\/(\d{1,3}\.){3}\d{1,3}:\d+$/.test(origin)
        return callback(null, ipOrigin)
      }
      return callback(null, false)
    },
    credentials: true,
  }),
)

// ---------- Sentry 错误监控（生产环境启用）----------
if (process.env.NODE_ENV === 'production') {
  Sentry.init({
    dsn: process.env.SENTRY_DSN || '',
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.2,
    // v9+ 起 Express 请求追踪由 expressIntegration 自动完成，无需手动注册请求中间件
    integrations: [Sentry.expressIntegration()],
  })
}

// ---------- 健康检查（优先于所有路由）----------
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() })
})

// 默认 favicon（防止 404）
app.get('/favicon.ico', (_req, res) => {
  res.setHeader('Content-Type', 'image/svg+xml')
  res.send(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="6" fill="#409EFF"/>
      <text x="16" y="22" font-size="18" font-weight="bold" fill="white" text-anchor="middle" font-family="Arial">V</text>
    </svg>`,
  )
})

// ---------- API 文档（Redoc）----------
app.get('/api/docs.json', (_req, res) => {
  res.json(swaggerSpec)
})
app.get('/api/docs', (_req, res) => {
  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Vue Admin API 文档</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    body { margin: 0; padding: 0; }
    redoc { font-family: 'Inter', sans-serif; }
  </style>
</head>
<body>
  <redoc spec-url="/api/docs.json" scroll-y-offset="0" hide-download-button="false"></redoc>
  <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
</body>
</html>`)
})

// ---------- 访问日志 ----------
app.use(accessLog)

// ---------- 慢查询日志（>1000ms 的请求会被记录）----------
app.use(slowQueryLogMiddleware(1000))

// ---------- 指标中间件（P4-T13：API P95 与错误率观测，放在路由之前）----------
app.use(metricsMiddleware)

// ---------- 中间件 ----------
app.use(cookieParser())
// 请求体大小限制：防止 DoS 攻击
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Origin 校验（CSRF 纵深防御，GET/HEAD/OPTIONS 放行）
app.use(originValidator)

// 静态文件：上传目录（头像、图片等）
const uploadsDir = resolve(__dirname, 'uploads')
/**
 * 上传目录的静态资源单独施加 CSP: sandbox。
 *
 * 安全整改：上传白名单允许 .svg，而 SVG 是 XML 文本格式、可内联 <script>；
 * 全局 CSP 的 script-src 含 'unsafe-inline'（Vite HMR 所需），无法阻止内联脚本，
 * 且 express.static 以 image/svg+xml 提供、无 Content-Disposition。
 * 实测（实测响应头）：上传的 SVG 被以 image/svg+xml 返回，script-src 含
 * 'unsafe-inline' → 访问 /uploads/xxx.svg 会在站点源下执行脚本（存储型 XSS），
 * 可窃取 localStorage 中的管理员令牌。
 *
 * 修复：对 /uploads 响应覆盖 CSP 为 `sandbox`（不含 allow-scripts）：
 *   - 文档式渲染（直接访问 / 嵌入 <object>/<iframe>）时 SVG 进入不透明沙箱，
 *     脚本无法执行；
 *   - 图片式渲染（<img src="...">）不受 sandbox 影响，功能不受损；
 *   - 同时对历史已上传的 SVG 文件立即生效，无需清理数据。
 */
app.use('/uploads', (req, res, next) => {
  res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data: blob:")
  next()
}, express.static(uploadsDir))

// ---------- API 路由（优先匹配）----------
app.use('/api/v1', apiRoutes)

// ---------- Storefront 公开接口（免 admin 鉴权，独立站 C 端）----------
// 独立前缀 /api/storefront/v1，与 /api/v1/shop 后台接口隔离；站点 + 租户上下文
// 由模块内 siteContext 中间件建立（不经过 authMiddleware）。
app.use('/api/storefront/v1', storefrontRoutes)

// ---------- 对外站（匿名可读、SEO 友好、EJS 服务端渲染）----------
// 通过 PUBLIC_PATH 配置挂载路径，便于后续拆分到独立子域（如 www.）；默认 /site，避免与 admin SPA 根路径冲突
registerPublicModule(knowledgePublicModule)
const publicPath = process.env.PUBLIC_PATH ?? '/site'
app.use(publicPath, createPublicApp(publicPath))

// ---------- 错误处理 ----------
// Sentry 错误处理器（必须在所有路由之后，自定义 errorHandler 之前）
// Sentry v9+ API：setupExpressErrorHandler 内部即注册 expressErrorHandler
if (process.env.NODE_ENV === 'production') {
  Sentry.setupExpressErrorHandler(app)
}
app.use(errorHandler)

// ---------- 启动服务（数据库迁移、数据迁移、种子数据、前端托管、HTTP 监听）----------
bootstrap(app)

// ---------- 真实支付网关退款注入（按原支付通道原路退款）----------
void (async () => {
  try {
    const { installRefundGatewayProvider } = await import('./modules/shop/services/refundGatewayProvider.js')
    installRefundGatewayProvider()
  } catch (err) {
    logInfo(`退款通道注入失败: ${(err as Error).message}`)
  }
})()

// ---------- 工作流超时催办 / 升级扫描器（始终启用，默认每 60 秒一次）----------
// 轻量扫描 pending 审批任务：到期前提醒、超时自动通过、超时升级转交。
void (async () => {
  try {
    const { startTimeoutScanner } = await import('./services/workflowTimeoutService.js')
    startTimeoutScanner(60 * 1000)
  } catch (err) {
    logInfo(`工作流超时扫描器启动失败: ${(err as Error).message}`)
  }
})()

// ---------- 支付对账 / 补单 / 超时关单扫描器（默认每 5 分钟一次）----------
// 扫描仍处于 initiated 的支付单据：支持查单的网关主动补单；超硬上限（24h）或
// 不支持查单的通道直接关单并释放库存预占。复用既有 CAS 状态机，副作用仅赢家产生。
void (async () => {
  try {
    const { startPaymentReconcileScanner } = await import('./modules/storefront/services/paymentReconcileService.js')
    startPaymentReconcileScanner(5 * 60 * 1000)
  } catch (err) {
    logInfo(`支付对账扫描器启动失败: ${(err as Error).message}`)
  }
})()

// ---------- 订单邮件 outbox 投递扫描器（默认每 60 秒一次）----------
// 驱动确认/发货/退款邮件的到期投递与有界指数退避重试；按 outbox 内待投邮件的 tenantId
// 逐租户 drain，进程全局无租户上下文时也不会只处理 tenant 1。多实例并发由
// drainOutbox 的 attempts CAS 抢占保证同一封只发一次。
void (async () => {
  try {
    const { startOrderMailScanner } = await import('./modules/shop/services/orderMailService.js')
    startOrderMailScanner(60 * 1000)
    // 积分过期扫描（每 5 分钟；后台可配有效期天数，0=不过期）
    const { startPointsExpiryScanner } = await import('./modules/shop/services/membershipService.js')
    startPointsExpiryScanner(5 * 60 * 1000)
    // 弃购召回扫描（每 60 分钟；1h/24h 两档自动提醒）
    const { startAbandonedCartScanner } = await import('./modules/storefront/services/abandonedCartService.js')
    startAbandonedCartScanner(60 * 60 * 1000)
    // 营销邮件 outbox 投递扫描（每 60 秒；wishlist 降价/补货提醒 + 弃购召回邮件真正发出）
    const { startMailOutboxScanner } = await import('./modules/storefront/services/mailOutboxService.js')
    startMailOutboxScanner(60 * 1000)
  } catch (err) {
    logInfo(`订单邮件扫描器启动失败: ${(err as Error).message}`)
  }
})()

// ---------- 优雅关闭（处理 SIGTERM/SIGINT）----------
process.on('SIGTERM', async () => {
  await closeRedis()
  process.exit(0)
})
process.on('SIGINT', async () => {
  await closeRedis()
  process.exit(0)
})
