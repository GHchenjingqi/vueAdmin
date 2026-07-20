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

    // 兼容旧版数据库的增量迁移已收敛为一次性 Umzug 迁移
    // （server/migrations/20260717_000001_legacy-compat.ts），由上方 migrator.up() 统一执行，
    // 受 SequelizeMeta 保护，不会每次启动重复执行。

    // 种子数据（仅在用户表为空时写入）
    const userCount = await User.count()
    if (userCount === 0) {
      await seeder.up()
      logInfo('种子数据写入完成')
    } else {
      // 兼容旧版：执行原有种子数据逻辑（增量补充菜单/设置等）
      await seedData()
    }

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