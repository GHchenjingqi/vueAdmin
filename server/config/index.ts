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

const config = {
  server: {
    port: parseInt(process.env.SERVER_PORT, 10) || 3000,
  },
  app: {
    // Origin 白名单（CSRF 纵深防御），开发环境默认放宽到内网 Vite 端口
    allowedOrigins: [
      'http://localhost:5174',
      'https://localhost:5174',
      'http://127.0.0.1:5174',
      'https://127.0.0.1:5174',
      ...(process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean),
    ],
  },
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 3306,
    name: process.env.DB_NAME || 'vue_admin',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '123456',
    dialect: 'mysql',
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
if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'vue_admin_secret_key_2024')) {
  console.error('FATAL: 生产环境必须设置自定义 JWT_SECRET 环境变量！请在 .env 文件中配置。')
  process.exit(1)
}

export default config