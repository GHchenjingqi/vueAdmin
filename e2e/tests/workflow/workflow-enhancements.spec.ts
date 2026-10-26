/**
 * 工作流增强能力 E2E
 *
 * 覆盖：
 *  1. 审批中心加载（筛选栏 / 导出 / 委托 / 理由管理入口）
 *  2. 委托审批：设置 → 生效中展示 → 取消
 *  3. 常用驳回理由维护：新增 → 列表可见 → 删除
 *  4. 流程设计器：添加审批节点 → 高级配置（自动通过/抄送/超时升级）可见并填写
 *
 * 运行前提：
 *  - 后端 https://localhost:5173（npm run dev）
 *  - 前端 http://localhost:5174（npx vite）
 *  - E2E_BASE_URL=http://localhost:5174
 *  - 验证码已关闭（settings.captcha_enabled=0）
 *  - 本机装有 Chrome（无 Playwright 内置 chromium 时用 channel:'chrome'）
 */
import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import { loginAsAdmin } from '../../helpers/auth'

// 本机未安装 Playwright chromium，复用系统 Chrome
test.use({ channel: 'chrome' })

const API = 'https://localhost:5173/api/v1'
const SHOT_DIR = 'e2e-artifacts'

let adminToken = ''
let delegeeUserId = 0
let workflowId = 0

/** 用 API 建立夹具数据 */
async function setupFixtures() {
  const ctx: APIRequestContext = await pwRequest.newContext({ ignoreHTTPSErrors: true })
  const login = await ctx.post(`${API}/auth/login`, {
    data: { username: 'admin', password: '123456' },
  })
  const loginBody = await login.json()
  if (loginBody.code !== 0) throw new Error(`API 登录失败: ${JSON.stringify(loginBody)}`)
  adminToken = loginBody.data.accessToken
  const auth = { Authorization: `Bearer ${adminToken}` }

  // 被委托用户（存在则复用）
  const list = await ctx.get(`${API}/users?username=e2e_delegee`, { headers: auth })
  const listBody = await list.json()
  const existing = listBody?.data?.rows?.[0]
  if (existing) {
    delegeeUserId = existing.id
  } else {
    const created = await ctx.post(`${API}/users`, {
      headers: auth,
      data: { username: 'e2e_delegee', password: 'e2e12345', nickname: 'E2E被委托人', email: 'e2e_delegee@test.local' },
    })
    const createdBody = await created.json()
    if (createdBody.code !== 0) throw new Error(`创建被委托用户失败: ${JSON.stringify(createdBody)}`)
    delegeeUserId = createdBody.data.id
  }

  // 测试工作流
  const wf = await ctx.post(`${API}/workflows`, {
    headers: auth,
    data: { name: `E2E增强流程-${Date.now()}`, description: 'e2e workflow enhancements' },
  })
  const wfBody = await wf.json()
  if (wfBody.code !== 0) throw new Error(`创建工作流失败: ${JSON.stringify(wfBody)}`)
  workflowId = wfBody.data.id

  await ctx.dispose()
}

async function cleanupFixtures() {
  if (!adminToken) return
  const ctx: APIRequestContext = await pwRequest.newContext({ ignoreHTTPSErrors: true })
  const auth = { Authorization: `Bearer ${adminToken}` }
  // best-effort 清理，失败不阻塞
  if (workflowId) await ctx.delete(`${API}/workflows/${workflowId}`, { headers: auth }).catch(() => {})
  if (delegeeUserId) await ctx.delete(`${API}/users/${delegeeUserId}`, { headers: auth }).catch(() => {})
  // 清理全部委托记录（含历史孤儿数据）
  try {
    const list = await ctx.get(`${API}/me/delegation`, { headers: auth })
    const listBody = await list.json()
    const items: { id: number }[] = listBody?.data || []
    for (const it of items) {
      await ctx.delete(`${API}/me/delegation/${it.id}`, { headers: auth })
    }
  } catch {
    // ignore
  }
  await ctx.dispose()
}

test.describe('工作流增强能力', () => {
  test.beforeAll(async () => {
    await setupFixtures()
  })

  test.afterAll(async () => {
    await cleanupFixtures()
  })

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('审批中心加载：筛选栏 + 导出 + 委托 + 理由管理入口', async ({ page }) => {
    await page.goto('/approval-center')
    await expect(page.locator('.filter-bar')).toBeVisible({ timeout: 20000 })
    await expect(page.getByPlaceholder(/关键字|Keyword/i)).toBeVisible()
    await expect(page.locator('.filter-bar .el-select').nth(1)).toBeVisible()
    await expect(page.getByRole('button', { name: /导出|Export/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /委托审批|Delegation/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /常用驳回理由|Reject Reasons/i })).toBeVisible()
    await page.screenshot({ path: `${SHOT_DIR}/01-approval-center.png`, fullPage: true })
  })

  test('委托审批：设置 → 生效中 → 取消', async ({ page }) => {
    await page.goto('/approval-center')
    await page.getByRole('button', { name: /委托审批|Delegation/i }).click()
    const dialog = page.locator('.el-dialog', { hasText: /委托审批设置|Set Delegation/i })
    await expect(dialog).toBeVisible()

    // 选择被委托人（选项 label 为 nickname || username）
    await dialog.locator('.el-select').first().click()
    const option = page.locator('.el-select-dropdown__item', { hasText: /E2E被委托人|e2e_delegee/ }).first()
    await option.waitFor({ state: 'visible', timeout: 10000 })
    await option.click()

    // 备注并提交（弹窗保持打开，提交后表单重置、列表刷新）
    await dialog.getByPlaceholder(/长期有效|indefinitely/i).fill('e2e 委托联调')
    await dialog.getByRole('button', { name: /设置委托|Set Delegation/i }).last().click()

    // 弹窗内列表应出现记录且标记生效中
    const row = dialog.locator('.el-table__row', { hasText: 'E2E被委托人' })
    await expect(row).toBeVisible({ timeout: 10000 })
    await expect(row.getByText(/生效中|Active/i)).toBeVisible()
    await page.screenshot({ path: `${SHOT_DIR}/03-delegation-active.png` })

    // 取消委托（仅本条）
    await row.getByRole('button', { name: /取消委托|Cancel/i }).click()
    await expect(dialog.locator('.el-table__row', { hasText: 'E2E被委托人' })).toHaveCount(0, { timeout: 10000 })
  })

  test('常用驳回理由维护：新增 → 可见 → 删除', async ({ page }) => {
    await page.goto('/approval-center')
    await page.getByRole('button', { name: /常用驳回理由|Reject Reasons/i }).click()
    const dialog = page.locator('.el-dialog', { hasText: /常用驳回理由|Reject Reasons/i })
    await expect(dialog).toBeVisible()

    const reasonText = `E2E理由-${Date.now()}`
    await dialog.getByPlaceholder(/回车快速添加|press Enter/i).fill(reasonText)
    await dialog.getByRole('button', { name: /添加|Add/i }).click()

    const newRow = dialog.locator('.el-table__row', { hasText: reasonText })
    await expect(newRow).toBeVisible({ timeout: 10000 })
    await page.screenshot({ path: `${SHOT_DIR}/04-reason-added.png` })

    // 删除（有确认框则确认）
    await newRow.getByRole('button', { name: /删除|Delete/i }).click()
    const confirmBtn = page.getByRole('button', { name: /确定|OK|Yes/i }).last()
    try {
      await confirmBtn.click({ timeout: 3000 })
    } catch {
      // 无确认框则跳过
    }
    await expect(dialog.locator('.el-table__row', { hasText: reasonText })).toHaveCount(0, { timeout: 10000 })
  })

  test('流程设计器：添加审批节点 → 高级配置可见', async ({ page }) => {
    await page.goto(`/workflows/${workflowId}/design`)
    // 调色板出现
    const palette = page.locator('.node-palette')
    await expect(palette).toBeVisible({ timeout: 20000 })

    // 双击审批节点添加
    await palette.locator('.palette-item', { hasText: /审批|Approve/i }).first().dblclick()
    // 配置面板出现（审批人规则）
    await expect(page.locator('.node-config-panel')).toBeVisible({ timeout: 10000 })

    // 高级配置区域：自动通过 / 抄送 / 超时升级
    await expect(page.getByText(/自动通过条件|Auto-approve Condition/i)).toBeVisible()
    await expect(page.getByText(/抄送人|CC$/i)).toBeVisible()
    await expect(page.getByText(/超时与升级|Timeout & Escalation/i)).toBeVisible()

    // 填写自动通过条件并截图
    await page.getByPlaceholder(/amount < 5000/i).fill('amount < 100')
    await page.screenshot({ path: `${SHOT_DIR}/05-designer-advanced-config.png`, fullPage: true })
  })
})
