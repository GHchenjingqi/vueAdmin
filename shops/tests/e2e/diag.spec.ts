import { test } from '@playwright/test'

// 诊断辅助用例（非交付）：真实链路加购网络排查时使用；默认 skip，不进 CI 主套件。
test.skip('diagnose add-to-cart network', async ({ page }) => {
  const reqs: string[] = []
  page.on('request', (r) => reqs.push(`${r.method()} ${r.url()}`))
  page.on('response', (r) => reqs.push(`  -> ${r.status()} ${r.url()}`))
  await page.goto('/')
  const hrefs = await page.locator('a[href*="/products/"]').evaluateAll((els) =>
    Array.from(new Set(els.map((el) => el.getAttribute('href')).filter((h): h is string => Boolean(h)))),
  )
  let found = ''
  for (const href of hrefs.slice(0, 8)) {
    await page.goto(href)
    const btn = page.getByRole('button', { name: /Add to Cart/ })
    if (await btn.isEnabled({ timeout: 2_000 }).catch(() => false)) {
      found = href
      break
    }
  }
  console.log('FOUND ENABLED PRODUCT:', found)
  if (!found) return
  const main = await page.locator('main').innerText()
  console.log('PAGE TEXT:', main.replace(/\n+/g, ' | ').slice(0, 400))
  await page.getByRole('button', { name: /Add to Cart/ }).click()
  await page.waitForTimeout(4000)
  console.log('CART REQS:', JSON.stringify(reqs.filter((r) => r.includes('cart')), null, 1))
  const cartText = await page.locator('a[href="/cart"]').innerText().catch(() => 'NOLINK')
  console.log('CART BADGE:', cartText.trim())
})
