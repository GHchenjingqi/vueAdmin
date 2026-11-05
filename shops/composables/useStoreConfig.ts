import { computed } from 'vue'
import type { StoreConfig } from '@shared/types/currency'
import { DEFAULT_CURRENCY_CONFIG } from '@shared/types/currency'
import { formatMoney } from '@shared/currency/format'
import { storeConfigSchema } from '@shared/schemas/contract'

/**
 * Store Config（P1-T06）：useStoreConfig()。
 * 币种不得进环境变量（P1-T03）：值来自 /api/store-config（BFF）。
 * 拉取失败回退 DEFAULT_CURRENCY_CONFIG 仅作默认展示，业务决策（下单/报价）仍以接口为准（C7）。
 */
export function useStoreConfig() {
  const config = useState<StoreConfig>('store-config', () => ({
    currency: DEFAULT_CURRENCY_CONFIG,
    market: { country: 'US', language: 'en-US' },
    version: 'init',
  }))

  async function load(): Promise<StoreConfig> {
    try {
      const raw = await $fetch('/api/store-config')
      config.value = storeConfigSchema.parse(raw) as StoreConfig
    } catch {
      config.value = { currency: DEFAULT_CURRENCY_CONFIG, market: { country: 'US', language: 'en-US' }, version: 'fallback' }
    }
    return config.value
  }

  const currency = computed(() => config.value.currency)
  const market = computed(() => config.value.market)

  function format(amount: number): string {
    return formatMoney(amount, currency.value)
  }

  return { config, currency, market, load, format }
}
