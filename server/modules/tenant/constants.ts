/** 平台菜单模板所在的租户作用域（0 不是真实租户，永不用于业务数据行） */
export const PLATFORM_TENANT_ID = 0

/** 默认租户：单机部署升级而来，同时充当「角色模板」的来源租户 */
export const DEFAULT_TENANT_ID = 1

/**
 * 新租户角色蓝本：来源租户（默认 1）中这些编码的角色会被复制给新租户，
 * 含其菜单授权，使新租户管理员一登录就拥有与自己租户匹配的管理能力。
 */
export const ROLE_TEMPLATE_CODES = ['admin', 'user']
