import { test, expect } from '@playwright/test'
import { loginAsAdmin } from '../../helpers/auth'

test.describe('仪表盘', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)
  })

  test('仪表盘加载成功', async ({ page }) => {
    await expect(page.locator('.dashboard, .page-container, .welcome-greeting').first()).toBeVisible()
    await expect(page.getByText(/欢迎|Welcome|仪表盘|Dashboard/i).first()).toBeVisible()
  })

  test('侧边菜单可展开', async ({ page }) => {
    const systemMenu = page.locator('.el-menu').getByText(/系统管理|System/i).first()
    await systemMenu.waitFor({ state: 'visible', timeout: 15000 })
    await systemMenu.click()
    await expect(page.getByText(/用户管理|Users/i).first()).toBeVisible()
  })
})
