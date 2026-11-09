#!/usr/bin/env node
/**
 * 门禁签字证据自动化预检（G2 / G3 / G4 / G5 + X-T06）
 *
 * 定位：把 4 个门禁、17 项签字里所有「能用代码复验」的部分一次性自动化：
 *   1. 结构化登记 17 项签字的责任方、前置条件、证据路径与复验命令；
 *   2. 自动复验技术侧证据（DB / 服务健康 / CI 触发分支 / 文档链接 / 类型检查）；
 *   3. 输出机器可读 JSON 与 Markdown 摘要，供责任方逐项签字时对照。
 *
 * 强约束：
 *   - 本脚本**只读**，不修改签字包、不修改执行计划、不代勾任何 [x] / 签字栏；
 *   - 自检会校验 `gate-signoff-pack.md` 仍为 17 项未勾，如发现代勾则报 FAIL；
 *   - 签字状态只标记 EVIDENCE_READY / EXTERNAL_ENV / HUMAN_DECISION，不产生"已通过"结论。
 *
 * 用法：
 *   node scripts/gate-preflight.mjs                     # 轻量预检 + Markdown 摘要
 *   node scripts/gate-preflight.mjs --full             # 追加前后端 typecheck
 *   node scripts/gate-preflight.mjs --e2e              # 追加浏览器冒烟（需先启动 storefront）
 *   node scripts/gate-preflight.mjs --json             # 只输出 JSON
 *   node scripts/gate-preflight.mjs --out <file>       # 额外把 JSON 写入文件
 *   node scripts/gate-preflight.mjs --strict           # 技术检查有 FAIL 时退出码 1
 *
 * 零第三方依赖，仅用 Node 内置模块；CI 与本地均可直接运行。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SIGNOFF_PACK = join(ROOT, 'docs/reports/gate-signoff-pack.md')
const CI_FILE = join(ROOT, '.github/workflows/ci.yml')
const E2E_BASE = process.env.E2E_BASE_URL || 'http://127.0.0.1:3103'
const argv = new Set(process.argv.slice(2))
const has = (flag) => argv.has(flag)

/** 责任方分类：技术证据已齐 / 需外部账号或真实环境 / 需人工试用或业务决策 */
export const CATEGORY = Object.freeze({
  EVIDENCE_READY: 'EVIDENCE_READY',
  EXTERNAL_ENV: 'EXTERNAL_ENV',
  HUMAN_DECISION: 'HUMAN_DECISION',
})

/**
 * 17 项签字确认，逐条对应 `docs/reports/gate-signoff-pack.md` 的「签字确认（责任方勾选）」栏。
 * 顺序与原文一致：G2 三项 / G3 三项 / G4 四项 / G5 四项 / X-T06 三项。
 */
export const SIGNOFF_ITEMS = [
  // ---- G2（P2-T14）----------------------------------------------------
  {
    id: 'G2-S1', gate: 'G2', task: 'P2-T14',
    title: 'Search Console 已验证站点可抓取（含 sitemap 提交）',
    category: CATEGORY.EXTERNAL_ENV, owner: 'SEO / 运营',
    prerequisite: 'Google Search Console 账号 + 站点所有权验证 + 已上线域名',
    evidence: ['docs/reports/g2-audit.md'], verify: null,
  },
  {
    id: 'G2-S2', gate: 'G2', task: 'P2-T14',
    title: '价格/库存/币种符号抽查通过',
    category: CATEGORY.EVIDENCE_READY, owner: '业务 / QA',
    prerequisite: '责任方复核 A1~A3 与 T-12 币种切换证据',
    evidence: ['docs/reports/g2-audit.md', 'docs/reports/t12-currency-switch.md'],
    verify: 'node scripts/gate-preflight.mjs',
  },
  {
    id: 'G2-S3', gate: 'G2', task: 'P2-T14',
    title: '移动端验收通过（LCP/CLS/TTFB）',
    category: CATEGORY.EVIDENCE_READY, owner: '业务 / QA',
    prerequisite: '责任方复核性能验收报告；如需重测另行跑 Lighthouse',
    evidence: ['docs/reports/performance-acceptance.md'], verify: null,
  },
  // ---- G3（P3-T19）----------------------------------------------------
  {
    id: 'G3-S1', gate: 'G3', task: 'P3-T19',
    title: '沙箱完整交易 E2E 通过（含支付回跳/回调）',
    category: CATEGORY.HUMAN_DECISION, owner: 'QA / 业务',
    prerequisite: '沙箱环境可执行完整下单链路，由责任方确认结果',
    evidence: ['docs/reports/real-integration.md'], verify: null,
  },
  {
    id: 'G3-S2', gate: 'G3', task: 'P3-T19',
    title: '异常路径（重复请求/回调乱序/库存异常/币种变更）测试证据齐备',
    category: CATEGORY.EVIDENCE_READY, owner: 'QA',
    prerequisite: '责任方复核源码级回归证据',
    evidence: ['docs/reports/real-integration.md', 'docs/reports/g5-regression-report.md'],
    verify: 'npm --prefix server test',
  },
  {
    id: 'G3-S3', gate: 'G3', task: 'P3-T19',
    title: '生产级抽样计划与执行确认',
    category: CATEGORY.EXTERNAL_ENV, owner: '业务 / 运维',
    prerequisite: '真实可售商品 + 真实支付网关 + 抽样计划审批',
    evidence: [], verify: null,
  },
  // ---- G4（P4-T17）----------------------------------------------------
  {
    id: 'G4-S1', gate: 'G4', task: 'P4-T17',
    title: '政策文本经目标市场专业人士审核通过',
    category: CATEGORY.EXTERNAL_ENV, owner: '法务 / 合规',
    prerequisite: '目标市场专业人士审核合规口径、争议管辖、数据出境',
    evidence: [], verify: null,
  },
  {
    id: 'G4-S2', gate: 'G4', task: 'P4-T17',
    title: '退款/RMA 审批权限分配明确',
    category: CATEGORY.HUMAN_DECISION, owner: '业务 / 风控',
    prerequisite: '业务方确认权限矩阵（建议见签字包附录）',
    evidence: ['docs/reports/gate-signoff-pack.md'], verify: null,
  },
  {
    id: 'G4-S3', gate: 'G4', task: 'P4-T17',
    title: 'admin 履约界面人工试用通过',
    category: CATEGORY.HUMAN_DECISION, owner: '客服 / QA',
    prerequisite: '客服在 admin 侧人工走通查单、退款、RMA 审批路径',
    evidence: ['docs/reports/g4-gate-checklist.md'], verify: null,
  },
  {
    id: 'G4-S4', gate: 'G4', task: 'P4-T17',
    title: '埋点抽样对账一致',
    category: CATEGORY.EXTERNAL_ENV, owner: '运营 / 数据分析',
    prerequisite: '真实投放/流量 + GA4 后台权限',
    evidence: ['docs/reports/g4-gate-checklist.md'],
    verify: 'GET /shop/analytics/events',
  },
  // ---- G5（P5-T09）----------------------------------------------------
  {
    id: 'G5-S1', gate: 'G5', task: 'P5-T09',
    title: '扩展能力上线不破坏主市场交易链路（业务确认）',
    category: CATEGORY.EVIDENCE_READY, owner: '业务',
    prerequisite: '责任方复核主链路 / 币种 / 缓存 SEO / 隔离性回归证据',
    evidence: ['docs/reports/g5-regression-report.md'],
    verify: 'npm --prefix server test && npm --prefix server run typecheck',
  },
  {
    id: 'G5-S2', gate: 'G5', task: 'P5-T09',
    title: '生产级 E2E 抽样通过',
    category: CATEGORY.EXTERNAL_ENV, owner: 'QA / 业务',
    prerequisite: '生产级环境 + 真实可售商品',
    evidence: [], verify: null,
  },
  {
    id: 'G5-S3', gate: 'G5', task: 'P5-T09',
    title: '币种切换真实验收通过',
    category: CATEGORY.EXTERNAL_ENV, owner: '业务 / 运营',
    prerequisite: '真实币种配置切换 + 真实 CDN 缓存',
    evidence: ['docs/reports/t12-currency-switch.md'], verify: null,
  },
  {
    id: 'G5-S4', gate: 'G5', task: 'P5-T09',
    title: '真实 CDN 缓存失效链路验证通过',
    category: CATEGORY.EXTERNAL_ENV, owner: '运维',
    prerequisite: '接入真实 CDN 失效器（当前为可插拔实现）',
    evidence: [], verify: null,
  },
  // ---- X-T06（横切：发布与回滚 Runbook）--------------------------------
  {
    id: 'X-S1', gate: 'X-T06', task: 'X-T06',
    title: 'staging 发布回滚演练通过',
    category: CATEGORY.EXTERNAL_ENV, owner: '运维',
    prerequisite: 'staging 环境 + 应用与 DB 全链路演练窗口',
    evidence: [], verify: null,
  },
  {
    id: 'X-S2', gate: 'X-T06', task: 'X-T06',
    title: '生产备份/恢复演练通过',
    category: CATEGORY.EXTERNAL_ENV, owner: '运维 / DBA',
    prerequisite: '生产环境备份恢复演练窗口',
    evidence: [], verify: null,
  },
  {
    id: 'X-S3', gate: 'X-T06', task: 'X-T06',
    title: 'RTO/RPO 目标确认',
    category: CATEGORY.HUMAN_DECISION, owner: '业务 / 运维',
    prerequisite: '业务方确认 RTO/RPO 指标口径',
    evidence: [], verify: null,
  },
]

/** 4 个门禁任务行在 `shops/mds/storefront-execution-plan_v1.0.md` 的当前回填状态（只读登记，不改） */
export const GATES = [
  { gate: 'G2', task: 'P2-T14', planState: '[~]', technical: 'PASS' },
  { gate: 'G3', task: 'P3-T19', planState: '[~]', technical: 'PASS' },
  { gate: 'G4', task: 'P4-T17', planState: '[ ]', technical: 'PASS' },
  { gate: 'G5', task: 'P5-T09', planState: '[ ]', technical: 'PASS' },
  { gate: 'X-T06', task: 'X-T06', planState: '横切', technical: 'Runbook 已产出' },
]

// ---------------------------------------------------------------------------
// 基础工具
// ---------------------------------------------------------------------------
function runCmd(cmd, timeoutMs = 180_000) {
  const r = spawnSync(cmd, {
    cwd: ROOT, shell: true, encoding: 'utf8', timeout: timeoutMs, windowsHide: true,
    env: { ...process.env, NO_COLOR: '1' },
  })
  const failed = r.error && (r.error.code === 'ETIMEDOUT' || r.error.code === 'ENOENT')
  return {
    rc: typeof r.status === 'number' ? r.status : 1,
    out: String(r.stdout || '').trim(),
    err: String(r.stderr || '').trim(),
    failed,
  }
}

function probeTcp(port, host = '127.0.0.1', timeoutMs = 2000) {
  const started = Date.now()
  return new Promise((done) => {
    let settled = false
    const finish = (r) => {
      if (settled) return
      settled = true
      done({ ...r, ms: Date.now() - started })
    }
    const sock = net.createConnection({ host, port })
    sock.setTimeout(timeoutMs)
    sock.once('connect', () => { sock.destroy(); finish({ ok: true }) })
    sock.once('timeout', () => { sock.destroy(); finish({ ok: false, error: 'ETIMEDOUT' }) })
    sock.once('error', (e) => finish({ ok: false, error: e.code || e.message }))
  })
}

function probeHttp(url, timeoutMs = 2500) {
  const started = Date.now()
  return new Promise((done) => {
    let settled = false
    const finish = (r) => {
      if (settled) return
      settled = true
      done({ ...r, ms: Date.now() - started })
    }
    try {
      const lib = url.startsWith('https:') ? https : http
      // 开发态后端使用自签名证书；此处仅做健康探测，不校验证书链。
      const req = lib.request(url, { method: 'GET', timeout: timeoutMs, rejectUnauthorized: false }, (res) => {
        res.resume()
        finish({ ok: (res.statusCode || 0) >= 200 && (res.statusCode || 0) < 400, status: res.statusCode || 0 })
      })
      req.once('timeout', () => req.destroy(new Error('ETIMEDOUT')))
      req.once('error', (e) => finish({ ok: false, status: 0, error: e.code || e.message }))
      req.end()
    } catch (e) {
      finish({ ok: false, status: 0, error: e.message })
    }
  })
}

// ---------------------------------------------------------------------------
// 检查项
// ---------------------------------------------------------------------------
function checkGit() {
  const head = runCmd('git rev-parse --short HEAD')
  const branch = runCmd('git branch --show-current')
  const dirty = runCmd('git status --porcelain=v1')
  const tracking = runCmd('git rev-list --left-right --count @{u}...HEAD')
  const parts = tracking.rc === 0 ? tracking.out.split(/\s+/).filter(Boolean) : []
  return {
    head: head.rc === 0 ? head.out : 'unknown',
    branch: branch.rc === 0 ? branch.out : 'unknown',
    dirtyTrackedCount: dirty.rc === 0 && dirty.out ? dirty.out.split('\n').length : 0,
    behind: parts.length === 2 ? Number(parts[0]) : null,
    ahead: parts.length === 2 ? Number(parts[1]) : null,
  }
}

function checkCiBranch() {
  const checks = []
  if (!existsSync(CI_FILE)) {
    checks.push({ id: 'ci.master_shop', status: 'FAIL', detail: '未找到 .github/workflows/ci.yml' })
    return checks
  }
  const text = readFileSync(CI_FILE, 'utf8')
  const lines = [...text.matchAll(/^\s*branches:\s*\[([^\]]*)\]/gm)].map((m) => m[1])
  const covered = lines.filter((line) => line.split(',').map((s) => s.trim()).includes('master_shop')).length
  checks.push({
    id: 'ci.master_shop',
    status: lines.length === 2 && covered === 2 ? 'PASS' : 'FAIL',
    detail: `push/pull_request 分支列表共 ${lines.length} 处，其中 ${covered} 处包含 master_shop`,
    remediation: '在 ci.yml 的 on.push.branches 与 on.pull_request.branches 加入 master_shop',
  })
  // 安全断言：加分支不得顺带触发 staging 自动部署。
  const deployIf = text.match(/deploy-staging:[\s\S]*?\n\s+if:\s*([^\n]+)/)
  const safe = deployIf ? !deployIf[1].includes('master_shop') : false
  checks.push({
    id: 'ci.deploy_guard',
    status: safe ? 'PASS' : 'WARN',
    detail: safe
      ? 'deploy-staging 的 if 仍仅认 dev/develop，master_shop 不会触发自动部署'
      : '未能确认 deploy-staging 的 if 条件，请人工复核',
  })
  return checks
}

function checkSignoffIntegrity() {
  if (!existsSync(SIGNOFF_PACK)) {
    return {
      id: 'signoff.integrity', status: 'SKIP',
      detail: '签字包未纳入版本库（工作区 WIP），跳过勾选状态校验；本脚本从不写入该文件',
    }
  }
  const text = readFileSync(SIGNOFF_PACK, 'utf8')
  const boxes = [...text.matchAll(/^- \[([ xX])\] /gm)].map((m) => m[1])
  const signed = boxes.filter((b) => b.trim() !== '').length
  const pending = boxes.length - signed
  if (boxes.length !== 17) {
    return { id: 'signoff.integrity', status: 'WARN', detail: `签字栏计数 ${boxes.length}，预期 17` }
  }
  if (signed !== 0) {
    return {
      id: 'signoff.integrity', status: 'FAIL',
      detail: `检测到 ${signed} 项已被勾选；签字须由责任方填写，自动化不得代勾`,
    }
  }
  return { id: 'signoff.integrity', status: 'PASS', detail: `17 项签字栏全部未勾（pending=${pending}），未被自动化代勾` }
}

function checkCommand(id, label, cmd) {
  const r = runCmd(cmd)
  const tail = (s) => (s ? s.split('\n').slice(-3).join(' | ').slice(0, 260) : '')
  return {
    id, label,
    status: r.rc === 0 ? 'PASS' : 'FAIL',
    detail: r.rc === 0 ? `${label} 通过` : `${label} 失败 (rc=${r.rc}): ${tail(r.err) || tail(r.out)}`,
  }
}

async function collectChecks(full) {
  const checks = []

  // 1. 数据库
  const db = await probeTcp(3306)
  checks.push({
    id: 'env.db', label: 'MySQL 3306',
    status: db.ok ? 'PASS' : 'WARN',
    detail: db.ok ? `3306 可连 (${db.ms}ms)` : `3306 不可连 (${db.error || 'unknown'})；DB 类测试与迁移需数据库`,
  })

  // 2. 后端健康（5173 为 HTTPS 自签名）
  const health = await probeHttp('https://127.0.0.1:5173/health')
  checks.push({
    id: 'env.backend5173', label: '后端 5173 /health',
    status: health.ok ? 'PASS' : 'WARN',
    detail: health.ok ? `HTTPS /health = ${health.status} (${health.ms}ms)` : `不可达 (${health.error || 'HTTP ' + health.status})`,
  })

  // 3. storefront 服务（3014 dev / 4015 独立生产构建）
  for (const port of [3014, 4015]) {
    const r = await probeHttp(`http://127.0.0.1:${port}/`)
    checks.push({
      id: `env.storefront${port}`, label: `storefront ${port}`,
      status: r.ok ? 'PASS' : 'WARN',
      detail: r.ok
        ? `HTTP ${r.status} (${r.ms}ms)`
        : `无监听 (${r.error || 'ECONNREFUSED'})；注意 curl 若设 HTTP_PROXY 会收到代理返回的 502 假象，应以直连探测为准`,
      remediation: r.ok ? undefined : '在 shops/ 下启动 dev 或 .output 生产构建后复跑浏览器 E2E',
    })
  }

  // 3b. 当前实际用于浏览器复验的 storefront（默认 3103，可用 E2E_BASE_URL 覆盖）
  const e2e = await probeHttp(`${E2E_BASE.replace(/\/$/, '')}/`)
  checks.push({
    id: 'env.e2eBase', label: `E2E baseURL ${E2E_BASE}`,
    status: e2e.ok ? 'PASS' : 'WARN',
    detail: e2e.ok
      ? `storefront 可用，HTTP ${e2e.status} (${e2e.ms}ms)；3014/4015 为历史登记端口，未启动时不影响本次复验`
      : `E2E baseURL 不可达 (${e2e.error || 'HTTP ' + e2e.status})；加 --e2e 前需先启动 storefront`,
    remediation: e2e.ok ? undefined : 'node shops/.output/server/index.mjs（或 shops/ 下 npm run dev）',
  })

  // 4. CI 接线
  checks.push(...checkCiBranch())

  // 5. 签字包完整性（反代勾自检）
  checks.push(checkSignoffIntegrity())

  // 6. 文档链接
  checks.push(checkCommand('docs.links', '文档链接校验', 'node scripts/check-doc-links.mjs'))

  // 7. --full：类型检查
  if (full) {
    checks.push(checkCommand('typecheck.server', 'server typecheck', 'npm --prefix server run typecheck'))
    checks.push(checkCommand('typecheck.frontend', 'frontend typecheck', 'npm run typecheck'))
  }

  // 8. --e2e：真跑浏览器冒烟（需已启动 storefront，见 env.e2eBase）
  if (has('--e2e')) {
    const r = runCmd('cd shops && npx playwright test --config=tests/e2e/gate-smoke.playwright.config.ts', 240_000)
    const passed = /(\d+) passed/.exec(r.out)
    checks.push({
      id: 'e2e.smoke', label: '浏览器冒烟 E2E',
      status: r.rc === 0 ? 'PASS' : 'FAIL',
      detail: r.rc === 0
        ? `smoke.spec.ts ${passed ? passed[1] : '?'} 例通过（baseURL ${E2E_BASE}）`
        : `冒烟失败 (rc=${r.rc})：${(r.out + '\n' + r.err).split('\n').slice(-6).join(' | ').slice(0, 300)}`,
      remediation: r.rc === 0 ? undefined : '确认 storefront 已启动且 E2E_BASE_URL 指向正确端口',
    })
  }

  return checks
}

// ---------------------------------------------------------------------------
// 汇总与输出
// ---------------------------------------------------------------------------
function buildReport(checks, git) {
  const byCategory = { EVIDENCE_READY: 0, EXTERNAL_ENV: 0, HUMAN_DECISION: 0 }
  for (const item of SIGNOFF_ITEMS) byCategory[item.category]++
  const gates = GATES.map((g) => {
    const items = SIGNOFF_ITEMS.filter((i) => i.gate === g.gate)
    return {
      ...g,
      signoffTotal: items.length,
      signoffSigned: 0,
      blockingCategories: [...new Set(items.map((i) => i.category))],
    }
  })
  const statuses = checks.reduce((acc, c) => { acc[c.status] = (acc[c.status] || 0) + 1; return acc }, {})
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    note: '证据快照：由 gate-preflight.mjs 生成，不构成签字或门禁通过结论。',
    git,
    policy: {
      autoSignoff: false,
      autoCheckGate: false,
      statement: '本脚本只读；不代勾 [x]、不代替签字、不回填执行计划任务行。',
      gateRule: '每个门禁须其签字项由责任方逐项勾选后，方可在 storefront-execution-plan_v1.0.md 回填 [x]。',
    },
    summary: { checks: statuses, signoffTotal: 17, signoffSigned: 0, signoffPending: 17, byCategory },
    checks,
    gates,
    signoff: SIGNOFF_ITEMS,
  }
}

function toMarkdown(r) {
  const L = []
  L.push('# 门禁签字证据预检结果')
  L.push('')
  L.push(`- 生成时间：${r.generatedAt}`)
  L.push(`- HEAD：\`${r.git.head}\` · 分支：\`${r.git.branch}\` · 工作区改动：${r.git.dirtyTrackedCount} 项 · ahead/behind：${r.git.ahead ?? '?'} / ${r.git.behind ?? '?'}`)
  L.push(`- **政策**：${r.policy.statement}`)
  L.push(`- **门禁规则**：${r.policy.gateRule}`)
  L.push('')
  L.push('## 1. 技术侧自动复验')
  L.push('')
  L.push('| 检查 | 状态 | 说明 |')
  L.push('| --- | --- | --- |')
  for (const c of r.checks) L.push(`| \`${c.id}\` | ${c.status} | ${String(c.detail).replace(/\|/g, '\\|')} |`)
  L.push('')
  L.push('## 2. 四个门禁 / 横切项')
  L.push('')
  L.push('| 门禁 | 任务行 | 计划状态 | 技术侧 | 签字项 | 已签 | 待办类别 |')
  L.push('| --- | --- | --- | --- | --- | --- | --- |')
  for (const g of r.gates) {
    L.push(`| ${g.gate} | ${g.task} | ${g.planState} | ${g.technical} | ${g.signoffTotal} | ${g.signoffSigned} | ${g.blockingCategories.join(' / ')} |`)
  }
  L.push('')
  L.push('## 3. 17 项签字逐项清单')
  L.push('')
  L.push('| ID | 门禁 | 类别 | 责任方 | 签字项 | 前置条件 | 复验命令 |')
  L.push('| --- | --- | --- | --- | --- | --- | --- |')
  for (const i of r.signoff) {
    const cells = [i.id, i.gate, i.category, i.owner, i.title, i.prerequisite, i.verify || '—']
    L.push('| ' + cells.map((c) => String(c).replace(/\|/g, '\\|')).join(' | ') + ' |')
  }
  L.push('')
  L.push('## 4. 统计')
  L.push('')
  L.push(`- 签字项：${r.summary.signoffTotal} 项，已签 ${r.summary.signoffSigned}，待签 ${r.summary.signoffPending}`)
  L.push(`- EVIDENCE_READY（技术证据齐、仅待责任方确认）：${r.summary.byCategory.EVIDENCE_READY}`)
  L.push(`- EXTERNAL_ENV（需外部账号 / 真实环境 / 第三方）：${r.summary.byCategory.EXTERNAL_ENV}`)
  L.push(`- HUMAN_DECISION（需人工试用或业务决策）：${r.summary.byCategory.HUMAN_DECISION}`)
  L.push('')
  L.push('> EXTERNAL_ENV 与 HUMAN_DECISION 无法由开发侧闭合，需责任方或真实环境先动；本预检只负责把可复验证据备齐。')
  return L.join('\n')
}

// ---------------------------------------------------------------------------
async function main() {
  const checks = await collectChecks(has('--full'))
  const report = buildReport(checks, checkGit())

  const outIdx = process.argv.indexOf('--out')
  if (outIdx > -1 && process.argv[outIdx + 1]) {
    const out = resolve(ROOT, process.argv[outIdx + 1])
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, JSON.stringify(report, null, 2) + '\n', 'utf8')
  }

  if (has('--json')) console.log(JSON.stringify(report, null, 2))
  else console.log(toMarkdown(report))

  if (has('--strict') && checks.some((c) => c.status === 'FAIL')) process.exitCode = 1
}

main().catch((e) => {
  console.error('[gate-preflight] fatal:', e)
  process.exitCode = 1
})
