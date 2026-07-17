import { test, expect } from '@playwright/test'

test.describe('国际化切换', () => {
  test('登录页语言切换 - 中文 <-> English', async ({ page }) => {
    await page.goto('/login')

    const langSelector = page.getByText('简体中文')
    if (await langSelector.isVisible()) {
      await langSelector.click()
      await page.click('text=English')

      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
      await expect(page.getByPlaceholder('Username')).toBeVisible()
      await expect(page.getByPlaceholder('Password')).toBeVisible()

      await page.getByText('English').click()
      await page.click('text=简体中文')
      await expect(page.getByRole('heading', { name: /登录/ })).toBeVisible()
    }
  })

  test('首页语言切换保持一致', async ({ page }) => {
    await page.goto('/login')

    await page.goto('/login')
    await page.getByPlaceholder(/用户名/).fill('admin')
    await page.getByPlaceholder(/密码/).fill('123456')
    await page.getByRole('button', { name: /登录/ }).click()
    await page.waitForURL('/')

    const langSelector = page.locator('.locale-switcher')
    if (await langSelector.isVisible()) {
      await langSelector.click()
      await page.click('text=English')
      await expect(page.getByText('Dashboard')).toBeVisible()

      await langSelector.click()
      await page.click('text=简体中文')
      await expect(page.getByText('仪表盘')).toBeVisible()
    }
  })
})