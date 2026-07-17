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
 */
export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : 2,
  reporter: [
    ['html', { outputFolder: '../e2e-report' }],
    ['list'],
  ],

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})