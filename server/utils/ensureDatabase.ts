/**
 * 确保 MySQL 数据库存在
 *
 * 启动 / 迁移前先用无库名连接创建库，避免 Unknown database。
 * CREATE DATABASE 必须用 query()，不能用 execute()（预处理不支持 DDL）。
 */
import config from '../config/index.js'
import { logInfo } from './fileLogger.js'

export async function ensureDatabaseExists(): Promise<void> {
  const mysql2 = await import('mysql2/promise')
  const db = config.database

  let conn
  try {
    conn = await mysql2.createConnection({
      host: db.host,
      port: db.port,
      user: db.user,
      password: db.password,
      // 不指定 database，避免目标库不存在时连不上
    })
  } catch (err) {
    const msg = (err as Error).message || String(err)
    throw new Error(`无法连接 MySQL（${db.host}:${db.port}，用户 ${db.user}）: ${msg}。` + '请确认 MySQL 已启动、端口可达、账号密码与 server/.env 一致。')
  }

  try {
    // 生产环境要求数据库已预先创建，禁止自动建库
    if (config.app.nodeEnv === 'production') {
      // 检查库是否存在
      const [rows] = await conn.query(`SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?`, [db.name])
      const exists = (rows as any[]).length > 0
      if (!exists) {
        throw new Error(`生产环境数据库 ${db.name} 不存在，请预先建库。当前账号 ${db.user} 应有目标库的 CRUD 权限，不应为 root。`)
      }
      logInfo(`数据库 ${db.name} 已存在（生产模式，跳过自动建库）`)
      return
    }

    // 注意：CREATE DATABASE 必须用 query，不能用 execute（prepared statement）
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${db.name}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
    logInfo(`数据库 ${db.name} 已就绪（utf8mb4 / utf8mb4_unicode_ci）`)
  } catch (err) {
    const msg = (err as Error).message || String(err)
    throw new Error(`创建数据库 ${db.name} 失败: ${msg}。` + '请确认当前账号具备 CREATE 权限（本地开发通常用 root）。')
  } finally {
    await conn.end()
  }
}
