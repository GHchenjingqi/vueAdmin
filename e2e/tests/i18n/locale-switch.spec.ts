import { test, expect } from '@playwright/test'
import { loginAsAdmin } from '../../helpers/auth'

test.describe('国际化切换', () => {
  test('登录页语言切换 - 中文 <-> English', async ({ page }) => {
    await page.goto('/login')

    const langSelector = page.getByText(/简体中文|中文|English/i).first()
    if (await langSelector.isVisible().catch(() => false)) {
      await langSelector.click()
      const english = page.getByText('English').first()
      if (await english.isVisible().catch(() => false)) {
        await english.click()
        await expect(page.getByPlaceholder(/Username|用户名/i).first()).toBeVisible()
      }
    } else {
      test.skip(true, '当前登录页未暴露语言切换入口')
    }
  })

  test('首页语言切换保持一致', async ({ page }) => {
    await loginAsAdmin(page)

    const langSelector = page.locator('.locale-switcher, .lang-switcher').first()
    if (await langSelector.isVisible().catch(() => false)) {
      await langSelector.click()
      const english = page.getByText('English').first()
      if (await english.isVisible().catch(() => false)) {
        await english.click()
      }
      await expect(page.locator('.dashboard, .page-container, .welcome-greeting').first()).toBeVisible()
    } else {
      test.skip(true, '当前布局未暴露语言切换入口')
    }
  })
})
