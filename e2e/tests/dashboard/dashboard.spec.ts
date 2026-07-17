import { test, expect } from '@playwright/test'
import { loginAsAdmin } from '../../helpers/auth'

test.describe('仪表盘', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('仪表盘加载成功', async ({ page }) => {
    await expect(page.locator('.dashboard-container')).toBeVisible()
    await expect(page.getByText(/欢迎回来|Welcome back/)).toBeVisible()
  })

  test('侧边菜单可展开', async ({ page }) => {
    const systemMenu = page.locator('.el-menu >> text=系统管理')
    await systemMenu.waitFor({ state: 'visible' })
    await systemMenu.click()
    await expect(page.getByText('用户管理')).toBeVisible()
    await expect(page.getByText('部门管理')).toBeVisible()
  })
})