import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'

/**
 * 门禁签字辅助 · 本地浏览器冒烟复验配置（G3 / G5 技术侧证据）
 *
 * 与 `playwright.config.ts` 的区别：
 *   - 使用宿主 Chrome（channel），无需下载 Playwright Chromium，适合本地快速复验；
 *   - 只跑 `smoke.spec.ts`（3 例），跳过诊断用例与其它 WIP 用例；
 *   - 产物写入仓库根 `.box-agent-scratch/`，不污染版本库；
 *   - baseURL 可用 E2E_BASE_URL 覆盖，便于指向任何已启动的 storefront（dev 或 .output 生产构建）。
 *
 * 用法（需先启动 storefront，例如 `node .output/server/index.mjs`，默认 3103）：
 *   cd shops && npx playwright test --config=tests/e2e/gate-smoke.playwright.config.ts
 *
 * 注意：必须从 shops/ 目录运行，使 CLI、本配置与 spec 共用同一份 @playwright/test，
 * 否则根依赖（1.61.x）与 shops 依赖（1.49.x）会触发 "Requiring @playwright/test second time"。
 * CI 仍使用 playwright.config.ts（ubuntu chromium），本配置仅供本地复验。
 */
export default defineConfig({
  testDir: '.',
  testMatch: 'smoke.spec.ts',
  outputDir: fileURLToPath(new URL('../../../.box-agent-scratch/gate-e2e-results', import.meta.url)),
  timeout: 45_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:3103',
    channel: 'chrome',
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
  ],
})
