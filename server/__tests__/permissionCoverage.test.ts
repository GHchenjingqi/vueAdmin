// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const SERVER_ROOT = fileURLToPath(new URL('..', import.meta.url))

/**
 * 写接口守卫覆盖清单
 *
 * T01 的根治点：所有「管理面」写接口必须挂 requirePermission，否则权限模型只是前端遮罩。
 * 仅登录即可操作的「自助类」写接口（改自己密码、标记已读、发起申请、审批自己的待办等）
 * 明确列入豁免清单并写明理由——清单会随接口一起被校验，新增接口若未归类则本测试直接失败，
 * 从而阻止「加了管理页接口却没加守卫」这类回归。
 */
const SELF_SERVICE_EXEMPTIONS: Record<string, string> = {
  'POST /auth/login': '公开接口',
  'POST /auth/token': '公开接口（刷新令牌）',
  'DELETE /auth/session': '登出自己的会话',
  'POST /auth/password/forgot': '公开接口（邮件找回）',
  'POST /auth/password/reset': '公开接口（重置令牌）',
  'PATCH /auth/password': '修改自己的密码',
  'POST /auth/sse-ticket': '建立自己的消息推送通道',
  'POST /upload': '上传自己的附件（配额由 quotaGuard 约束）',
  'PATCH /notices': '标记公告已读',
  'PATCH /notices/:id': '标记单条公告已读',
  'PATCH /messages': '标记消息已读',
  'PATCH /messages/:id': '标记单条消息已读',
  'DELETE /messages/:id': '删除自己收到的消息',
  'POST /workflow/trigger': '发起申请（本人作为流程创建人）',
  'PATCH /approval-tasks/:id': '处理自己的待办审批',
  'POST /me/delegation': '设置本人审批委托',
  'DELETE /me/delegation/:id': '取消本人审批委托',
  'POST /ai/chat': 'AI 助手对话（个人用量）',
  'POST /ai/apply': '已由 requirePlatformAdmin 守卫',
  'POST /ai/rebuild-index': '重建个人代码索引',
  'POST /billing/subscribe': '租户自助变更套餐',
}

/**
 * 有意暂缓的写接口：所属模块没有对应菜单种子，若挂守卫会把「全员可写」收窄为「仅管理员」，
 * 属于产品行为变更，须随知识库菜单/授权一起设计（见迭代 2 待办），不在本次安全收口内顺带做。
 */
const DEFERRED_UNGUARDED: Record<string, string> = {
  'POST /categories': '知识库无菜单种子，待与租户菜单一起设计授权',
  'PUT /categories/:id': '同上',
  'DELETE /categories/:id': '同上',
  'POST /tags': '同上',
  'PUT /tags/:id': '同上',
  'DELETE /tags/:id': '同上',
  'POST /contents': '同上',
  'PUT /contents/:id': '同上',
  'DELETE /contents/:id': '同上',
}

const WRITE_METHODS = ['post', 'put', 'delete', 'patch']

/**
 * 实际挂载到 /api/v1 的路由模块。
 * server/routes 下另有 12 个从未被 import 的同名拆分文件（deptRoutes.ts 等），
 * 它们是 index.ts 里内联路由的陈旧副本、且没有任何守卫——若将来被挂载就会绕过权限校验，
 * 因此由「未挂载副本」测试专门盯住，新增挂载必须先补守卫并登记到本清单。
 */
const MOUNTED_ROUTE_FILES = [
  'routes/index.ts',
  'routes/workflowRoutes.ts',
  'routes/ai.routes.ts',
  'modules/knowledge/routes/index.ts',
  'modules/billing/routes/billingRoutes.ts',
  'modules/tenant/routes/tenantRoutes.ts',
]

function collectRouteFiles(dir: string): string[] {
  const files: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) files.push(...collectRouteFiles(full))
    else if (name.endsWith('.ts')) files.push(full)
  }
  return files
}

/** 取出 router.xxx(...) 的完整调用文本（含跨行参数） */
function extractCalls(source: string): Array<{ method: string; path: string; call: string }> {
  const calls: Array<{ method: string; path: string; call: string }> = []
  for (const m of WRITE_METHODS) {
    const token = `router.${m}(`
    let from = 0
    while (true) {
      const start = source.indexOf(token, from)
      if (start === -1) break
      let depth = 0
      let end = start
      for (let i = start + token.length - 1; i < source.length; i++) {
        const ch = source[i]
        if (ch === '(') depth++
        else if (ch === ')') {
          depth--
          if (depth === 0) {
            end = i + 1
            break
          }
        }
      }
      const call = source.slice(start, end)
      const pathMatch = call.match(/^router\.[a-z]+\(\s*'([^']+)'/)
      if (pathMatch) calls.push({ method: m.toUpperCase(), path: pathMatch[1], call })
      from = start + token.length
    }
  }
  return calls
}

function allWriteRoutes(): Array<{ file: string; method: string; path: string; call: string }> {
  const out: Array<{ file: string; method: string; path: string; call: string }> = []
  for (const rel of MOUNTED_ROUTE_FILES) {
    const file = join(SERVER_ROOT, ...rel.split('/'))
    if (!statSync(file).isFile()) continue
    for (const route of extractCalls(readFileSync(file, 'utf8'))) {
      out.push({ file: rel, ...route })
    }
  }
  return out
}

const ROUTES = allWriteRoutes()

describe('写接口权限守卫覆盖', () => {
  it('扫描到足够的写接口（路由文件解析失败时不应静默通过）', () => {
    expect(ROUTES.length).toBeGreaterThan(50)
  })

  it('每个写接口要么挂 requirePermission，要么在豁免/暂缓清单中', () => {
    const unguarded = ROUTES.filter((r) => !/requirePermission\(/.test(r.call)).map((r) => `${r.method} ${r.path}`)
    const unknown = unguarded.filter((key) => !SELF_SERVICE_EXEMPTIONS[key] && !DEFERRED_UNGUARDED[key])
    expect(unknown.map((key) => `${key} @ ${ROUTES.find((r) => `${r.method} ${r.path}` === key)?.file}`)).toEqual([])
  })

  it('豁免与暂缓清单中的接口必须仍然存在（防止清单腐化）', () => {
    const keys = new Set(ROUTES.map((r) => `${r.method} ${r.path}`))
    const stale = [...Object.keys(SELF_SERVICE_EXEMPTIONS), ...Object.keys(DEFERRED_UNGUARDED)].filter((key) => !keys.has(key))
    expect(stale).toEqual([])
  })

  it('已挂守卫的接口不得同时被声明为自助豁免（避免清单与实际冲突）', () => {
    const guarded = new Set(ROUTES.filter((r) => /requirePermission\(/.test(r.call)).map((r) => `${r.method} ${r.path}`))
    const conflict = [...Object.keys(SELF_SERVICE_EXEMPTIONS)].filter((key) => guarded.has(key))
    expect(conflict).toEqual([])
  })

  it('管理面写接口数量符合预期（用户/角色/菜单/工作流等核心域已全覆盖）', () => {
    const guardedCount = ROUTES.filter((r) => /requirePermission\(/.test(r.call)).length
    expect(guardedCount).toBeGreaterThanOrEqual(48)
  })
})

/** 收集后端源码（跳过 node_modules 与测试） */
function collectSources(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__' || name === 'dist' || name === 'logs' || name === 'uploads') continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...collectSources(full))
    else if (name.endsWith('.ts')) out.push(full)
  }
  return out
}

describe('未挂载路由副本', () => {
  const sources = collectSources(SERVER_ROOT)
  const mountedNames = new Set(MOUNTED_ROUTE_FILES.map((rel) => rel.split('/').pop()))
  const copies = collectRouteFiles(join(SERVER_ROOT, 'routes')).filter((f) => !mountedNames.has(f.split(/[\\/]/).pop()) && !f.endsWith('index.ts'))

  it('确实存在待清理的拆分路由副本（本测试的前提成立）', () => {
    expect(copies.length).toBeGreaterThan(0)
  })

  it('副本文件仍然没有任何 import 引用；一旦被挂载必须先补 requirePermission 并登记进 MOUNTED_ROUTE_FILES', () => {
    const mounted = copies
      .map((f) => f.split(/[\\/]/).pop() as string)
      .filter((name) => sources.some((src) => readFileSync(src, 'utf8').includes(`./${name.replace('.ts', '')}.js`)))
      .map((name) => name.replace('.ts', ''))
    expect(mounted).toEqual([])
  })
})
