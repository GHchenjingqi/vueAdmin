#!/usr/bin/env node
// X-T01 文档同步检查：扫描 docs 下的 .md 文件中引用的相对路径（反引号包裹的 docs/shops/server/plans 路径），
// 校验目标文件存在；缺失则非零退出（供 CI 阻断合并）。
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const docsDir = join(root, 'docs')
const missing = []
let checked = 0

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (name.endsWith('.md')) scan(p)
  }
}

function scan(file) {
  const text = readFileSync(file, 'utf8')
  const refs = text.match(/`((?:docs|shops|server|plans)\/[A-Za-z0-9_\-./[\]]+)`/g) || []
  for (const ref of refs) {
    const rel = ref.slice(1, -1).split('#')[0].split('（')[0].trim()
    if (!rel || rel.endsWith('/') || rel.includes('*')) continue
    checked++
    if (!existsSync(join(root, rel))) missing.push(`${rel}  ←  引用于 ${file.replace(root, '')}`)
  }
}

walk(docsDir)
console.log(`[doc-links] checked ${checked} references`)
if (missing.length) {
  console.error('[doc-links] MISSING:')
  for (const m of missing) console.error('  ' + m)
  process.exit(1)
}
console.log('[doc-links] OK')
