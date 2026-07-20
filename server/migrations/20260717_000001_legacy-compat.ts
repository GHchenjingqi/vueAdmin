import type { QueryInterface } from 'sequelize'
import sequelize from '../config/database.js'
import AiProvider from '../models/AiProvider.js'
import { logInfo } from '../utils/fileLogger.js'

/**
 * 存量库兼容迁移（一次性）
 *
 * 将原先散落在 bootstrap.ts 中、每次启动都会执行的 ad-hoc ALTER TABLE /
 * 密码重算 / 字典与菜单兼容逻辑，收敛为一次性 Umzug 迁移。
 * 这样既有数据库只在首次升级时执行一次（受 SequelizeMeta 保护，不会重复），
 * 避免生产环境每次启动都加表锁、遍历用户表做 bcrypt 的性能与一致性问题。
 *
 * 所有函数内部均已做存在性检查（SHOW COLUMNS / SHOW TABLES），可重复安全调用，
 * 但 Umzug 保证其 up() 仅执行一次。
 */

async function migrateDicts(): Promise<void> {
  try {
    const [tables] = await sequelize.query("SHOW TABLES LIKE 'dicts'")
    if ((tables as any[]).length === 0) return

    const [oldData] = (await sequelize.query('SELECT * FROM dicts')) as any
    if (oldData.length > 0) {
      const DictType = (await import('../models/DictType.js')).default as any
      const DictData = (await import('../models/DictData.js')).default as any
      const typeMap: Record<string, any> = {}
      for (const row of oldData) {
        if (!typeMap[row.type]) typeMap[row.type] = { name: row.type, type: row.type }
      }
      for (const t of Object.values(typeMap)) {
        await DictType.findOrCreate({ where: { type: t.type }, defaults: { name: t.name, status: 1 } })
      }
      for (const row of oldData) {
        await DictData.findOrCreate({
          where: { dictType: row.type, value: row.value },
          defaults: {
            dictType: row.type,
            label: row.label,
            value: row.value,
            sort: row.sort || 0,
            status: row.status ?? 1,
            remark: row.description || '',
          },
        })
      }
      logInfo(`已迁移 ${oldData.length} 条旧字典数据`)
    }
    await sequelize.query('DROP TABLE IF EXISTS dicts')
    logInfo('旧表 dicts 已清理')
  } catch (err) {
    logInfo('字典表迁移（可忽略）: ' + (err as Error).message)
  }
}

async function addColumnIfMissing(table: string, column: string, ddl: string): Promise<void> {
  const [cols] = (await sequelize.query(`SHOW COLUMNS FROM \`${table}\` LIKE '${column}'`)) as any
  if ((cols as any[]).length === 0) {
    await sequelize.query(ddl)
    logInfo(`${table} 表已添加 ${column} 列`)
  }
}

async function migrateUsersColumns(): Promise<void> {
  await addColumnIfMissing('users', 'deptId', "ALTER TABLE users ADD COLUMN deptId INT UNSIGNED NULL COMMENT '部门 ID' AFTER status")
  await addColumnIfMissing('users', 'nickname', "ALTER TABLE users ADD COLUMN nickname VARCHAR(50) NULL COMMENT '昵称（显示用）' AFTER username")
  await addColumnIfMissing('users', 'bio', "ALTER TABLE users ADD COLUMN bio VARCHAR(500) NULL DEFAULT '这个人很懒' COMMENT '个人介绍' AFTER deptId")
  await addColumnIfMissing(
    'users',
    'passwordResetRequired',
    "ALTER TABLE users ADD COLUMN passwordResetRequired TINYINT NOT NULL DEFAULT 0 COMMENT '是否需要修改密码? 1=需要 0=不需要' AFTER password",
  )
  await addColumnIfMissing(
    'users',
    'loginAttempts',
    "ALTER TABLE users ADD COLUMN loginAttempts INT NOT NULL DEFAULT 0 COMMENT '连续登录失败次数' AFTER passwordResetRequired",
  )
  await addColumnIfMissing(
    'users',
    'lockedUntil',
    "ALTER TABLE users ADD COLUMN lockedUntil DATETIME NULL COMMENT '账号锁定截止时间' AFTER loginAttempts",
  )
}

async function migrateRefreshTokensColumns(): Promise<void> {
  await addColumnIfMissing(
    'refresh_tokens',
    'revokedAt',
    "ALTER TABLE refresh_tokens ADD COLUMN revokedAt DATETIME NULL COMMENT '撤销时间（多标签宽限期判定）' AFTER rememberMe",
  )
  await addColumnIfMissing(
    'refresh_tokens',
    'purpose',
    "ALTER TABLE refresh_tokens ADD COLUMN purpose VARCHAR(20) NOT NULL DEFAULT 'auth' COMMENT '令牌用途: auth=登录认证, password_reset=密码重置' AFTER revokedAt",
  )
}

async function migrateAiProviders(): Promise<void> {
  try {
    const [tables] = await sequelize.query("SHOW TABLES LIKE 'ai_providers'")
    if ((tables as any[]).length === 0) {
      await sequelize.query(`
        CREATE TABLE ai_providers (
          id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(100) NOT NULL UNIQUE COMMENT '提供商名称',
          apiBaseUrl VARCHAR(255) NOT NULL COMMENT 'API 基础地址',
          apiKey VARCHAR(500) NOT NULL COMMENT 'API Key',
          models VARCHAR(500) NOT NULL DEFAULT 'deepseek-chat' COMMENT '可用模型列表，逗号分隔',
          defaultModel VARCHAR(100) NOT NULL DEFAULT 'deepseek-chat' COMMENT '默认模型',
          enabled TINYINT NOT NULL DEFAULT 1 COMMENT '是否启用: 1=启用, 0=禁用',
          sort INT NOT NULL DEFAULT 0 COMMENT '排序号',
          description VARCHAR(255) DEFAULT NULL COMMENT '备注说明',
          createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI 提供商配置'
      `)
      logInfo('ai_providers 表已创建')

      if (process.env.DEEPSEEK_API_KEY) {
        await AiProvider.create({
          name: 'DeepSeek',
          apiBaseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
          apiKey: process.env.DEEPSEEK_API_KEY,
          models: 'deepseek-chat,deepseek-coder',
          defaultModel: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
          enabled: 1,
          sort: 0,
          description: '系统自动创建（基于 DEEPSEEK_API_KEY 环境变量）',
        })
        logInfo('已自动创建默认 AI 提供商: DeepSeek')
      }
    }
  } catch (err) {
    logInfo('ai_providers 迁移（可忽略）: ' + (err as Error).message)
  }
}

async function migrateMenusTypeAndPermission(): Promise<void> {
  try {
    const [tables] = await sequelize.query("SHOW TABLES LIKE 'menus'")
    if ((tables as any[]).length === 0) return

    const [typeCols] = (await sequelize.query("SHOW COLUMNS FROM menus LIKE 'type'")) as any
    const typeCol = typeCols[0]
    const needsEnumChange = typeCol && !/C/.test(typeCol.Type) && !/F/.test(typeCol.Type)

    if (needsEnumChange) {
      await sequelize.query(
        "ALTER TABLE menus MODIFY COLUMN type ENUM('D','M','C','F') NOT NULL DEFAULT 'M' COMMENT '类型: M=菜单, C=目录, F=按钮'",
      )
      logInfo('menus.type 已临时扩展为 ENUM(D,M,C,F)')
    }

    const [updateResult] = (await sequelize.query("UPDATE menus SET type='C' WHERE type='D'")) as any
    if (updateResult && updateResult.affectedRows > 0) {
      logInfo(`已迁移 ${updateResult.affectedRows} 条目录菜单 type: D -> C`)
    }

    if (needsEnumChange) {
      await sequelize.query(
        "ALTER TABLE menus MODIFY COLUMN type ENUM('M','C','F') NOT NULL DEFAULT 'M' COMMENT '类型: M=菜单, C=目录, F=按钮'",
      )
      logInfo('menus.type 已收缩为 ENUM(M,C,F)')
    }

    await addColumnIfMissing(
      'menus',
      'permission',
      "ALTER TABLE menus ADD COLUMN permission VARCHAR(100) NULL COMMENT '权限标识(按钮级)，如 system:user:add' AFTER type",
    )
  } catch (err) {
    logInfo('menus 类型迁移（可忽略）: ' + (err as Error).message)
  }
}

async function migrateRoleMenusId(): Promise<void> {
  const [cols] = (await sequelize.query("SHOW COLUMNS FROM role_menus LIKE 'id'")) as any
  if ((cols as any[]).length === 0) {
    await sequelize.query(
      'ALTER TABLE role_menus ADD COLUMN id INT UNSIGNED AUTO_INCREMENT FIRST, DROP PRIMARY KEY, ADD PRIMARY KEY (id), ADD UNIQUE KEY role_menus_roleId_menuId_unique (roleId, menuId)',
    )
    logInfo('role_menus 表已添加 id 自增主键列')
  }
}

async function migratePasswords(): Promise<void> {
  try {
    const bcrypt = await import('bcryptjs')
    const [users] = (await sequelize.query(
      "SELECT id, password FROM users WHERE password NOT LIKE '$2a$%' AND password NOT LIKE '$2b$%'",
    )) as any
    if (users.length > 0) {
      const saltRounds = 10
      for (const u of users) {
        const hashed = await bcrypt.hash(u.password, saltRounds)
        await sequelize.query('UPDATE users SET password = ? WHERE id = ?', { replacements: [hashed, u.id] })
      }
      logInfo(`已迁移${users.length} 个用户的密码为 bcrypt 哈希`)
    }
  } catch (err) {
    logInfo('密码迁移（可忽略）: ' + (err as Error).message)
  }
}

async function cleanupExpiredRefreshTokens(): Promise<void> {
  try {
    const [result] = (await sequelize.query('DELETE FROM refresh_tokens WHERE expiresAt < NOW()')) as any
    const deleted = result.affectedRows || 0
    if (deleted > 0) logInfo(`已清理${deleted} 条过期的 refresh_token`)
  } catch (err) {
    logInfo('refresh_token 清理（可忽略）: ' + (err as Error).message)
  }
}

export async function up(_queryInterface: QueryInterface): Promise<void> {
  await migrateDicts()
  await migrateUsersColumns()
  await migrateRefreshTokensColumns()
  await cleanupExpiredRefreshTokens()
  await migrateAiProviders()
  await migrateMenusTypeAndPermission()
  await migrateRoleMenusId()
  await migratePasswords()
  logInfo('存量库兼容迁移完成')
}

export async function down(_queryInterface: QueryInterface): Promise<void> {
  // 存量兼容迁移不可回滚（已删除的旧表、已重算的密码无法还原），保持为空。
}
