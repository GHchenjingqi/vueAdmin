#!/usr/bin/env node
/**
 * 发布前云端数据同步：把线上真实数据拉回本地 data/db.json，
 * 避免发版时本地构建/测试数据覆盖线上维护内容。
 *
 * 用法：
 *   node scripts/sync-cloud-data.mjs [baseUrl]
 *   baseUrl 默认 https://wbapp-uhw9k2iknkfd9ig4eowrnu.app.workbuddy.host
 *
 * 鉴权：优先读取环境变量 PROMPT_CLOUD_TOKEN；否则用 ADMIN_USERNAME / ADMIN_PASSWORD
 * （默认 admin / 123456）登录获取。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DB_FILE = path.join(ROOT, 'prompt-cloud', 'data', 'db.json')

const BASE = (process.argv[2] || process.env.PROMPT_CLOUD_BASE || 'https://wbapp-uhw9k2iknkfd9ig4eowrnu.app.workbuddy.host').replace(/\/$/, '')
const SHARECODE = 'RZIJYISE44'
const USERNAME = process.env.ADMIN_USERNAME || 'admin'
const PASSWORD = process.env.ADMIN_PASSWORD || '123456'

async function apiFetch(url, options = {}) {
  const res = await fetch(url, options)
  const text = await res.text()
  let payload
  try {
    payload = JSON.parse(text)
  } catch {
    throw new Error(`接口返回非 JSON（${res.status}）：${text.slice(0, 200)}`)
  }
  if (!res.ok || payload.code !== 0) {
    throw new Error(payload.message || `请求失败 ${res.status}`)
  }
  return payload.data
}

async function main() {
  let token = process.env.PROMPT_CLOUD_TOKEN
  let cookie = ''
  if (!token) {
    const login = await fetch(`${BASE}/api/v1/auth/login?sharecode=${SHARECODE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
    })
    const setCookie = login.headers.get('set-cookie') || ''
    const match = setCookie.match(/ppt_token=([^;]+)/)
    if (!match) throw new Error('登录失败：未获取到 ppt_token Cookie')
    cookie = `ppt_token=${match[1]}`
  }

  const headers = {}
  if (cookie) headers.Cookie = cookie
  else headers.Authorization = `Bearer ${token}`

  const db = await apiFetch(`${BASE}/api/v1/prompt/data/export?sharecode=${SHARECODE}`, { headers })
  const arrays = ['users', 'prompts', 'images', 'steps', 'categories', 'platforms', 'favorites', 'uploads']
  if (!db || arrays.some((key) => !Array.isArray(db[key]))) {
    throw new Error('线上备份数据结构不合法，已中止同步')
  }

  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true })
  const tmp = `${DB_FILE}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8')
  fs.renameSync(tmp, DB_FILE)

  console.log(`[sync-cloud-data] 已从线上同步 ${db.prompts.length} 条提示词、${db.users.length} 个用户到本地`)
  console.log(`[sync-cloud-data] 目标文件：${DB_FILE}`)
}

main().catch((err) => {
  console.error('[sync-cloud-data] 同步失败：', err.message)
  process.exit(1)
})
