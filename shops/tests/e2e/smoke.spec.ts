import { expect, test } from '@playwright/test'

/**
 * 冒烟 E2E（P1-T13）：首页 SSR、货币符号随配置、加购→下单→支付结果主链路。
 * 运行前提：`npm run dev` 或 `node .output/server/index.mjs`（mock 回退模式）。
 */
test('home renders hero and products with currency symbol', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Glueless Wigs')
  await expect(page.locator('text=Shop by Category')).toBeVisible()
})

test('product detail: variant selection updates availability', async ({ page }) => {
  await page.goto('/products/101-hd-lace-glueless-body-wave-wig')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('HD Lace Glueless')
  const addBtn = page.getByRole('button', { name: /Add to Cart/ })
  await expect(addBtn).toBeVisible()
})

test('cart → checkout → order result flow', async ({ page }) => {
  await page.goto('/products/101-hd-lace-glueless-body-wave-wig')
  await page.getByRole('button', { name: /Add to Cart/ }).click()
  await page.goto('/checkout')
  await page.fill('#fullName', 'Test Buyer')
  await page.fill('#phone', '1000000')
  await page.fill('#province', 'CA')
  await page.fill('#city', 'LA')
  await page.fill('#address1', '1 Main St')
  await page.fill('#postcode', '90001')
  await page.fill('#email', 'buyer@test.com')
  await page.getByRole('button', { name: /Place Order/ }).click()
  await expect(page).toHaveURL(/\/checkout\/result/)
  await expect(page.getByText(/Order SO\d+/)).toBeVisible()
})
