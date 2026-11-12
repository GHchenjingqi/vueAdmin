/**
 * A/B 实验管理后台 API
 */
import request from '@/utils/request'

export interface ExperimentVariant {
  id: string
  /** 权重（百分数），同一实验所有 variant 权重和必须为 100 */
  weight: number
}

export interface ExperimentDef {
  key: string
  description: string
  variants: ExperimentVariant[]
  /** 关联 feature flag（实验框架统一由 ab_test 总开关控制） */
  flag: string
}

export interface ExperimentsResponse {
  /** ab_test 总开关是否开启 */
  enabled: boolean
  experiments: ExperimentDef[]
}

export interface FlagState {
  key: string
  enabled: boolean
}

export const experimentApi = {
  /** 获取实验定义清单与 ab_test 总开关状态（admin） */
  list: () => request.get<ExperimentsResponse>('/experiments'),
  /** 设置指定 feature flag 的启用态（admin），用于一键开关 ab_test */
  setFlag: (key: string, enabled: boolean) => request.put<FlagState>(`/flags/${key}`, { enabled }),
}
