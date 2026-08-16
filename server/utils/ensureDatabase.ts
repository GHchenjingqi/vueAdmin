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
    throw new Error(
      `无法连接 MySQL（${db.host}:${db.port}，用户 ${db.user}）: ${msg}。` +
        '请确认 MySQL 已启动、端口可达、账号密码与 server/.env 一致。',
    )
  }

  try {
    // 注意：CREATE DATABASE 必须用 query，不能用 execute（prepared statement）
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${db.name}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    )
    logInfo(`数据库 ${db.name} 已就绪（utf8mb4 / utf8mb4_unicode_ci）`)
  } catch (err) {
    const msg = (err as Error).message || String(err)
    throw new Error(
      `创建数据库 ${db.name} 失败: ${msg}。` +
        '请确认当前账号具备 CREATE 权限（本地开发通常用 root）。',
    )
  } finally {
    await conn.end()
  }
}