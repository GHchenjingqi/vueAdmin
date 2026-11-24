import type { PromptImageGroupInput, PromptPlatform } from '@/api/prompt'

/**
 * 由效果图平台组派生模型名集合：按平台组顺序映射为平台名，去重后返回。
 * 单条模式传 platformGroups；套组模式传所有步骤 platformGroups 的合并结果。
 */
export function deriveModelNames(groups: PromptImageGroupInput[], platforms: PromptPlatform[]): string[] {
  const names: string[] = []
  for (const group of groups) {
    const name = platforms.find((platform) => platform.id === group.platformId)?.name
    if (name && !names.includes(name)) names.push(name)
  }
  return names
}

/** 模型名集合拼成存储字符串（与大数据里既有「即梦 / 可灵」风格一致） */
export function joinModelNames(names: string[]): string {
  return names.join(' / ')
}
