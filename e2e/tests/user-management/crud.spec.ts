import { test, expect } from '@playwright/test'
import { loginAsAdmin } from '../../helpers/auth'

test.describe('用户管理 CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('用户列表页面展示', async ({ page }) => {
    await page.goto('/users')
    await expect(page.locator('.el-table, table').first()).toBeVisible({ timeout: 15000 })
  })

  test('搜索用户 - 按关键词', async ({ page }) => {
    await page.goto('/users')
    const keyword = page.getByPlaceholder(/关键词|Keyword|用户名|Username/i).first()
    if (await keyword.isVisible().catch(() => false)) {
      await keyword.fill('admin')
      const searchBtn = page.getByRole('button', { name: /搜索|Search|查询/i }).first()
      if (await searchBtn.isVisible().catch(() => false)) {
        await searchBtn.click()
      }
      await expect(page.getByText('admin').first()).toBeVisible({ timeout: 15000 })
    }
  })
})
