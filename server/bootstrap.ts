import sequelize from './config/database.js'
import User from './models/User.js'
import RefreshToken from './models/RefreshToken.js'
import Menu from './models/Menu.js'
import Department from './models/Department.js'
import Role from './models/Role.js'
import RoleMenu from './models/RoleMenu.js'
import UserRole from './models/UserRole.js'
import Setting from './models/Setting.js'
import DictType from './models/DictType.js'
import http from 'http'
import https from 'https'
import DictData from './models/DictData.js'
import Notice from './models/Notice.js'
import NoticeRead from './models/NoticeRead.js'
import Message from './models/Message.js'
import Task from './models/Task.js'
import AiProvider from './models/AiProvider.js'
import config from './config/index.js'
import { logInfo, cleanOldLogs } from './utils/fileLogger.js'
import { loadSiteInfo, injectSiteInfo } from './utils/siteCache.js'
import { migrator, seeder } from './utils/migrator.js'
import { resolve, join } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'
import { readFileSync, existsSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 项目根目录（兼容源码和编译后）
const projectRoot = existsSync(resolve(__dirname, '../index.html'))
  ? resolve(__dirname, '..')
  : resolve(__dirname, '../..')

/**
 * 自动创建数据库（如果不存在）
 * 使用 mysql2 裸连接（不指定数据库名），避免 "Unknown database" 错误
 */
async function createDatabaseIfNotExists() {
  try {
    const mysql2 = await import('mysql2/promise')
    const db = config.database
    const conn = await mysql2.createConnection({
      host: db.host,
      port: db.port,
      user: db.user,
      password: db.password,
    })
    await conn.execute(
      `CREATE DATABASE IF NOT EXISTS \`${db.name}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    )
    await conn.end()
    logInfo(`数据库 ${db.name} 已自动创建`)
  } catch (err) {
    logInfo('数据库自动创建（可忽略）: ' + err.message)
  }
}

/**
 * 前端静态资源配置
 * - 生产环境（NODE_ENV=production）：使用预构建 dist 目录
 * - 开发环境（NODE_ENV!=production）：优先使用 Vite 中间件（HMR 热更新），
 *   这样后端 `npm run dev` 也能实时反映前端源码改动，无需每次手动 `vite build`。
 */
async function setupFrontend(app, isProduction, express, httpsServer) {
  const distDir = resolve(projectRoot, 'dist')

  // 开发环境：优先 Vite HMR 中间件（即使存在 dist 也以源码为准）
  if (!isProduction) {
    try {
      const { createServer: createViteServer } = await import('vite')
      const vite = await createViteServer({
        root: projectRoot,
        server: {
          middlewareMode: true,
          hmr: { server: httpsServer },
        },
        appType: 'spa',
        open: false,
      } as any)
      app.use(vite.middlewares)
      const indexHtmlPath = join(projectRoot, 'index.html')
      const indexHtml = readFileSync(indexHtmlPath, 'utf-8')
      app.get(/^(?!\/api).*$/, async (_req, res) => {
        const html = await vite.transformIndexHtml(_req.url, indexHtml)
        const sanitized = html.replace(
          /<meta\s+http-equiv="Content-Security-Policy".*?\/?>/gi,
          '',
        )
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.send(sanitized)
      })
      logInfo('前端开发模式：Vite HMR 已启用（实时反映源码）')
      return
    } catch (err) {
      logInfo('Vite 中间件启动失败，回退到 dist 静态资源: ' + (err as Error).message)
    }
  }

  // 生产 / 回退：使用预构建 dist 目录
  if (existsSync(distDir)) {
    app.use(express.static(distDir))
    app.get(/^(?!\/api).*$/, (_req, res) => {
      const htmlPath = join(distDir, 'index.html')
      let html = readFileSync(htmlPath, 'utf-8')
      html = injectSiteInfo(html)
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      res.send(html)
    })
    logInfo(`  前端静态资源  ${distDir}`)
    return
  }
}

/**
 * 字典迁移：旧 dicts -> dict_types + dict_data
 */
async function migrateDicts() {
  try {
    const [tables] = await sequelize.query("SHOW TABLES LIKE 'dicts'")
    if (tables.length === 0) return

    const [oldData] = await sequelize.query('SELECT * FROM dicts') as any
    if (oldData.length > 0) {
      const typeMap: Record<string, any> = {}
      for (const row of oldData) {
        if (!typeMap[row.type]) {
          typeMap[row.type] = { name: row.type, type: row.type }
        }
      }
      for (const t of Object.values(typeMap)) {
        await DictType.findOrCreate({
          where: { type: t.type },
          defaults: { name: t.name, status: 1 },
        })
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
    logInfo('字典表迁移（可忽略）: ' + err.message)
  }
}

/**
 * 种子数据：默认管理员、菜单、系统设置
 */
async function seedData() {
  const userCount = await User.count()
  if (userCount === 0) {
    await User.create({
      username: 'admin',
      nickname: '超级管理员',
      password: '123456',
      email: 'admin@example.com',
      phone: '13800138000',
      status: 1,
    })
    logInfo('默认管理员已创建（admin / 123456）')
  }

  const menuCount = await Menu.count()
  if (menuCount === 0) {
    const system = await Menu.create({ parentId: 0, name: '系统管理', path: '/system', icon: 'Setting', type: 'C', sort: 1 })
    const dashboard = await Menu.create({ parentId: 0, name: '仪表盘', path: '/dashboard', component: 'views/Dashboard.vue', icon: 'Odometer', type: 'M', sort: 0 })
    await Menu.create({ parentId: system.id, name: '基础设置', path: '/settings', component: 'views/Settings.vue', icon: 'Setting', type: 'M', sort: 0 })
    await Menu.create({ parentId: system.id, name: '用户管理', path: '/users', component: 'views/UserList.vue', icon: 'User', type: 'M', sort: 1 })
    await Menu.create({ parentId: system.id, name: '部门管理', path: '/depts', component: 'views/DeptManager.vue', icon: 'Share', type: 'M', sort: 2 })
    await Menu.create({ parentId: system.id, name: '角色管理', path: '/roles', component: 'views/RoleManager.vue', icon: 'Avatar', type: 'M', sort: 3 })
    await Menu.create({ parentId: system.id, name: '菜单管理', path: '/menus', component: 'views/MenuList.vue', icon: 'Grid', type: 'M', sort: 4 })
    await Menu.create({ parentId: system.id, name: '字典管理', path: '/dict', component: 'views/DictManager.vue', icon: 'Collection', type: 'M', sort: 5 })
    await Menu.create({ parentId: system.id, name: '文件管理', path: '/files', component: 'views/FileManager.vue', icon: 'FolderOpened', type: 'M', sort: 6 })
    await Menu.create({ parentId: system.id, name: '通知管理', path: '/notices', component: 'views/NoticeManager.vue', icon: 'Bell', type: 'M', sort: 7 })
    await Menu.create({ parentId: system.id, name: '系统日志', path: '/logs', component: 'views/SystemLog.vue', icon: 'Document', type: 'M', sort: 10 })
    await Menu.create({ parentId: system.id, name: '消息通知', path: '/messages', component: 'views/MessageList.vue', icon: 'ChatLineSquare', type: 'M', sort: 11 })
    await Menu.create({ parentId: system.id, name: '定时任务', path: '/tasks', component: 'views/TaskManager.vue', icon: 'Clock', type: 'M', sort: 12 })
    await Menu.create({ parentId: system.id, name: 'AI 提供商', path: '/ai-providers', component: 'views/AiProviderManager.vue', icon: 'Aim', type: 'M', sort: 13 })

    // 系统监控目录（与系统管理同级）
    const monitor = await Menu.create({ parentId: 0, name: '系统监控', path: '/monitor', icon: 'Monitor', type: 'C', sort: 2 })
    await Menu.create({ parentId: monitor.id, name: '在线用户', path: '/online-users', component: 'views/OnlineUsers.vue', icon: 'Connection', type: 'M', sort: 0 })
    await Menu.create({ parentId: monitor.id, name: '服务监控', path: '/server-monitor', component: 'views/ServerMonitor.vue', icon: 'DataBoard', type: 'M', sort: 1 })

    logInfo('默认菜单已创建')

    const defaultSettings = [
      { optionKey: 'site_title', optionValue: 'Vue Admin', autoload: 1, description: '站点标题' },
      { optionKey: 'site_description', optionValue: '基于 Vue 3 + Element Plus 的全栈后台管理系统', autoload: 1, description: '站点描述' },
      { optionKey: 'site_keywords', optionValue: 'Vue, Admin, Element Plus, 后台管理', autoload: 1, description: '站点关键词' },
      { optionKey: 'site_logo', optionValue: '', autoload: 1, description: '站点 Logo 地址' },
      { optionKey: 'site_favicon', optionValue: '', autoload: 1, description: '浏览器图标（favicon）地址' },
      { optionKey: 'image_compress', optionValue: '0', autoload: 1, description: '上传时是否开启图片压缩: 1=开启 0=关闭' },
      { optionKey: 'captcha_enabled', optionValue: '1', autoload: 1, description: '登录时是否开启验证码: 1=开启 0=关闭' },
      { optionKey: 'watermark_enabled', optionValue: '0', autoload: 1, description: '是否开启全局水印: 1=开启 0=关闭' },
      { optionKey: 'watermark_text', optionValue: 'Vue Admin', autoload: 1, description: '水印文字内容' },
    ]
    await Setting.bulkCreate(defaultSettings)
    logInfo('默认系统设置已创建')

    // 默认部门
    const deptCount = await Department.count()
    if (deptCount === 0) {
      const root = await Department.create({ parentId: 0, name: '总公司', sort: 0, leader: '管理员', phone: '13800138000', status: 1 })
      await Department.create({ parentId: root.id, name: '技术部', sort: 0, leader: '张三', phone: '13900139001', status: 1 })
      await Department.create({ parentId: root.id, name: '市场部', sort: 1, leader: '李四', phone: '13900139002', status: 1 })
      await Department.create({ parentId: root.id, name: '财务部', sort: 2, leader: '王五', phone: '13900139003', status: 1 })
      logInfo('默认部门数据已创建')
    }

    // 默认角色
    const roleCount = await Role.count()
    if (roleCount === 0) {
      const adminRole = await Role.create({ name: '超级管理员', code: 'admin', sort: 0, status: 1, dataScope: 1, remark: '拥有所有权限' })
      const userRole = await Role.create({ name: '普通用户', code: 'user', sort: 1, status: 1, dataScope: 2, remark: '基础权限' })

      // 超级管理员拥有所有菜单权限
      const allMenus = await Menu.findAll({ attributes: ['id'] })
      await RoleMenu.bulkCreate(allMenus.map(m => ({ roleId: adminRole.id, menuId: m.id })))

      // 默认 admin 用户赋予超级管理员角色
      const adminUser = await User.findOne({ where: { username: 'admin' } })
      if (adminUser) {
        await UserRole.create({ userId: adminUser.id, roleId: adminRole.id })
      }

      logInfo('默认角色数据已创建')
    }

    // 默认定时任务
    const taskCount = await Task.count()
    if (taskCount === 0) {
      await Task.create({
        name: '日志清理',
        cronExpression: '0 3 * * *',
        handler: 'cleanupLogs',
        status: 1,
        description: '每天凌晨3点清理90天前的日志',
      })
      await Task.create({
        name: '心跳检测',
        cronExpression: '*/5 * * * *',
        handler: 'heartbeat',
        status: 1,
        description: '每5分钟执行一次心跳检测',
      })
      logInfo('默认定时任务已创建')
    }
  } else {
    // 增量：补充缺失的菜单（挂在系统管理下面
    const systemMenu = await Menu.findOne({ where: { name: '系统管理' } })
    const systemParentId = systemMenu ? systemMenu.id : 0
    const supplements = [
      { name: '文件管理', path: '/files', component: 'views/FileManager.vue', icon: 'FolderOpened', sort: 4 },
      { name: '基础设置', path: '/settings', component: 'views/Settings.vue', icon: 'Setting', sort: 5 },
      { name: '通知管理', path: '/notices', component: 'views/NoticeManager.vue', icon: 'Bell', sort: 6 },
      { name: '部门管理', path: '/depts', component: 'views/DeptManager.vue', icon: 'Share', sort: 7 },
      { name: '角色管理', path: '/roles', component: 'views/RoleManager.vue', icon: 'Avatar', sort: 8 },
    ]
    for (const m of supplements) {
      const exists = await Menu.findOne({ where: { name: m.name } })
      if (!exists) {
        await Menu.create({ parentId: systemParentId, ...m })
        logInfo(`已补充菜单: ${m.name}`)
      }
    }

    // 增量：补充新菜单
    const newMenus = [
      { name: '消息通知', path: '/messages', component: 'views/MessageList.vue', icon: 'ChatLineSquare', sort: 11 },
      { name: '定时任务', path: '/tasks', component: 'views/TaskManager.vue', icon: 'Clock', sort: 12 },
    ]
    for (const m of newMenus) {
      const exists = await Menu.findOne({ where: { name: m.name } })
      if (!exists) {
        await Menu.create({ parentId: systemParentId, ...m })
        logInfo(`已补充菜单: ${m.name}`)
      }
    }

    // 增量：AI 提供商菜单
    const aiProviderMenu = await Menu.findOne({ where: { name: 'AI 提供商' } })
    if (!aiProviderMenu) {
      await Menu.create({ parentId: systemParentId, name: 'AI 提供商', path: '/ai-providers', component: 'views/AiProviderManager.vue', icon: 'Aim', sort: 13 })
      logInfo('已补充菜单: AI 提供商')
    }

    // 增量：系统监控目录 + 将在线用户移到系统监控下
    let monitorMenu = await Menu.findOne({ where: { name: '系统监控' } })
    if (!monitorMenu) {
      monitorMenu = await Menu.create({ parentId: 0, name: '系统监控', path: '/monitor', icon: 'Monitor', type: 'D', sort: 2 })
      logInfo('已补充菜单: 系统监控')
    }
    // 查找已有的在线用户菜单并移到系统监控下
    const onlineUsers = await Menu.findOne({ where: { name: '在线用户' } })
    if (onlineUsers && onlineUsers.parentId !== monitorMenu.id) {
      onlineUsers.parentId = monitorMenu.id
      await onlineUsers.save()
      logInfo('已移动: 在线用户 → 系统监控')
    }
    // 独立检查"服务监控"菜单（不受系统监控目录是否已存在的影响）
    const serverMonitorMenu = await Menu.findOne({ where: { name: '服务监控' } })
    if (!serverMonitorMenu) {
      await Menu.create({ parentId: monitorMenu.id, name: '服务监控', path: '/server-monitor', component: 'views/ServerMonitor.vue', icon: 'DataBoard', type: 'M', sort: 1 })
      logInfo('已补充菜单: 服务监控')
    }

    // 增量：字典管理
    const dictMenu = await Menu.findOne({ where: { name: '字典管理' } })
    if (!dictMenu) {
      await Menu.create({
        parentId: systemParentId,
        name: '字典管理', path: '/dict', component: 'views/DictManager.vue', icon: 'Collection', type: 'M', sort: 3,
      })
      logInfo('字典管理菜单已补充')
    }

    // 增量：默认系统设置
    const siteTitle = await Setting.findOne({ where: { optionKey: 'site_title' } })
    if (!siteTitle) {
      const defaults = [
        { optionKey: 'site_title', optionValue: 'Vue Admin', autoload: 1, description: '站点标题' },
        { optionKey: 'site_description', optionValue: '基于 Vue 3 + Element Plus 的全栈后台管理系统', autoload: 1, description: '站点描述' },
        { optionKey: 'site_keywords', optionValue: 'Vue, Admin, Element Plus, 后台管理', autoload: 1, description: '站点关键词' },
        { optionKey: 'site_logo', optionValue: '', autoload: 1, description: '站点 Logo 地址' },
        { optionKey: 'site_favicon', optionValue: '', autoload: 1, description: '浏览器图标（favicon）地址' },
        { optionKey: 'image_compress', optionValue: '0', autoload: 1, description: '上传时是否开启图片压缩: 1=开启 0=关闭' },
        { optionKey: 'captcha_enabled', optionValue: '1', autoload: 1, description: '登录时是否开启验证码: 1=开启 0=关闭' },
      ]
      await Setting.bulkCreate(defaults)
      logInfo('默认系统设置已补充')
    }

    // 增量：水印设置（兼容已有系统）
    const watermarkEnabled = await Setting.findOne({ where: { optionKey: 'watermark_enabled' } })
    if (!watermarkEnabled) {
      await Setting.create({ optionKey: 'watermark_enabled', optionValue: '0', autoload: 1, description: '是否开启全局水印: 1=开启 0=关闭' })
      await Setting.create({ optionKey: 'watermark_text', optionValue: 'Vue Admin', autoload: 1, description: '水印文字内容' })
      logInfo('默认水印设置已补充')
    }

    // 增量：确保验证码默认开启（兼容已有数据库）
    const captchaSetting = await Setting.findOne({ where: { optionKey: 'captcha_enabled' } })
    if (captchaSetting && captchaSetting.optionValue !== '1') {
      captchaSetting.optionValue = '1'
      await captchaSetting.save()
      logInfo('已更新: captcha_enabled → 1（验证码默认开启）')
    }

    // 增量：默认定时任务
    const taskCount = await Task.count()
    if (taskCount === 0) {
      await Task.create({
        name: '日志清理',
        cronExpression: '0 3 * * *',
        handler: 'cleanupLogs',
        status: 1,
        description: '每天凌晨3点清理90天前的日志',
      })
      await Task.create({
        name: '心跳检测',
        cronExpression: '*/5 * * * *',
        handler: 'heartbeat',
        status: 1,
        description: '每5分钟执行一次心跳检测',
      })
      logInfo('默认定时任务已创建')
    }
  }
}

/**
 * 迁移：users 表增加 deptId 列
 */
async function migrateUsersDeptId() {
  try {
    const [cols] = await sequelize.query("SHOW COLUMNS FROM users LIKE 'deptId'")
    if (cols.length === 0) {
      await sequelize.query('ALTER TABLE users ADD COLUMN deptId INT UNSIGNED NULL COMMENT "部门 ID" AFTER status')
      logInfo('users 表已添加 deptId 列')
    }
  } catch (err) {
    logInfo('deptId 迁移（可忽略）: ' + err.message)
  }
}

/**
 * 迁移：users 表增加 nickname 列
 */
async function migrateUsersNickname() {
  try {
    const [cols] = await sequelize.query("SHOW COLUMNS FROM users LIKE 'nickname'")
    if (cols.length === 0) {
      await sequelize.query('ALTER TABLE users ADD COLUMN nickname VARCHAR(50) NULL COMMENT "昵称（显示用）" AFTER username')
      logInfo('users 表已添加 nickname 列')
    }
  } catch (err) {
    logInfo('nickname 迁移（可忽略）: ' + err.message)
  }
}

/**
 * 迁移：users 表增加 bio 列
 */
async function migrateUsersBio() {
  try {
    const [cols] = await sequelize.query("SHOW COLUMNS FROM users LIKE 'bio'")
    if (cols.length === 0) {
      await sequelize.query('ALTER TABLE users ADD COLUMN bio VARCHAR(500) NULL DEFAULT "\u8fd9\u4e2a\u4eba\u5f88\u61d2" COMMENT "\u4e2a\u4eba\u4ecb\u7ecd" AFTER deptId')
      logInfo('users 表已添加 bio 列')
    }
  } catch (err) {
    logInfo('bio 迁移（可忽略）: ' + err.message)
  }
}

/**
 * 迁移：users 表增加安全相关字段（passwordResetRequired, loginAttempts, lockedUntil）
 */
async function migrateUsersSecurity() {
  try {
    const [pwdCols] = await sequelize.query("SHOW COLUMNS FROM users LIKE 'passwordResetRequired'")
    if (pwdCols.length === 0) {
      await sequelize.query('ALTER TABLE users ADD COLUMN passwordResetRequired TINYINT NOT NULL DEFAULT 0 COMMENT "是否需要修改密码? 1=需要 0=不需要" AFTER password')
      logInfo('users 表已添加 passwordResetRequired 列')
    }
    const [attemptCols] = await sequelize.query("SHOW COLUMNS FROM users LIKE 'loginAttempts'")
    if (attemptCols.length === 0) {
      await sequelize.query('ALTER TABLE users ADD COLUMN loginAttempts INT NOT NULL DEFAULT 0 COMMENT "连续登录失败次数" AFTER passwordResetRequired')
      logInfo('users 表已添加 loginAttempts 列')
    }
    const [lockCols] = await sequelize.query("SHOW COLUMNS FROM users LIKE 'lockedUntil'")
    if (lockCols.length === 0) {
      await sequelize.query('ALTER TABLE users ADD COLUMN lockedUntil DATETIME NULL COMMENT "账号锁定截止时间" AFTER loginAttempts')
      logInfo('users 表已添加 lockedUntil 列')
    }
  } catch (err) {
    logInfo('users 安全字段迁移（可忽略）: ' + err.message)
  }
}

/**
 * 清理过期 refresh_tokens
 */
async function cleanupExpiredRefreshTokens() {
  try {
    const [result] = await sequelize.query("DELETE FROM refresh_tokens WHERE expiresAt < NOW()") as any
    const deleted = result.affectedRows || 0
    if (deleted > 0) {
      logInfo(`已清理${deleted} 条过期的 refresh_token`)
    }
  } catch (err) {
    logInfo('refresh_token 清理（可忽略）: ' + err.message)
  }
}

/**
 * 迁移：refresh_tokens 表增加 revokedAt 列
 */
async function migrateRefreshTokensRevokedAt() {
  try {
    const [cols] = await sequelize.query("SHOW COLUMNS FROM refresh_tokens LIKE 'revokedAt'")
    if (cols.length === 0) {
      await sequelize.query('ALTER TABLE refresh_tokens ADD COLUMN revokedAt DATETIME NULL COMMENT "撤销时间（多标签宽限期判定）" AFTER rememberMe')
      logInfo('refresh_tokens 表已添加 revokedAt 列')
    }
  } catch (err) {
    logInfo('revokedAt 迁移（可忽略）: ' + err.message)
  }
}

/**
 * 迁移：refresh_tokens 表增加 purpose 列（区分 auth / password_reset）
 */
async function migrateRefreshTokensPurpose() {
  try {
    const [cols] = await sequelize.query("SHOW COLUMNS FROM refresh_tokens LIKE 'purpose'")
    if (cols.length === 0) {
      await sequelize.query('ALTER TABLE refresh_tokens ADD COLUMN purpose VARCHAR(20) NOT NULL DEFAULT "auth" COMMENT "令牌用途: auth=登录认证, password_reset=密码重置" AFTER revokedAt')
      logInfo('refresh_tokens 表已添加 purpose 列')
    }
  } catch (err) {
    logInfo('purpose 迁移（可忽略）: ' + err.message)
  }
}

/**
 * 迁移：创建 ai_providers 表
 */
async function migrateAiProviders() {
  try {
    const [tables] = await sequelize.query("SHOW TABLES LIKE 'ai_providers'")
    if (tables.length === 0) {
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

      // 如果环境变量中有 DEEPSEEK_API_KEY，自动创建默认提供商
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
    logInfo('ai_providers 迁移（可忽略）: ' + err.message)
  }
}

/**
 * 菜单类型统一为 M/C/F，并新增按钮级权限字段 permission：
 * - 旧数据 type='D'(目录) 迁移为 'C'
 * - ENUM 扩展为 ('M','C','F')
 * - 新增 permission 列
 */
async function migrateMenusTypeAndPermission() {
  try {
    const [tables] = await sequelize.query("SHOW TABLES LIKE 'menus'")
    if (tables.length === 0) return

    const [typeCols] = await sequelize.query("SHOW COLUMNS FROM menus LIKE 'type'")
    const typeCol = (typeCols as any[])[0]
    const needsEnumChange = typeCol && !/C/.test(typeCol.Type) && !/F/.test(typeCol.Type)

    if (needsEnumChange) {
      // MySQL 不允许直接将 ENUM('D','M') 改为 ENUM('M','C','F')（已有 D 数据不匹配新枚举会报
      // "Data truncated"）。先扩展为包含 D 的超集，改写数据后再收缩为目标枚举。
      await sequelize.query(
        "ALTER TABLE menus MODIFY COLUMN type ENUM('D','M','C','F') NOT NULL DEFAULT 'M' COMMENT '类型: M=菜单, C=目录, F=按钮'"
      )
      logInfo('menus.type 已临时扩展为 ENUM(D,M,C,F)')
    }

    const [updateResult] = await sequelize.query("UPDATE menus SET type='C' WHERE type='D'") as any
    if (updateResult && updateResult.affectedRows > 0) {
      logInfo(`已迁移 ${updateResult.affectedRows} 条目录菜单 type: D -> C`)
    }

    if (needsEnumChange) {
      await sequelize.query(
        "ALTER TABLE menus MODIFY COLUMN type ENUM('M','C','F') NOT NULL DEFAULT 'M' COMMENT '类型: M=菜单, C=目录, F=按钮'"
      )
      logInfo('menus.type 已收缩为 ENUM(M,C,F)')
    }

    const [permCols] = await sequelize.query("SHOW COLUMNS FROM menus LIKE 'permission'")
    if ((permCols as any[]).length === 0) {
      await sequelize.query(
        "ALTER TABLE menus ADD COLUMN permission VARCHAR(100) NULL COMMENT '权限标识(按钮级)，如 system:user:add' AFTER type"
      )
      logInfo('menus.permission 列已添加')
    }
  } catch (err) {
    logInfo('menus 类型迁移（可忽略）: ' + err.message)
  }
}

/**
 * 角色菜单关联表添加 id 自增主键列。
 * 旧版表结构为复合主键 (roleId, menuId)，无自增 id 列，
 * 但 RoleMenu 模型声明了 id 字段，导致 bulkCreate 生成的 INSERT 包含 id 列报错。
 */
async function migrateRoleMenusId() {
  try {
    const [cols] = await sequelize.query("SHOW COLUMNS FROM role_menus LIKE 'id'")
    if ((cols as any[]).length === 0) {
      await sequelize.query(
        "ALTER TABLE role_menus ADD COLUMN id INT UNSIGNED AUTO_INCREMENT FIRST, DROP PRIMARY KEY, ADD PRIMARY KEY (id), ADD UNIQUE KEY role_menus_roleId_menuId_unique (roleId, menuId)"
      )
      logInfo('role_menus 表已添加 id 自增主键列')
    }
  } catch (err) {
    logInfo('role_menus 迁移（可忽略）: ' + err.message)
  }
}

/**
 * 密码迁移：旧明文密码 -> bcrypt 哈希
 */
async function migratePasswords() {
  try {
    const bcrypt = await import('bcryptjs')
    const [users] = await sequelize.query(
      "SELECT id, password FROM users WHERE password NOT LIKE '$2a$%' AND password NOT LIKE '$2b$%'"
    ) as any
    if (users.length > 0) {
      const saltRounds = 10
      for (const u of users) {
        const hashed = await bcrypt.hash(u.password, saltRounds)
        await sequelize.query('UPDATE users SET password = ? WHERE id = ?', {
          replacements: [hashed, u.id],
        })
      }
      logInfo(`已迁移${users.length} 个用户的密码为 bcrypt 哈希`)
    }
  } catch (err) {
    logInfo('密码迁移（可忽略）: ' + err.message)
  }
}

/**
 * 启动服务：数据库同步、数据迁移、种子数据、前端托管、HTTP 监听
 * @param {import('express').Express} app - Express 应用实例
 */
export default async function bootstrap(app) {
  try {
    const express = (await import('express')).default

    // 模型关联
    User.belongsTo(Department, { foreignKey: 'deptId', as: 'dept' })
    Department.hasMany(User, { foreignKey: 'deptId', as: 'users' })
    User.belongsToMany(Role, { through: UserRole, foreignKey: 'userId', as: 'roles' })
    Role.belongsToMany(User, { through: UserRole, foreignKey: 'roleId', as: 'users' })
    Role.belongsToMany(Menu, { through: RoleMenu, foreignKey: 'roleId', as: 'menus' })
    Menu.belongsToMany(Role, { through: RoleMenu, foreignKey: 'menuId', as: 'roles' })
    Message.belongsTo(User, { foreignKey: 'fromUserId', as: 'fromUser' })

    // 先测试连接，数据库不存在则自动创建
    try {
      await sequelize.authenticate()
    } catch (connErr) {
      if (connErr.message.includes('Unknown database')) {
        await createDatabaseIfNotExists()
      } else {
        throw connErr
      }
    }

    // 执行数据库迁移（替代 sequelize.sync()）
    const pending = await migrator.pending()
    if (pending.length > 0) {
      logInfo(`发现 ${pending.length} 个待执行迁移`)
      await migrator.up()
      logInfo('数据库迁移完成')
    } else {
      logInfo('数据库已是最新版本，跳过迁移')
    }

    cleanOldLogs()

    // 兼容旧版：对已有数据库执行增量迁移（如果旧迁移记录不存在）
    // 这些函数内部有 SHOW COLUMNS 检查，不会重复执行
    await migrateDicts()
    await migrateUsersDeptId()
    await migrateUsersNickname()
    await migrateUsersBio()
    await migrateUsersSecurity()
    await migrateRefreshTokensRevokedAt()
    await migrateRefreshTokensPurpose()
    await cleanupExpiredRefreshTokens()

    // 种子数据（仅在用户表为空时写入）
    const userCount = await User.count()
    if (userCount === 0) {
      await seeder.up()
      logInfo('种子数据写入完成')
    } else {
      // 兼容旧版：执行原有种子数据逻辑（增量补充）
      await seedData()
    }

    await migratePasswords()
    await migrateAiProviders()
    await migrateMenusTypeAndPermission()
    await migrateRoleMenusId()
    await loadSiteInfo()

    // 自签名证书（开发环境），解决 Chrome HTTPS-First 模式报错
    const { getOrCreateCert } = await import('./utils/generateCert.js')
    const { key, cert } = await getOrCreateCert()

    // 提前创建 HTTPS 服务器实例，供 Vite HMR WebSocket 挂载（setupFrontend 需要）
    const httpsServer = https.createServer({ key, cert }, app)

    await setupFrontend(app, process.env.NODE_ENV === 'production', express, httpsServer)

    // 在线用户追踪中间件
    const { updateUserActivity } = await import('./utils/onlineUsers.js')
    app.use('/api', (req, res, next) => {
      if (req.user) {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress
        updateUserActivity(req.user.id, ip, req.headers['user-agent'])
      }
      next()
    })

    // 初始化定时任务调度器
    const { initScheduler } = await import('./utils/scheduler.js')
    await initScheduler()

    // HTTPS 服务器监听（开发环境使用自签名证书）
    httpsServer.listen(config.server.port, '0.0.0.0', () => {
      const banner = [
        '='.repeat(50),
        `  🚀 Vue Admin 服务启动成功`,
        `  🌐 访问地址:  https://192.168.12.251:${config.server.port}`,
        `  🌐 本地地址:  https://localhost:${config.server.port}`,
        `  📡 API 接口:  https://localhost:${config.server.port}/api`,
        `  📖 API 文档:  https://localhost:${config.server.port}/api/docs`,
        `  🔧 运行模式:  ${process.env.NODE_ENV === 'production' ? '生产' : '开发'}`,
        `  ⚠️  自签名证书，浏览器首次访问需点击"高级"→"继续前往"`,
        '='.repeat(50),
      ].join('\n')
      logInfo('\n' + banner)
    })

    // HTTP 服务器（自动重定向到 HTTPS）
    const httpServer = http.createServer((req, res) => {
      const host = req.headers.host?.split(':')[0] || 'localhost'
      res.writeHead(301, { Location: `https://${host}:${config.server.port}${req.url}` })
      res.end()
    })
    httpServer.listen(config.server.port + 1, '0.0.0.0', () => {
      // HTTP 重定向服务器已启动，仅用于将 HTTP 流量重定向到 HTTPS
    })

    // 优雅关闭：处理 SIGTERM / SIGINT 信号
    let isShuttingDown = false
    const gracefulShutdown = async (signal: string) => {
      if (isShuttingDown) return
      isShuttingDown = true
      logInfo(`收到 ${signal} 信号，正在优雅关闭...`)

      // 1. 停止接受新请求（10 秒超时）
      const closeServers = Promise.all([
        new Promise<void>((resolve) => {
          httpsServer.close(() => {
            logInfo('HTTPS 服务器已停止接受新连接')
            resolve()
          })
          setTimeout(() => {
            logInfo('HTTPS 服务器关闭超时，强制继续')
            resolve()
          }, 10000)
        }),
        new Promise<void>((resolve) => {
          httpServer.close(() => resolve())
          setTimeout(() => resolve(), 10000)
        }),
      ])

      try {
        await closeServers
        // 2. 关闭数据库连接
        const { sequelize } = await import('./config/database.js')
        if (sequelize) {
          await sequelize.close()
          logInfo('数据库连接已关闭')
        }
        logInfo('✅ 优雅关闭完成')
        process.exit(0)
      } catch (err) {
        console.error('❌ 关闭过程中出错:', err)
        process.exit(1)
      }
    }
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
    process.on('SIGINT', () => gracefulShutdown('SIGINT'))
  } catch (err) {
    console.error('服务启动失败:', err.message)
    process.exit(1)
  }
}