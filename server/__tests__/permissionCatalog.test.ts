// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { PERMISSION_CATALOG, ALL_PERMISSION_CODES } from '../utils/permissionCatalog.js'

const SERVER_ROOT = fileURLToPath(new URL('..', import.meta.url))

/** 递归收集路由源文件（守卫声明只允许出现在 routes 目录中） */
function collectRouteFiles(dir: string): string[] {
  const files: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      files.push(...collectRouteFiles(full))
    } else if (name.endsWith('.ts')) {
      files.push(full)
    }
  }
  return files
}

const ROUTE_FILES = [...collectRouteFiles(join(SERVER_ROOT, 'routes')), ...collectRouteFiles(join(SERVER_ROOT, 'modules'))]

const GUARD_RE = /requirePermission\(([^)]*)\)/g
const CODE_RE = /'([^']+)'/g

function guardedCodes(): Array<{ file: string; code: string }> {
  const found: Array<{ file: string; code: string }> = []
  for (const file of ROUTE_FILES) {
    const source = readFileSync(file, 'utf8')
    for (const [, args] of source.matchAll(GUARD_RE)) {
      for (const [, code] of args.matchAll(CODE_RE)) {
        found.push({ file, code })
      }
    }
  }
  return found
}

/**
 * 权限码挂靠页面菜单的落库来源：
 * - seeders/：常规菜单种子；
 * - modules/tenant/services/menuTemplateService.ts：平台控制台菜单由「模板复制」体系落库
 *   （迁移与新库种子都调用它），不存在独立 seeder 文件，因此一并扫描。
 */
const MENU_SOURCE_FILES = ['seeders', 'modules/tenant/services']

function seedMenuPaths(): Set<string> {
  const paths = new Set<string>()
  for (const relDir of MENU_SOURCE_FILES) {
    const dir = join(SERVER_ROOT, ...relDir.split('/'))
    if (!statSync(dir).isDirectory()) continue
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.ts')) continue
      const source = readFileSync(join(dir, name), 'utf8')
      for (const [, p] of source.matchAll(/path:\s*'([^']+)'/g)) paths.add(p)
    }
  }
  return paths
}

describe('permissionCatalog 与路由守卫一致性', () => {
  it('目录中权限码唯一', () => {
    expect(new Set(ALL_PERMISSION_CODES).size).toBe(ALL_PERMISSION_CODES.length)
  })

  it('权限码遵循 模块:实体:动作 三段命名', () => {
    const malformed = ALL_PERMISSION_CODES.filter((code) => !/^[a-z-]+:[a-z-]+:[a-zA-Z]+$/.test(code))
    expect(malformed).toEqual([])
  })

  it('路由上声明的每个权限码都存在于目录中', () => {
    const unknown = guardedCodes().filter(({ code }) => !ALL_PERMISSION_CODES.includes(code))
    expect(unknown.map(({ file, code }) => `${code}@${file.replace(SERVER_ROOT, '')}`)).toEqual([])
  })

  it('目录中每个权限码都至少被一条路由使用（不产生无效按钮）', () => {
    const used = new Set(guardedCodes().map(({ code }) => code))
    expect(ALL_PERMISSION_CODES.filter((code) => !used.has(code))).toEqual([])
  })

  it('每个权限码挂靠的父菜单在菜单种子中存在', () => {
    const paths = seedMenuPaths()
    const orphans = PERMISSION_CATALOG.filter((entry) => !paths.has(entry.parentPath)).map((e) => `${e.code}→${e.parentPath}`)
    expect(orphans).toEqual([])
  })

  it('前端已使用的权限码在后端目录中有同名条目', () => {
    const directiveSource = readFileSync(join(SERVER_ROOT, '../src/views/UserList.vue'), 'utf8')
    const used = [...directiveSource.matchAll(/v-permission="\['([^']+)'\]"/g)].map((m) => m[1])
    expect(used.length).toBeGreaterThan(0)
    expect(used.filter((code) => !ALL_PERMISSION_CODES.includes(code))).toEqual([])
  })
})
