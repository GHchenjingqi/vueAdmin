import { test, expect } from '@playwright/test'
import { loginAsAdmin } from '../../helpers/auth'

test.describe('用户管理 CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('用户列表页面展示', async ({ page }) => {
    await page.click('text=用户管理|User Management')
    await page.waitForURL('/users')

    await expect(page.locator('.el-table')).toBeVisible()
    const rows = page.locator('.el-table__body-wrapper tbody tr')
    expect(await rows.count()).toBeGreaterThan(0)
  })

  test('搜索用户 - 按关键词', async ({ page }) => {
    await page.click('text=用户管理|User Management')
    await page.waitForURL('/users')

    await page.getByPlaceholder(/关键词|Keyword/).fill('admin')
    await page.click('text=搜索|Search')

    await page.waitForResponse((response) =>
      response.url().includes('/api/user/list') && response.status() === 200
    )

    const rows = page.locator('.el-table__body-wrapper tbody tr')
    const count = await rows.count()
    expect(count).toBeGreaterThanOrEqual(1)
    await expect(page.getByText('admin')).toBeVisible()
  })

  test('创建新用户', async ({ page }) => {
    await page.click('text=用户管理|User Management')
    await page.waitForURL('/users')

    await page.click('text=新增|Add')
    await page.waitForSelector('.el-dialog__body')

    const username = `test_e2e_${Date.now()}`
    await page.getByLabel(/用户名|Username/).fill(username)
    await page.getByLabel(/昵称|Nickname/).fill('E2E测试用户')
    await page.getByLabel(/邮箱|Email/).fill('e2e@test.com')
    await page.getByLabel(/密码|Password/).fill('Admin123!')

    await page.click('.el-dialog >> text=确定|Confirm')

    await expect(page.getByText(/创建成功|created successfully/)).toBeVisible()
    await expect(page.getByText(username)).toBeVisible()
  })

  test('删除用户', async ({ page }) => {
    await page.click('text=用户管理|User Management')
    await page.waitForURL('/users')

    const firstRow = page.locator('.el-table__body-wrapper tbody tr').first()
    const deleteBtn = firstRow.getByRole('button', { name: /删除|Delete/ })
    if (await deleteBtn.isVisible()) {
      await deleteBtn.click()
      await expect(page.getByText(/确认删除|Are you sure/)).toBeVisible()
      await page.click('.el-popconfirm >> text=确定|Confirm')
      await expect(page.getByText(/删除成功|deleted successfully/)).toBeVisible()
    }
  })
})