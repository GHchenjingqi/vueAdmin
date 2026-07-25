import type { QueryInterface } from 'sequelize'
import sequelize from '../config/database.js'
import { logInfo } from '../utils/fileLogger.js'

/**
 * 清理因种子数据名称不一致导致的重复菜单，并重组菜单结构。
 *
 * 背景：
 * 1. Umzug seeder 与 bootstrap.ts 增量逻辑使用不同名称
 *    （'公告管理' vs '消息发布'，'消息中心' vs '消息通知'），
 *    导致数据库中出现重复菜单。
 * 2. 消息发布/消息通知原本挂在系统管理下，需新建消息管理目录移入。
 * 3. 系统日志应挂在系统监控下而非系统管理下。
 *
 * 本迁移统一处理存量数据库的清理与重组。
 */
export async function up(_queryInterface: QueryInterface): Promise<void> {
  try {
    const [tables] = await sequelize.query("SHOW TABLES LIKE 'menus'")
    if ((tables as any[]).length === 0) return

    // 1. 清理旧名称重复菜单（公告管理、消息中心）
    const oldNames = ['公告管理', '消息中心']
    for (const name of oldNames) {
      const [menus] = (await sequelize.query(
        'SELECT id FROM menus WHERE name = ?',
        { replacements: [name] },
      )) as any

      if (menus.length > 0) {
        const ids = menus.map((m: any) => m.id) as number[]
        await sequelize.query(
          `DELETE FROM role_menus WHERE menuId IN (${ids.map(() => '?').join(',')})`,
          { replacements: ids },
        )
        await sequelize.query(
          `DELETE FROM menus WHERE id IN (${ids.map(() => '?').join(',')})`,
          { replacements: ids },
        )
        logInfo(`已清理旧名称菜单「${name}」(id=${ids.join(',')})`)
      }
    }

    // 2. 查找系统监控 ID，修复系统日志的 parentId
    const [monitorRows] = (await sequelize.query(
      "SELECT id FROM menus WHERE name = '系统监控' LIMIT 1",
    )) as any
    if (monitorRows.length > 0) {
      const monitorId = monitorRows[0].id
      const [logRows] = (await sequelize.query(
        "SELECT id FROM menus WHERE name = '系统日志' AND (parentId != ? OR parentId IS NULL)",
        { replacements: [monitorId] },
      )) as any
      if (logRows.length > 0) {
        const logIds = logRows.map((r: any) => r.id)
        await sequelize.query(
          `UPDATE menus SET parentId = ? WHERE id IN (${logIds.map(() => '?').join(',')})`,
          { replacements: [monitorId, ...logIds] },
        )
        logInfo(`已修复系统日志 parentId → ${monitorId}`)
      }
    }

    // 3. 创建消息管理目录，移入消息发布和消息通知
    let [messageRows] = (await sequelize.query(
      "SELECT id FROM menus WHERE name = '消息管理' LIMIT 1",
    )) as any
    let messageId: number
    if (messageRows.length === 0) {
      const [result] = (await sequelize.query(
        "INSERT INTO menus (parentId, name, path, icon, type, sort, status, hidden, createdAt, updatedAt) VALUES (0, '消息管理', '/message', 'ChatLineSquare', 'C', 3, 1, 0, NOW(), NOW())",
      )) as any
      messageId = (result as any)?.insertId || 0
      // Fallback: 如果 insertId 不可用，重新查询
      if (!messageId) {
        const [rows] = (await sequelize.query(
          "SELECT id FROM menus WHERE name = '消息管理' LIMIT 1",
        )) as any
        messageId = rows[0].id
      }
      logInfo(`已创建消息管理目录 (id=${messageId})`)
    } else {
      messageId = messageRows[0].id
    }

    // 移入消息发布
    const [noticeRows] = (await sequelize.query(
      "SELECT id FROM menus WHERE name = '消息发布' AND parentId != ?",
      { replacements: [messageId] },
    )) as any
    if (noticeRows.length > 0) {
      const noticeIds = noticeRows.map((r: any) => r.id)
      await sequelize.query(
        `UPDATE menus SET parentId = ? WHERE id IN (${noticeIds.map(() => '?').join(',')})`,
        { replacements: [messageId, ...noticeIds] },
      )
      logInfo(`已移动消息发布 → 消息管理 (id=${noticeIds.join(',')})`)
    }

    // 移入消息通知
    const [msgRows] = (await sequelize.query(
      "SELECT id FROM menus WHERE name = '消息通知' AND parentId != ?",
      { replacements: [messageId] },
    )) as any
    if (msgRows.length > 0) {
      const msgIds = msgRows.map((r: any) => r.id)
      await sequelize.query(
        `UPDATE menus SET parentId = ? WHERE id IN (${msgIds.map(() => '?').join(',')})`,
        { replacements: [messageId, ...msgIds] },
      )
      logInfo(`已移动消息通知 → 消息管理 (id=${msgIds.join(',')})`)
    }
  } catch (err) {
    logInfo('菜单清理迁移（可忽略）: ' + (err as Error).message)
  }
}

export async function down(_queryInterface: QueryInterface): Promise<void> {
  // 不可回滚
}