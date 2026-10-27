// 校验中英文 i18n 的 sidebar.* 翻译键一致，避免英文环境下回退成数据库中文菜单名。
// 用法：node scripts/check-i18n-keys.mjs  （建议在 CI 中运行）
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

function load(p) {
  return JSON.parse(readFileSync(resolve(root, p), 'utf-8'))
}

const zh = load('src/i18n/zh-CN.json')
const en = load('src/i18n/en-US.json')

const zhKeys = Object.keys(zh.sidebar || {}).sort()
const enKeys = Object.keys(en.sidebar || {}).sort()

const missingInEn = zhKeys.filter((k) => !enKeys.includes(k))
const missingInZh = enKeys.filter((k) => !zhKeys.includes(k))

let ok = true
if (missingInEn.length) {
  console.error('[i18n] 缺少英文 sidebar 翻译:', missingInEn.join(', '))
  ok = false
}
if (missingInZh.length) {
  console.error('[i18n] 中文 sidebar 缺少 Key:', missingInZh.join(', '))
  ok = false
}
if (ok) console.log('[i18n] sidebar 翻译键一致 ✓')
process.exit(ok ? 0 : 1)
