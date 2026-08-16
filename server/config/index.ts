import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { existsSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 兼容源码开发（config/../.env）和编译后运行（dist/config/../../.env）
const envPath = [
  resolve(__dirname, '../.env'),        // 源码位置
  resolve(__dirname, '../../.env'),     // 编译后位置
  resolve(process.cwd(), '.env'),       // 运行目录
].find(p => existsSync(p))
if (envPath) dotenv.config({ path: envPath })

/** 解析 Origin 白名单：环境变量优先，开发环境附带安全默认值 */
function resolveAllowedOrigins(): string[] {
  const fromEnv = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const port = parseInt(process.env.SERVER_PORT || '5173', 10) || 5173
  const defaults = [
    `http://localhost:${port}`,
    `https://localhost:${port}`,
    `http://127.0.0.1:${port}`,
    `https://127.0.0.1:${port}`,
  ]

  // 生产环境：仅使用 ALLOWED_ORIGINS；未配置时退回同源默认端口，避免空数组
  if (process.env.NODE_ENV === 'production') {
    return fromEnv.length > 0 ? fromEnv : defaults
  }

  // 开发/测试：默认本机 + 环境变量扩展
  return Array.from(new Set([...defaults, ...fromEnv]))
}

const config = {
  server: {
    // 开发默认 5173（与 Playwright/E2E 一致）；生产可通过环境变量覆盖为 3000
    port: parseInt(process.env.SERVER_PORT || '5173', 10) || 5173,
  },
  app: {
    // Origin 白名单（CORS + CSRF 纵深防御），通过 ALLOWED_ORIGINS 配置，禁止硬编码内网 IP
    allowedOrigins: resolveAllowedOrigins(),
  },
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10) || 3306,
    name: process.env.DB_NAME || 'vue_admin',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '123456',
    dialect: 'mysql' as const,
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'vue_admin_secret_key_2024',
    expiresIn: '7d',
  },
  redis: {
    enabled: process.env.REDIS_ENABLED === 'true',
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
}

// P0 级别：生产环境必须设置 JWT_SECRET，否则拒绝启动
if (
  process.env.NODE_ENV === 'production' &&
  (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'vue_admin_secret_key_2024')
) {
  console.error('FATAL: 生产环境必须设置自定义 JWT_SECRET 环境变量！请在 .env 文件中配置。')
  process.exit(1)
}

export default config
