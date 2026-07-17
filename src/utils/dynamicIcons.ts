/**
 * Element Plus 图标按需加载工具
 *
 * 使用响应式注册表，避免全量注册 300+ 图标到 Vue 实例。
 * 图标加载完成后通过响应式机制触发模板重新渲染。
 *
 * 用法：
 * ```vue
 * <el-icon><component :is="iconRegistry['Menu']" /></el-icon>
 * ```
 */
import type { Component } from 'vue'
import { shallowRef } from 'vue'

/** 响应式图标注册表：iconName -> Component 定义 */
const registry = shallowRef<Record<string, Component>>({})

/** 已加载/加载中的图标名称集合，避免重复请求 */
const loadingOrLoaded = new Set<string>()

/**
 * 响应式图标注册表（只读）
 * 模板中通过此对象获取图标组件，确保响应式更新
 */
export const iconRegistry = registry

/**
 * 获取图标组件
 * @param name 图标名称（如 'Menu', 'Setting', 'UserFilled'）
 */
export async function getIconComponent(name: string): Promise<Component | null> {
  try {
    const module = await import('@element-plus/icons-vue')
    const component = (module as Record<string, Component>)[name]
    return component || null
  } catch {
    return null
  }
}

/**
 * 加载并注册图标
 * 将图标组件存入响应式注册表，触发模板重新渲染
 */
export async function loadIcon(name: string): Promise<void> {
  if (loadingOrLoaded.has(name)) return
  loadingOrLoaded.add(name)

  const component = await getIconComponent(name)
  if (component) {
    registry.value = { ...registry.value, [name]: component }
  }
}

/**
 * 批量加载图标
 */
export async function loadIcons(names: string[]): Promise<void> {
  await Promise.all(names.map(loadIcon))
}

// ==================== 预加载常用菜单图标 ====================
//
// 菜单图标在侧边栏首次渲染时就需显示，如果等到 onMounted 才加载，
// 会出现图标延迟闪烁的问题。
// 这里在模块初始化时立即预加载项目中最常用的图标集合，
// 确保侧边栏首次渲染时图标已就绪。

const COMMON_MENU_ICONS = [
  'Setting',
  'Odometer',
  'User',
  'Share',
  'Avatar',
  'Grid',
  'Collection',
  'FolderOpened',
  'Bell',
  'Document',
  'ChatLineSquare',
  'Clock',
  'Monitor',
  'Connection',
  'DataBoard',
  'OfficeBuilding',
  'TrendCharts',
  'Refresh',
  'Message',
  'Plus',
  'Upload',
  'Key',
  'Menu',
  'HomeFilled',
  // FileManager 使用的文件类型图标
  'PictureFilled',
  'DocumentCopy',
  'Notebook',
]

// 立即启动预加载（不阻塞模块加载）
loadIcons(COMMON_MENU_ICONS).catch(() => {})
