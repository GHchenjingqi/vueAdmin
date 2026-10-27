import { test, expect } from '@playwright/test'

test.describe('认证流程', () => {
  test('登录成功 - 默认管理员', async ({ page }) => {
    await page.goto('/login')

    await expect(page.getByRole('button', { name: /登录|Sign in|Login/i })).toBeVisible()

    await page.getByPlaceholder(/用户名|Username/i).fill('admin')
    await page.getByPlaceholder(/密码|Password/i).fill('123456')
    await page.getByRole('button', { name: /登录|Sign in|Login/i }).click()

    await page.waitForURL((url) => !url.pathname.includes('login'), { timeout: 20000 })
    await expect(page.locator('.welcome-greeting, .dashboard, .page-container').first()).toBeVisible()
  })

  test('登录失败 - 错误密码', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder(/用户名|Username/i).fill('admin')
    await page.getByPlaceholder(/密码|Password/i).fill('wrong_password')
    await page.getByRole('button', { name: /登录|Sign in|Login/i }).click()

    await expect(page.getByText(/用户名或密码错误|Invalid username|密码错误|登录失败/i)).toBeVisible({ timeout: 10000 })
    await expect(page).toHaveURL(/login/)
  })

  test('登录失败 - 空用户名', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: /登录|Sign in|Login/i }).click()
    await expect(page.getByText(/请输入用户名|Username is required|用户名/i).first()).toBeVisible()
  })

  test('登录失败 - 空密码', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder(/用户名|Username/i).fill('admin')
    await page.getByRole('button', { name: /登录|Sign in|Login/i }).click()
    await expect(page.getByText(/请输入密码|Password is required|密码/i).first()).toBeVisible()
  })
})
