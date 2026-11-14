/**
 * 站点级 head 配置（PLAN 5.4）
 *
 * 背景：`nuxt.config.ts` 的 `titleTemplate` 与页面里的 Organization/WebSite 结构化数据
 * 都硬编码了 'Aurora Hair Studio'，多站点或换品牌时必须改代码发版。
 *
 * 这里在应用启动时读一次 store config（SSR 首屏即生效），把 titleTemplate 设为
 * `%s · <siteName>`；取不到时回退内置名，避免出现 "页面标题 · " 的残缺结果。
 */
const FALLBACK_SITE_NAME = 'Aurora Hair Studio'

export default defineNuxtPlugin(async () => {
  const cfg = useStoreConfig()
  // 已有值（layout 可能已加载）时直接用，避免重复请求
  if (!cfg.config.value.siteName) {
    await cfg.load()
  }
  const siteName = cfg.config.value.siteName || FALLBACK_SITE_NAME

  useHead({
    titleTemplate: (titleChunk?: string) => (titleChunk ? `${titleChunk} · ${siteName}` : siteName),
  })
})
