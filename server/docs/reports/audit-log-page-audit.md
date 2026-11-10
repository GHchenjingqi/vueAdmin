# 前端审计查询页落地（P1 §8.1 / §9 下一轮候选）

- 来源：`p1-hardening-audit.md` §8.1「前端审计查询页仍不存在」、§9 下一轮候选第 1 条
- 方法：测绘前端路由/菜单注册机制 → 最小改动补页面 + 菜单种子 + i18n → 全量验证
- 本轮**未触碰任何并行方 WIP**（会员 / 营销邮件 / 顾客管理 / checkout / quote / refund / customerAuth / app.ts 等），全程精准 `git add` 仅 5 个本任务文件

---

## 1. 背景与缺口

前三轮审计基建（凭证安全、三方向加固、券治理、订单关闭释放、支付终态扫描器、订单终态联动）累计写入了
`recordAdminAction` 与 `GET /shop/audit-logs` 查询接口（支持 `entityType` 必填 + `action` / `actorId` /
`actorType` / `from` / `to` / `limit` / `offset` 过滤，倒序返回），并提供了 `adminAuditApi.list()` 前端封装。
但**前端没有任何消费页面**，管理员无法可视化回溯审计留痕——整条审计链对业务侧不可见。

后端契约已由 `audit-log-query.test.ts`（6 例：倒序/钳制、action 精确、时间范围含边界、分页不重不漏、跨租户隔离、
端点参数校验）完整覆盖，故本轮聚焦「页面 + 菜单 + i18n」三件套，不再重复后端测试。

---

## 2. 前端路由/菜单注册机制测绘（关键事实）

- 动态路由由 `src/router/dynamicRoutes.ts:20` 的 `import.meta.glob('/src/{views,modules}/**/*.vue')` 自动注册；
  路由在 `addDynamicRoutes(menus)` 中按**后端菜单树**逐个 `router.addRoute('Layout', ...)`。
- 菜单 `component` 字段写成 `views/shop/settings/Xxx.vue`，运行期拼成 `/src/views/shop/settings/Xxx.vue` 命中 glob。
- 菜单名渲染：`SubMenu.vue:7` 用 `t(menuKey(item), {}, item.name)`——`menuKey` 将路径 `/shop-audit-log`
  转为 i18n key `sidebar.shop-audit-log`；命中则显示翻译，未命中回退到 `item.name`（中文）。
  （既有 `sidebar.shopPaymentChannels` 实为 kebab 不匹配的死 key，靠 `item.name` 兜底；本轮按正确 key 命名。）
- Element Plus 组件由 `unplugin-vue-components` 按需自动导入（标签全局可用、vue-tsc 不报未知标签）；
  脚本侧 API（`ref` / `ElMessage` / `useI18n`）需显式 import，否则 vue-tsc 报未定义。
- 菜单种子由迁移脚本写入：`server/migrations/20261109_000072_seed-payment-channels-menu.ts` 为同款范本。

---

## 3. 改动（5 文件）

| 文件 | 说明 |
| --- | --- |
| `server/migrations/20261110_000091_seed-audit-log-menu.ts` | 新增；幂等种入「操作审计日志」菜单，挂 `/shop` 下，`component=views/shop/settings/AuditLog.vue`，已本地 `npm run migrate` 应用 |
| `src/views/shop/settings/AuditLog.vue` | 新增；审计查询页：筛选条（实体类型/动作/操作人类型/操作人ID/时间范围）+ 结果表（时间/动作/实体/操作人标签/变更内容 JSON）+ 上页/下页/每页条数 |
| `src/i18n/zh-CN.json` | `sidebar.shop-audit-log` + 新增 `auditLog` 命名空间（页面文案） |
| `src/i18n/en-US.json` | 同上英文 |
| `server/docs/reports/audit-log-page-audit.md` | 本报告 |

### 页面契约对齐
- 调 `adminAuditApi.list(params)` → 拦截器解包后 `res.data` 即 `AdminAuditLog[]`（见 `src/utils/request.ts:74-80`）。
- `entityType` 默认 `order` 并在 onMounted 自动加载；缺实体类型时 `ElMessage.warning` 提示，与后端 400 校验互补。
- 时间范围用 `el-date-picker daterange`，默认返回 `Date` 对象，统一 `toISOString()` 传给后端（无 `value-format`，规避字符串解析时区歧义）。
- 操作人标签按 `admin→warning` / `system→info` / `customer→success` 配色；变更内容 `JSON.stringify` 在 `<pre>` 内展示。

---

## 4. 验证

- **i18n JSON**：`JSON.parse` 合法（zh-CN / en-US 均通过）。
- **迁移应用**：`npm run migrate` 输出 `已创建菜单 操作审计日志 (/shop-audit-log)`，幂等（重复执行不重复插入）。
- **后端 tsc**：`server tsc --noEmit` 0 错误（含新迁移文件）。
- **前端 vue-tsc**：本任务文件（AuditLog.vue / src/api/shop.ts / i18n 两个文件）**0 新增错误**；
  修复了 1 处 `el-date-picker v-model` 类型（原 `unknown[]` 不兼容，改为 `any[]`，与仓库既有风格一致）。
  仓库整体 vue-tsc exit=2 为**既有 auto-import 噪声**（Workflow*.vue / CouponList.vue 等），非本轮引入。
- **后端回归**：审计相关 4 文件 22/22 通过；**全量 931/931 通过**（0 失败）。

---

## 5. 残留与注记

1. **分页无 total**：`GET /shop/audit-logs` 仅返回当前页数组、无总条数，故页面用「本页条数 < 每页条数则禁用下一页」的启发式判断，不做精确末页。如要精确分页需在后端接口补充 `count`，属独立增强。
2. **审计写覆盖**：本轮仅做「读」页面；P1 报告 §8.4 提的「路由级通用审计中间件」仍需与并行方协调 `shop/routes/index.ts` 边界，未做。
3. **上线运维**：其它环境部署需 `npm run migrate` 应用 `000091` 菜单种子；该迁移仅写 `menus` 一行，不影响既有数据。
4. 并行方 WIP 完整保留（提交后 `git status` 复核），本任务零混入。
