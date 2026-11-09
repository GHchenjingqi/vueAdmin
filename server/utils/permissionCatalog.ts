/**
 * 按钮级权限码目录（F 类型菜单）
 *
 * 三方共用这一份真源：
 * - 迁移 20261103_000001：据此写入 menus 表的 F 记录并按父菜单授权既有角色；
 * - requirePermission 守卫：路由上声明的码必须出自本目录；
 * - __tests__/permissionCatalog.test.ts：静态扫描路由源文件，校验码与目录、目录与菜单种子的一致性。
 *
 * 命名沿用前端已有的约定 `模块:实体:动作`（如 system:user:add）。
 * parentPath 指向权限码挂靠的页面菜单（type M/C）路径；授权时继承该页面已有的角色，
 * 使「上线守卫」这一步不改变任何角色的既有可达能力——此后回收按钮权限才会真正生效。
 * 页面菜单不存在时迁移跳过该条，避免出现 parentId=0 的孤儿按钮记录。
 */

export interface PermissionCatalogEntry {
  /** 挂靠的父菜单 path */
  parentPath: string
  /** 权限码 */
  code: string
  /** 按钮名称（角色授权树中显示） */
  name: string
}

export const PERMISSION_CATALOG: PermissionCatalogEntry[] = [
  // ---------- 用户管理 ----------
  { parentPath: '/users', code: 'system:user:add', name: '新增用户' },
  { parentPath: '/users', code: 'system:user:edit', name: '编辑用户' },
  { parentPath: '/users', code: 'system:user:delete', name: '删除用户' },
  { parentPath: '/users', code: 'system:user:batchDelete', name: '批量删除用户' },
  { parentPath: '/users', code: 'system:user:import', name: '导入用户' },
  { parentPath: '/users', code: 'system:user:export', name: '导出用户' },
  { parentPath: '/users', code: 'system:user:resetPassword', name: '重置密码' },

  // ---------- 部门管理 ----------
  { parentPath: '/depts', code: 'system:dept:add', name: '新增部门' },
  { parentPath: '/depts', code: 'system:dept:edit', name: '编辑部门' },
  { parentPath: '/depts', code: 'system:dept:delete', name: '删除部门' },

  // ---------- 角色管理 ----------
  { parentPath: '/roles', code: 'system:role:add', name: '新增角色' },
  { parentPath: '/roles', code: 'system:role:edit', name: '编辑角色' },
  { parentPath: '/roles', code: 'system:role:delete', name: '删除角色' },

  // ---------- 菜单管理 ----------
  { parentPath: '/menus', code: 'system:menu:add', name: '新增菜单' },
  { parentPath: '/menus', code: 'system:menu:edit', name: '编辑菜单' },
  { parentPath: '/menus', code: 'system:menu:delete', name: '删除菜单' },

  // ---------- 租户管理（平台控制台，菜单 copyable=0，不下发给租户） ----------
  { parentPath: '/tenants', code: 'system:tenant:provision', name: '开通租户' },
  { parentPath: '/tenants', code: 'system:tenant:edit', name: '编辑租户' },
  { parentPath: '/tenants', code: 'system:tenant:disable', name: '停用/冻结租户' },

  // ---------- 基础设置 ----------
  { parentPath: '/settings', code: 'system:setting:save', name: '保存设置' },
  { parentPath: '/settings', code: 'system:setting:delete', name: '删除设置' },

  // ---------- 字典管理 ----------
  { parentPath: '/dict', code: 'system:dict:add', name: '新增字典' },
  { parentPath: '/dict', code: 'system:dict:edit', name: '编辑字典' },
  { parentPath: '/dict', code: 'system:dict:delete', name: '删除字典' },
  { parentPath: '/dict', code: 'system:dict:refresh', name: '刷新字典缓存' },

  // ---------- 文件管理 ----------
  { parentPath: '/files', code: 'system:file:delete', name: '删除文件' },

  // ---------- 系统日志 ----------
  { parentPath: '/logs', code: 'system:log:delete', name: '清理日志' },

  // ---------- 定时任务 ----------
  { parentPath: '/tasks', code: 'system:task:add', name: '新增任务' },
  { parentPath: '/tasks', code: 'system:task:edit', name: '编辑任务' },
  { parentPath: '/tasks', code: 'system:task:delete', name: '删除任务' },
  { parentPath: '/tasks', code: 'system:task:execute', name: '执行任务' },

  // ---------- 在线用户 ----------
  { parentPath: '/online-users', code: 'monitor:online:kick', name: '强制下线' },

  // ---------- 消息发布 ----------
  { parentPath: '/notices', code: 'notice:publish:add', name: '发布公告' },
  { parentPath: '/notices', code: 'notice:publish:edit', name: '编辑公告' },
  { parentPath: '/notices', code: 'notice:publish:delete', name: '删除公告' },
  { parentPath: '/messages', code: 'message:publish:send', name: '发送消息' },

  // ---------- 工作流定义与设计 ----------
  { parentPath: '/workflows', code: 'workflow:def:add', name: '新增流程' },
  { parentPath: '/workflows', code: 'workflow:def:edit', name: '编辑流程' },
  { parentPath: '/workflows', code: 'workflow:def:delete', name: '删除流程' },
  { parentPath: '/workflows', code: 'workflow:def:toggle', name: '启停流程' },
  { parentPath: '/workflows', code: 'workflow:def:publish', name: '发布流程' },
  { parentPath: '/workflows', code: 'workflow:def:design', name: '编辑流程设计' },

  // ---------- 运行实例 ----------
  { parentPath: '/workflow-instances', code: 'workflow:instance:retry', name: '重试实例' },
  { parentPath: '/workflow-instances', code: 'workflow:instance:terminate', name: '终止实例' },
  { parentPath: '/workflow-instances', code: 'workflow:instance:export', name: '导出实例' },
  { parentPath: '/workflow-instances', code: 'workflow:binding:add', name: '新增业务绑定' },
  { parentPath: '/workflow-instances', code: 'workflow:binding:delete', name: '删除业务绑定' },
  { parentPath: '/workflow-instances', code: 'workflow:reason:add', name: '新增驳回理由' },
  { parentPath: '/workflow-instances', code: 'workflow:reason:edit', name: '编辑驳回理由' },
  { parentPath: '/workflow-instances', code: 'workflow:reason:delete', name: '删除驳回理由' },

  // ---------- AI 服务商（前端为静态路由，无独立菜单，挂靠系统管理以便授权/回收） ----------
  { parentPath: '/system', code: 'ai:provider:add', name: '新增 AI 服务商' },
  { parentPath: '/system', code: 'ai:provider:edit', name: '编辑 AI 服务商' },
  { parentPath: '/system', code: 'ai:provider:delete', name: '删除 AI 服务商' },
]

/** 全部权限码（供自检与守卫声明比对） */
export const ALL_PERMISSION_CODES: string[] = PERMISSION_CATALOG.map((e) => e.code)

/** 按父菜单分组，迁移据此批量落库 */
export function groupCatalogByParent(): Record<string, PermissionCatalogEntry[]> {
  const grouped: Record<string, PermissionCatalogEntry[]> = {}
  for (const entry of PERMISSION_CATALOG) {
    if (!grouped[entry.parentPath]) grouped[entry.parentPath] = []
    grouped[entry.parentPath].push(entry)
  }
  return grouped
}
