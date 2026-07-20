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
import errorHandler from './middleware/errorHandler.js'
import { slowQueryLogMiddleware } from './middleware/slowQueryLog.js'
import bootstrap from './bootstrap.js'
import { closeRedis } from './config/redis.js'

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
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'https://cdn.redoc.ly'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
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

// CORS 跨域白名单
// 生产环境严格限制，开发环境放宽到局域网 IP
const allowedOrigins = [
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://192.168.12.251:5174',
  'https://localhost:5174',
  'https://127.0.0.1:5174',
  'https://192.168.12.251:5174',
]
app.use(
  cors({
    origin: (origin, callback) => {
      // 允许无 origin 的请求（服务端、Postman 等）
      if (!origin) return callback(null, true)
      // 生产环境只允许白名单
      if (process.env.NODE_ENV === 'production') {
        return callback(null, allowedOrigins.includes(origin))
      }
      // 开发环境允许所有局域网 IP（形如 http://192.168.x.x:5173）
      if (allowedOrigins.includes(origin)) return callback(null, true)
      const ipOrigin = /^https?:\/\/(\d{1,3}\.){3}\d{1,3}:\d+$/.test(origin)
      return callback(null, ipOrigin)
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
  })
  // 请求处理器（必须在路由之前注册）
  app.use(Sentry.Handlers.requestHandler())
  app.use(Sentry.Handlers.tracingHandler())
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
    </svg>`
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

// ---------- 中间件 ----------
app.use(cookieParser())
// 请求体大小限制：防止 DoS 攻击
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// 静态文件：上传目录（头像、图片等）
const uploadsDir = resolve(__dirname, 'uploads')
app.use('/uploads', express.static(uploadsDir))

// ---------- API 路由（优先匹配）----------
app.use('/api/v1', apiRoutes)

// ---------- 错误处理 ----------
// Sentry 错误处理器（必须在所有路由之后，自定义 errorHandler 之前）
if (process.env.NODE_ENV === 'production') {
  app.use(Sentry.Handlers.errorHandler())
}
app.use(errorHandler)

// ---------- 启动服务（数据库迁移、数据迁移、种子数据、前端托管、HTTP 监听）----------
bootstrap(app)

// ---------- 优雅关闭（处理 SIGTERM/SIGINT）----------
process.on('SIGTERM', async () => {
  await closeRedis()
  process.exit(0)
})
process.on('SIGINT', async () => {
  await closeRedis()
  process.exit(0)
})