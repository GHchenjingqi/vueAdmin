import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E 测试配置
 *
 * 运行方式:
 *   npx playwright test --config=e2e/playwright.config.ts          # 无头模式运行
 *   npx playwright test --config=e2e/playwright.config.ts --ui     # UI 交互模式
 *   npx playwright test --config=e2e/playwright.config.ts --debug  # 调试模式
 *
 * 查看报告:
 *   npx playwright show-report e2e-report
 *
 * 前提:
 *   1. 已安装浏览器: npx playwright install chromium
 *   2. 后端已启动: npm run dev（默认 https://localhost:5173）
 *   3. 数据库已初始化且种子用户 admin / 123456 可用
 */
const baseURL = process.env.E2E_BASE_URL || 'https://localhost:5173'

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : 1,
  reporter: [
    ['html', { outputFolder: '../e2e-report' }],
    ['list'],
  ],

  use: {
    baseURL,
    // 开发服务器使用自签名 HTTPS 证书
    ignoreHTTPSErrors: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  // CI 可由 workflow 自行拉起服务；本地可取消注释 webServer
  // webServer: {
  //   command: 'npm run dev',
  //   url: baseURL,
  //   reuseExistingServer: !process.env.CI,
  //   ignoreHTTPSErrors: true,
  //   timeout: 120_000,
  // },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
