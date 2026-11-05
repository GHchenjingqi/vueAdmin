import { readConsent, pushConsentDefault } from '@shared/analytics/consent'
import { loadGa4 } from '@shared/analytics/events'

/**
 * P4-T10/T11 客户端初始化：
 * 1. Consent Mode v2 默认拒绝（先于任何脚本）
 * 2. 已同意 analytics → 加载 GA4（measurementId 由 runtime config 注入；未配置则仅 dataLayer）
 * 3. 首次访问未决定 → ConsentBanner 由 layout 渲染
 */
export default defineNuxtPlugin(() => {
  pushConsentDefault()
  const consent = readConsent()
  if (consent?.analytics) {
    const id = useRuntimeConfig().public.ga4MeasurementId as string | undefined
    if (id) loadGa4(id)
  }
})
