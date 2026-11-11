// @vitest-environment node
/**
 * P5-T06 CMS 后台写入面安全回归（源码级锁定，零 DB 依赖）
 *
 * 与 security-audit.test.ts 的「配置接口越权修改（源码回归）」同一手法：
 * 一旦后续改动把 admin 端点鉴权摘掉、让更新接口能改 status（绕过缓存失效）、
 * 或去掉结构化数据的 XSS 转义，这里立即失败。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const read = (p: string): string => readFileSync(join(__dirname, '..', p), 'utf8')

describe('P5-T06 admin 端点鉴权（源码回归）', () => {
  it('全部 /articles 写入路由必须同时挂 authMiddleware 与 requireAdmin', () => {
    const src = read('modules/shop/routes/index.ts')
    const lines = src
      .split('\n')
      .filter((l) => /router\.(get|post|put|delete)\('\/articles/.test(l))
    expect(lines.length).toBe(6)
    for (const line of lines) {
      expect(line).toContain('authMiddleware')
      expect(line).toContain('requireAdmin')
    }
  })

  it('更新接口不接受 status：状态变更只能走 publish/unpublish', () => {
    const schema = read('shared/schemas/cmsAdmin.ts')
    expect(schema).toMatch(/articleUpdateSchema\s*=\s*articleCreateSchema[\s\S]*?\.omit\(\{\s*status:\s*true\s*\}\)/)
    expect(schema).toContain('至少提供一个待更新字段')

    const controller = read('modules/shop/controllers/articleAdminController.ts')
    expect(controller).toContain('publishArticle')
    expect(controller).toContain('unpublishArticle')
  })

  it('slug 校验拒绝路径穿越、大写与空格', () => {
    const schema = read('shared/schemas/cmsAdmin.ts')
    expect(schema).toMatch(/regex\(\/\^\[a-z0-9\]/)
    expect(schema).toContain('articleSlugSchema')
  })

  it('公开读端点仍免 admin 鉴权，且带 ETag / 缓存头 / 404 优先', () => {
    const publicRoutes = read('modules/storefront/routes/cms.ts')
    expect(publicRoutes).not.toContain('requireAdmin')
    const controller = read('modules/storefront/controllers/cmsController.ts')
    expect(controller).toContain('etagMatches')
    expect(controller).toContain('Cache-Control')
    expect(controller).toMatch(/getArticleBySlug[\s\S]*?etagMatches/)
  })

  it('写操作必须触发缓存失效与审计；失效器异常不得阻断发布', () => {
    const service = read('modules/storefront/services/cmsService.ts')
    for (const fn of ['createArticle', 'updateArticle', 'publishArticle', 'unpublishArticle']) {
      const body = service.slice(service.indexOf(`export async function ${fn}`))
      expect(body.slice(0, 1400)).toContain('changed(')
      expect(body.slice(0, 1400)).toContain('auditArticle(')
    }
    const cache = read('modules/storefront/services/cmsCacheService.ts')
    expect(cache).toContain('不阻断发布')
    expect(cache).toContain('catch (err)')
  })

  it('前端 JSON-LD 注入转义 < 防脚本提前闭合', () => {
    const page = read('../shops/pages/blog/[slug].vue')
    expect(page).toContain('application/ld+json')
    expect(page).toContain('BlogPosting')
    expect(page).toContain("replace(/</g")
  })
})
