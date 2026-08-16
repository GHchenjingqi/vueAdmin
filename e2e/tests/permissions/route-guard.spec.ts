import { test, expect } from '@playwright/test'
import { loginAsAdmin } from '../../helpers/auth'

test.describe('路由守卫 - 权限控制', () => {
  test('未登录访问受保护路由 → 重定向到登录页', async ({ page }) => {
    await page.goto('/users')
    await page.waitForURL(/login/, { timeout: 15000 })
    await expect(page.getByRole('button', { name: /登录|Sign in|Login/i })).toBeVisible()
  })

  test('已登录访问登录页 → 重定向到首页', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/login')
    await page.waitForURL((url) => !url.pathname.includes('login'), { timeout: 15000 })
    await expect(page.locator('.welcome-greeting, .dashboard, .page-container').first()).toBeVisible()
  })
})
