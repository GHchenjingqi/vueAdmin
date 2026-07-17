/**
 * API 模块统一导出入口
 * 各模块按业务领域拆分，新增模块时在此导出
 */
export { authApi } from './auth'
export { userApi } from './user'
export { dashboardApi } from './dashboard'
export { logApi } from './log'
export { menuApi } from './menu'
export { uploadApi } from './upload'
export { settingApi, siteApi } from './setting'
export { dictApi } from './dict'
export { noticeApi } from './notice'
export { deptApi } from './dept'
export { roleApi } from './role'
export { searchApi } from './search'
export type { SearchGroup, SearchItem } from './search'
export { messageApi } from './message'
export { onlineUserApi } from './onlineUser'
export { taskApi } from './task'
export { serverApi } from './server'
