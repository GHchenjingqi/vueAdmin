import { describe, it, expect } from 'vitest'
import { isPathAllowed } from '../services/CodeInjector.js'

/**
 * 回归测试：CodeInjector.isPathAllowed 路径穿越防护
 *
 * 修复前用 `relativePath.startsWith(dir)` 做前缀匹配且未归一化，
 * 形如 `server/controllers/../../etc/cron.d/evil` 的路径前缀命中白名单，
 * 但 path.resolve 会跳到项目根之外，造成任意文件写入。
 * 修复后先归一化并拒绝跳出项目根的路径，再做严格前缀匹配。
 */
describe('CodeInjector.isPathAllowed 路径穿越防护', () => {
  it('允许白名单内的正常相对路径', () => {
    expect(isPathAllowed('server/controllers/FooController.ts')).toBe(true)
    expect(isPathAllowed('server/services/bar.ts')).toBe(true)
    expect(isPathAllowed('src/views/Product.vue')).toBe(true)
    expect(isPathAllowed('src/components/Baz.vue')).toBe(true)
    expect(isPathAllowed('.ai-knowledge/notes.md')).toBe(true)
  })

  it('拒绝利用 ../ 跳出允许目录的穿越路径', () => {
    expect(isPathAllowed('server/controllers/../../etc/cron.d/evil')).toBe(false)
    expect(isPathAllowed('server/controllers/../config/secrets.json')).toBe(false)
    expect(isPathAllowed('src/views/../../package.json')).toBe(false)
    expect(isPathAllowed('src/views/../src/../../etc/passwd')).toBe(false)
  })

  it('拒绝以 .. 开头或绝对路径', () => {
    expect(isPathAllowed('../package.json')).toBe(false)
    expect(isPathAllowed('../../etc/passwd')).toBe(false)
    expect(isPathAllowed('/etc/passwd')).toBe(false)
    expect(isPathAllowed('C:\\Windows\\system32\\evil.dll')).toBe(false)
  })

  it('危险文件无论是否在允许目录内一律拒绝', () => {
    expect(isPathAllowed('server/services/.env')).toBe(false)
    expect(isPathAllowed('src/views/.env')).toBe(false)
    expect(isPathAllowed('server/app.ts')).toBe(false)
    expect(isPathAllowed('src/components/app.ts')).toBe(false)
    expect(isPathAllowed('.env')).toBe(false)
    expect(isPathAllowed('package.json')).toBe(false)
  })

  it('拒绝非白名单目录下的路径', () => {
    expect(isPathAllowed('server/scripts/evil.ts')).toBe(false)
    expect(isPathAllowed('config/index.ts')).toBe(false)
    expect(isPathAllowed('README.md')).toBe(false)
  })
})
