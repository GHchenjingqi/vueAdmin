#!/usr/bin/env node
/**
 * 快速检查 vue-admin 本地环境关键文件与 env（不连接数据库）。
 * 用法: 在仓库根执行
 *   node .agents/skills/vue-admin-env-setup/scripts/check-env.mjs
 */
import fs from 'fs'
import path from 'path'

const cwd = process.cwd()
const checks = [
  ['package.json', true],
  ['server/package.json', true],
  ['server/.env', true],
  ['server/.env.example', false],
  ['server/utils/ensureDatabase.ts', true],
  ['server/utils/migrator.ts', true],
  ['server/bootstrap.ts', true],
  ['server/scripts/migrate.ts', true],
  ['server/init.sql', false],
  ['docker-compose.yml', false],
]

let failed = 0
for (const [rel, required] of checks) {
  const p = path.join(cwd, rel)
  const ok = fs.existsSync(p)
  const mark = ok ? 'OK' : required ? 'MISSING' : 'optional-missing'
  if (!ok && required) failed++
  console.log(`[${mark}] ${rel}`)
}

// package scripts
try {
  const rootPkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'))
  const serverPkg = JSON.parse(fs.readFileSync(path.join(cwd, 'server/package.json'), 'utf8'))
  const rootMigrate = rootPkg.scripts?.migrate || ''
  const serverMigrate = serverPkg.scripts?.migrate || ''
  const rootOk = /npm --prefix server run migrate/.test(rootMigrate)
  const serverOk = /tsx scripts\/migrate\.ts/.test(serverMigrate)
  console.log(`[${rootOk ? 'OK' : 'WARN'}] root migrate script: ${rootMigrate || '(missing)'}`)
  console.log(`[${serverOk ? 'OK' : 'WARN'}] server migrate script: ${serverMigrate || '(missing)'}`)
  if (!rootOk || !serverOk) failed++
} catch (e) {
  console.log(`[WARN] cannot parse package.json: ${e.message}`)
}

// migrator windows slash fix
const migratorPath = path.join(cwd, 'server/utils/migrator.ts')
if (fs.existsSync(migratorPath)) {
  const src = fs.readFileSync(migratorPath, 'utf8')
  const fixed = src.includes(".replace(/\\\\/g, '/')") || src.includes('.replace(/\\/g, \'/\')') || /replace\(\/\\\\\/g,\s*['\"]\/['\"]\)/.test(src) || src.includes("replace(/\\\\/g, '/')")
  // simpler detection
  const hasSlashFix = src.includes('replace(/\\') && src.includes("g, '/')")
  console.log(`[${hasSlashFix ? 'OK' : 'WARN'}] migrator Windows path slash normalization`)
  if (!hasSlashFix) failed++
}

// seeder bcrypt
const seeder = path.join(cwd, 'server/seeders/20260707_000001_admin_user.ts')
if (fs.existsSync(seeder)) {
  const src = fs.readFileSync(seeder, 'utf8')
  const good = src.includes('bcrypt.hash')
  const bad = src.includes('$2a$10$6Z3Kz6n')
  console.log(`[${good && !bad ? 'OK' : 'WARN'}] admin seeder uses runtime bcrypt.hash`)
  if (!good || bad) failed++
}

if (fs.existsSync(path.join(cwd, 'server/.env'))) {
  const env = fs.readFileSync(path.join(cwd, 'server/.env'), 'utf8')
  for (const key of ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'SERVER_PORT']) {
    const m = env.match(new RegExp('^' + key + '=(.*)$', 'm'))
    const val = m ? m[1].trim() : '(unset)'
    const show = key === 'DB_PASSWORD' ? (val ? '***' : '(empty)') : val
    console.log(`[env] ${key}=${show}`)
  }
}

console.log(failed ? `\n${failed} issue(s) found` : '\nBasic files and scripts look present')
process.exit(failed ? 1 : 0)
