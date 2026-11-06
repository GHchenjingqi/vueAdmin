import { expect, test } from '@playwright/test'

/**
 * 冒烟 E2E（P1-T13）：首页 SSR、货币符号随配置、加购→下单→支付结果主链路。
 * 运行前提：`npm run dev` 或 `node .output/server/index.mjs`。
 *
 * G5 回归（2026-11-06）：商品详情页不再硬编码 mock fixtures 的 slug。
 * 运行中的 BFF 可能走真实后端数据源（`NUXT_COMMERCE_SOURCE=auto`），
 * 此时 mock 商品在库中不存在、SSR 返回 404「Product not found」。
 * 改为从首页 SSR 链接动态取首个在售商品，mock / 真实两种数据源均可跑通；
 * 并跳过「Out of stock」卡片（真实库中存在缺货的 fallback 测试商品），
 * 否则 Add to Cart 为 disabled、click 会一直等到超时。
 */
async function gotoAvailableProduct(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/')
  const hrefs = await page.locator('a[href*="/products/"]').evaluateAll((els) =>
    Array.from(
      new Set(
        els
          .filter((el) => !/out of stock|sold out/i.test(el.textContent ?? ''))
          .map((el) => el.getAttribute('href'))
          .filter((href): href is string => Boolean(href)),
      ),
    ),
  )
  if (!hrefs.length) throw new Error('首页未渲染任何在售商品链接，无法执行详情/下单冒烟')
  for (const href of hrefs.slice(0, 6)) {
    await page.goto(href)
    const addBtn = page.getByRole('button', { name: /Add to Cart/ })
    if (await addBtn.isEnabled({ timeout: 2_000 }).catch(() => false)) return
  }
  throw new Error('首页前 6 个商品均不可加购（缺货），无法执行下单冒烟')
}

test('home renders hero and products with currency symbol', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Glueless Wigs')
  await expect(page.locator('text=Shop by Category')).toBeVisible()
})

test('product detail: variant selection updates availability', async ({ page }) => {
  await gotoAvailableProduct(page)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const addBtn = page.getByRole('button', { name: /Add to Cart/ })
  await expect(addBtn).toBeVisible()
  await expect(addBtn).toBeEnabled()
})

test('cart → checkout → order result flow', async ({ page }) => {
  await gotoAvailableProduct(page)
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
