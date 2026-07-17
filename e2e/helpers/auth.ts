import { Page, expect } from '@playwright/test'

/**
 * 以管理员身份登录
 * 供多个测试文件复用，避免重复编写登录逻辑
 */
export async function loginAsAdmin(page: Page) {
  await page.goto('/login')
  await page.waitForSelector('input', { timeout: 10000 })
  await page.getByPlaceholder(/用户名|Username/).fill('admin')
  await page.getByPlaceholder(/密码|Password/).fill('123456')
  await page.getByRole('button', { name: /登录|Sign in/ }).click()
  await page.waitForURL('/', { timeout: 10000 })
}

/**
 * 保存认证状态到文件（可加速后续测试）
 */
export async function saveAuthState(page: Page) {
  await page.context().storageState({ path: 'e2e/.auth/admin.json' })
}

/**
 * 断言登录成功后的页面包含欢迎信息
 */
export async function expectLoginSuccess(page: Page) {
  await expect(page.locator('.welcome-greeting, .dashboard-container')).toBeVisible()
}