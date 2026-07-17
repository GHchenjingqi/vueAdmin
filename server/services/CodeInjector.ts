/**
 * 代码注入引擎
 *
 * 职责：将 AI 生成的代码写入项目对应位置，并完成：
 * - 自动创建目录
 * - 自动备份（支持回滚）
 * - 自动注册路由到主路由文件
 * - 自动添加菜单到数据库
 * - 自动添加权限资源（角色关联）
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import Menu from '../models/Menu.js'
import Role from '../models/Role.js'
import RoleMenu from '../models/RoleMenu.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PROJECT_ROOT = path.resolve(__dirname, '..')

export interface GeneratedCodeFile {
  path: string
  content: string
  language?: string
  description?: string
  isNew?: boolean
}

export interface ApplyResult {
  success: boolean
  message: string
  appliedFiles: string[]
  skippedFiles: string[]
  createdMenuIds: number[]
  createdPermissions: { roleId: number; menuId: number }[]
}

interface RollbackSnapshot {
  filePath: string
  originalContent: string | null
  isNewFile: boolean
}

interface InjectedMenu {
  id: number
  parentId: number
  name: string
  path: string
  component: string
  icon?: string
}

// 回滚快照存储（内存，重启后清空，但用户可以即时回滚）
const rollbackSnapshots: RollbackSnapshot[] = []
const injectedMenus: InjectedMenu[] = []

/**
 * 根据生成的文件路径，获取绝对路径
 */
function getAbsolutePath(relativePath: string): string {
  return path.resolve(PROJECT_ROOT, relativePath)
}

/**
 * 判断文件是否在允许的目录中（防止越权）
 */
function isPathAllowed(relativePath: string): boolean {
  // 允许写入的目录
  const allowedDirs = [
    'server/controllers/',
    'server/services/',
    'server/models/',
    'server/routes/',
    'server/migrations/',
    'server/shared/',
    'src/api/',
    'src/views/',
    'src/components/',
    'src/types/',
    'src/utils/',
    '.ai-knowledge/',
  ]

  for (const dir of allowedDirs) {
    if (relativePath.startsWith(dir)) return true
  }

  // 不允许写入危险文件
  const blockedPatterns = [
    /\.env/,
    /package\.json/,
    /package-lock\.json/,
    /tsconfig\.json/,
    /vite\.config/,
    /\.git/,
    /server\.js$/,
    /app\.ts$/,
    /index\.html$/,
  ]
  for (const pattern of blockedPatterns) {
    if (pattern.test(relativePath)) return false
  }

  return false
}

/**
 * 写入文件前备份原内容到回滚快照
 */
function backupFile(filePath: string): void {
  const absPath = getAbsolutePath(filePath)
  let originalContent: string | null = null
  const isNewFile = !fs.existsSync(absPath)

  if (!isNewFile) {
    originalContent = fs.readFileSync(absPath, 'utf-8')
  }

  rollbackSnapshots.push({
    filePath,
    originalContent,
    isNewFile,
  })
}

/**
 * 分析模块名称，用于自动创建菜单
 */
function extractModuleName(files: GeneratedCodeFile[]): {
  moduleName: string
  moduleNameCn: string
  controllerPath: string | null
  routePath: string | null
  frontComponentPath: string | null
} {
  let moduleName = ''
  let moduleNameCn = ''
  let controllerPath: string | null = null
  let routePath: string | null = null
  let frontComponentPath: string | null = null

  for (const file of files) {
    const match = file.path.match(/(controllers|controller)\/([A-Za-z]+Controller)\./)
    if (match && !moduleName) {
      moduleName = match[2].replace('Controller', '')
      moduleNameCn = match[2].replace('Controller', '')
    }
    if (file.path.includes('controller') && !controllerPath) {
      controllerPath = file.path
    }
    if (file.path.includes('routes') && !routePath) {
      routePath = file.path
    }
    if (file.path.startsWith('src/views/') && !frontComponentPath) {
      frontComponentPath = file.path
    }
  }

  if (!moduleName && files[0]) {
    const basename = path.basename(files[0].path, path.extname(files[0].path))
    moduleName = basename
    moduleNameCn = basename
  }

  return { moduleName, moduleNameCn, controllerPath, routePath, frontComponentPath }
}

/**
 * 自动注册路由 - 在 app.ts 或 routes/index.ts 中添加引用
 */
async function registerRoute(routeFilePath: string): Promise<boolean> {
  try {
    const mainRouteFile = path.resolve(PROJECT_ROOT, 'server/routes/index.ts')
    if (!fs.existsSync(mainRouteFile)) {
      return false
    }

    const content = fs.readFileSync(mainRouteFile, 'utf-8')

    // 已经注册过了？
    if (content.includes(routeFilePath)) {
      return true
    }

    // 找到最后注册路由的位置
    const importLine = `import ${routeFilePath.replace('server/', '').replace('.ts', '.js')}`
    const useLine = `// ==================== AI 生成路由 ====================`

    let newContent = content

    // 如果已经有 AI 路由标记，不重复添加
    if (!newContent.includes('// ==================== AI 生成路由')) {
      // 在最后一行 export default 之前添加
      const lines = content.split('\n')
      const lastImportIndex = lines.findLastIndex(line => line.startsWith('import'))
      const lastUseIndex = lines.findLastIndex(line => line.includes('router.use('))

      if (lastImportIndex >= 0) {
        lines.splice(lastImportIndex + 1, 0, `import aiGeneratedRoutes from '../${routeFilePath.replace('server/', '')}.js'`)
      }
      if (lastUseIndex >= 0) {
        lines.splice(lastUseIndex + 1, 0, '', useLine, `router.use(aiGeneratedRoutes)`, '')
      }
      newContent = lines.join('\n')
    }

    // 备份并写入
    backupFile('server/routes/index.ts')
    fs.writeFileSync(mainRouteFile, newContent, 'utf-8')
    return true
  } catch (err) {
    console.error('[CodeInjector] 路由注册失败:', err)
    return false
  }
}

/**
 * 创建菜单到数据库
 */
async function createMenu(
  moduleName: string,
  moduleNameCn: string,
  frontPath: string,
  userId: number,
): Promise<{ menuId: number; injected: InjectedMenu } | null> {
  try {
    // 找是否已存在同名菜单
    const existing = await Menu.findOne({ where: { name: moduleNameCn } })
    if (existing) {
      return null
    }

    // 默认添加到系统管理下（或顶层）
    const parentId = 0
    const path = `/${moduleName.toLowerCase()}`
    const component = frontPath.replace('src/', '')
    const menu = await Menu.create({
      parentId,
      name: moduleNameCn,
      path,
      component,
      icon: 'Document',
      sort: 0,
      type: 'M' as const,
      status: 1,
      hidden: 0,
    })

    const injected = {
      id: menu.id,
      parentId,
      name: moduleNameCn,
      path,
      component,
      icon: 'Document',
    }
    injectedMenus.push(injected)

    return { menuId: menu.id, injected }
  } catch (err) {
    console.error('[CodeInjector] 创建菜单失败:', err)
    return null
  }
}

/**
 * 给所有管理员角色添加权限
 */
async function addPermissionsToAdmins(menuId: number): Promise<{ roleId: number; menuId: number }[]> {
  const results: { roleId: number; menuId: number }[] = []
  try {
    // 获取所有数据范围为 "全部"（即管理员）的角色
    const adminRoles = await Role.findAll({
      where: { dataScope: 1, status: 1 },
      attributes: ['id'],
    })

    for (const role of adminRoles) {
      // 检查是否已存在
      const existing = await RoleMenu.findOne({
        where: { roleId: role.id, menuId },
      })
      if (!existing) {
        await RoleMenu.create({ roleId: role.id, menuId })
        results.push({ roleId: role.id, menuId })
      }
    }
  } catch (err) {
    console.error('[CodeInjector] 添加权限失败:', err)
  }
  return results
}

/**
 * 将 AI 生成的代码应用到项目
 */
export async function apply(files: GeneratedCodeFile[], userId: number): Promise<ApplyResult> {
  const appliedFiles: string[] = []
  const skippedFiles: string[] = []
  const createdMenuIds: number[] = []
  const createdPermissions: { roleId: number; menuId: number }[] = []

  // 第一步：验证所有文件路径
  for (const file of files) {
    if (!file.path || !file.content) {
      skippedFiles.push(`${file.path || '(空路径)'}: 路径或内容为空`)
      continue
    }
    if (!isPathAllowed(file.path)) {
      skippedFiles.push(`${file.path}: 不允许写入此目录`)
      continue
    }
  }

  if (skippedFiles.length === files.length) {
    return {
      success: false,
      message: '所有文件路径验证失败，请检查路径是否在允许范围内',
      appliedFiles: [],
      skippedFiles,
      createdMenuIds: [],
      createdPermissions: [],
    }
  }

  // 第二步：写入文件（先备份）
  for (const file of files) {
    try {
      if (!file.path || !file.content) continue
      if (!isPathAllowed(file.path)) continue

      const targetPath = getAbsolutePath(file.path)
      const targetDir = path.dirname(targetPath)

      // 备份
      backupFile(file.path)

      // 确保目录存在
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true })
      }

      fs.writeFileSync(targetPath, file.content, 'utf-8')
      appliedFiles.push(file.path)
    } catch (err: any) {
      skippedFiles.push(`${file.path}: ${err.message}`)
    }
  }

  // 第三步：自动注册路由（如果是路由文件）
  const routeFile = files.find(f => f.path.includes('routes/') && f.path.endsWith('.ts'))
  if (routeFile && appliedFiles.includes(routeFile.path)) {
    const registered = await registerRoute(routeFile.path)
    if (!registered) {
      console.warn(`[CodeInjector] 路由 ${routeFile.path} 注册失败，需要手动注册`)
    }
  }

  // 第四步：自动创建菜单（如果有前端视图文件）
  const analysis = extractModuleName(files)
  if (analysis.frontComponentPath && appliedFiles.includes(analysis.frontComponentPath)) {
    const menuResult = await createMenu(
      analysis.moduleName,
      analysis.moduleNameCn,
      analysis.frontComponentPath,
      userId,
    )
    if (menuResult) {
      createdMenuIds.push(menuResult.menuId)
      // 给管理员添加权限
      const perms = await addPermissionsToAdmins(menuResult.menuId)
      createdPermissions.push(...perms)
    }
  }

  const success = appliedFiles.length > 0
  let message = `成功应用 ${appliedFiles.length} 个文件`
  if (createdMenuIds.length > 0) {
    message += `，创建 ${createdMenuIds.length} 个菜单`
  }
  if (skippedFiles.length > 0) {
    message += `，跳过 ${skippedFiles.length} 个文件`
  }

  return {
    success,
    message,
    appliedFiles,
    skippedFiles,
    createdMenuIds,
    createdPermissions,
  }
}

/**
 * 回滚最近一次代码注入
 */
export function rollback(): ApplyResult {
  const appliedFiles: string[] = []
  const skippedFiles: string[] = []

  for (const snapshot of rollbackSnapshots) {
    try {
      const targetPath = getAbsolutePath(snapshot.filePath)

      if (snapshot.isNewFile) {
        // 原本不存在，删除
        if (fs.existsSync(targetPath)) {
          fs.unlinkSync(targetPath)
          appliedFiles.push(`删除: ${snapshot.filePath}`)
        }
      } else if (snapshot.originalContent !== null) {
        // 恢复原始内容
        const targetDir = path.dirname(targetPath)
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true })
        }
        fs.writeFileSync(targetPath, snapshot.originalContent, 'utf-8')
        appliedFiles.push(`恢复: ${snapshot.filePath}`)
      }
    } catch (err: any) {
      skippedFiles.push(`${snapshot.filePath}: ${err.message}`)
    }
  }

  // TODO: 回滚数据库菜单和权限需要数据库事务，这里暂时只回滚文件
  // 菜单/权限需要手动删除，不影响使用

  rollbackSnapshots.length = 0

  return {
    success: appliedFiles.length > 0,
    message: `成功回滚 ${appliedFiles.length} 个文件，菜单和权限需要手动删除`,
    appliedFiles,
    skippedFiles,
    createdMenuIds: [],
    createdPermissions: [],
  }
}

/**
 * 获取当前回滚快照
 */
export function getRollbackSnapshots(): RollbackSnapshot[] {
  return [...rollbackSnapshots]
}

export default { apply, rollback, getRollbackSnapshots }