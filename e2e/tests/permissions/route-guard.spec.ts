import { test, expect } from '@playwright/test'

test.describe('路由守卫 - 权限控制', () => {
  test('未登录访问受保护路由 → 重定向到登录页', async ({ page }) => {
    await page.goto('/users')
    await page.waitForURL(/.*login/)
    await expect(page.getByRole('heading', { name: /登录/ })).toBeVisible()
  })

  test('已登录访问登录页 → 重定向到首页', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder(/用户名/).fill('admin')
    await page.getByPlaceholder(/密码/).fill('123456')
    await page.getByRole('button', { name: /登录/ }).click()
    await page.waitForURL('/')

    await page.goto('/login')
    await page.waitForURL('/')
    await expect(page.locator('.welcome-greeting')).toBeVisible()
  })
})