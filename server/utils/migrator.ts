/**
 * 数据库迁移引擎核心
 *
 * 基于 Umzug 的迁移/种子数据管理
 * - 替代 sequelize.sync()，实现可追溯、可回滚的数据库版本管理
 * - 支持 CLI 操作（up/down/seed/reset/status）
 * - 自动记录迁移历史到 SequelizeMeta 表
 */
import { Umzug, SequelizeStorage } from 'umzug'
import { fileURLToPath, pathToFileURL } from 'url'
import { dirname, resolve } from 'path'
import sequelize from '../config/database.js'
import { logInfo, logError } from './fileLogger.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * 迁移执行器
 * 自动扫描 server/migrations/ 下的 .ts 文件并按文件名排序执行
 * 使用动态 import() 加载 ESM 迁移文件
 */
export const migrator = new Umzug({
  migrations: {
    glob: resolve(__dirname, '../migrations/*.ts'),
    resolve: ({ name, path, context }) => {
      const fileUrl = pathToFileURL(path!).href
      return {
        name,
        up: async () => {
          const migration = await import(fileUrl)
          await migration.up(context)
        },
        down: async () => {
          const migration = await import(fileUrl)
          await migration.down(context)
        },
      }
    },
  },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({
    sequelize,
    modelName: 'SequelizeMeta',
  }),
  logger: {
    info: (msg) => logInfo(`[Migration] ${typeof msg === 'object' ? JSON.stringify(msg) : msg}`),
    warn: (msg) => console.warn(`[Migration] ${typeof msg === 'object' ? JSON.stringify(msg) : msg}`),
    error: (msg) => logError(`[Migration] ${typeof msg === 'object' ? JSON.stringify(msg) : msg}`),
  },
})

/**
 * 种子数据执行器
 * 自动扫描 server/seeders/ 下的 .ts 文件
 */
export const seeder = new Umzug({
  migrations: {
    glob: resolve(__dirname, '../seeders/*.ts'),
    resolve: ({ name, path, context }) => {
      const fileUrl = pathToFileURL(path!).href
      return {
        name,
        up: async () => {
          const seed = await import(fileUrl)
          await seed.up(context)
        },
        down: async () => {
          const seed = await import(fileUrl)
          await seed.down(context)
        },
      }
    },
  },
  context: sequelize.getQueryInterface(),
  storage: new SequelizeStorage({
    sequelize,
    modelName: 'SeederMeta',
  }),
  logger: {
    info: (msg) => logInfo(`[Seeder] ${typeof msg === 'object' ? JSON.stringify(msg) : msg}`),
    warn: (msg) => console.warn(`[Seeder] ${typeof msg === 'object' ? JSON.stringify(msg) : msg}`),
    error: (msg) => logError(`[Seeder] ${typeof msg === 'object' ? JSON.stringify(msg) : msg}`),
  },
})