export interface ExperimentAssignment {
  key: string
  enabled: boolean
  variant: string
  reason?: string
}

/**
 * A/B 实验组合式（P5-T08 业务接入）：/api/storefront/v1/experiments/:key/assign。
 * - subjectId：稳定匿名访客 id（cookie shop_visitor_id，缺省生成；SSR/CSR 一致）。
 * - 实验关闭 / 未知 / 缺 subject → fail-closed 返回 control（后端不计算分桶、不触发曝光 hook）。
 * - 纯只读，不碰报价与库存。
 */
export function useExperiment() {
  const subjectId = useCookie<string>('shop_visitor_id', {
    maxAge: 365 * 24 * 3600,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  })
  if (!subjectId.value) subjectId.value = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`

  async function assign(key: string): Promise<ExperimentAssignment> {
    try {
      return await $fetch<ExperimentAssignment>(
        `/api/experiments/${encodeURIComponent(key)}/assign?subjectId=${encodeURIComponent(subjectId.value ?? '')}`,
      )
    } catch {
      // 网络级失败 fail-closed：视为关闭，不阻塞页面
      return { key, enabled: false, variant: 'control', reason: 'fetch_failed' }
    }
  }

  return { subjectId, assign }
}
