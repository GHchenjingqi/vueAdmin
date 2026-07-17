import { test, expect } from '@playwright/test'

test.describe('认证流程', () => {
  test('登录成功 - 默认管理员', async ({ page }) => {
    await page.goto('/login')

    await expect(page.getByRole('heading', { name: /登录|Sign in/ })).toBeVisible()

    await page.getByPlaceholder(/用户名|Username/).fill('admin')
    await page.getByPlaceholder(/密码|Password/).fill('123456')
    await page.getByRole('button', { name: /登录|Sign in/ }).click()

    await page.waitForURL('/')
    await expect(page.locator('.welcome-greeting, .dashboard-container')).toBeVisible()
    await expect(page.locator('.welcome-greeting')).toContainText('admin')
  })

  test('登录失败 - 错误密码', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder(/用户名|Username/).fill('admin')
    await page.getByPlaceholder(/密码|Password/).fill('wrong_password')
    await page.getByRole('button', { name: /登录|Sign in/ }).click()

    await expect(page.getByText(/用户名或密码错误|Invalid username/)).toBeVisible()
    await expect(page).toHaveURL(/.*login/)
  })

  test('登录失败 - 空用户名', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: /登录|Sign in/ }).click()
    await expect(page.getByText(/请输入用户名|Username is required/)).toBeVisible()
  })

  test('登录失败 - 空密码', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder(/用户名|Username/).fill('admin')
    await page.getByRole('button', { name: /登录|Sign in/ }).click()
    await expect(page.getByText(/请输入密码|Password is required/)).toBeVisible()
  })
})