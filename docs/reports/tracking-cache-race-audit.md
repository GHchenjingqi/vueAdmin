# 物流轨迹缓存并发刷新审计（trackingService）

> 发现式实证审计第 10 轮 · 2026-11-09 · 基线 HEAD `e1444c3`
> 范围：`server/modules/storefront/services/trackingService.ts`（2 个函数）
> 原则：写库实证坐实 → 最小修复 → 回归 → 登记残留；不代决业务口径、不代勾门禁/签字/任务行。

## 1. 链路与背景

`shop_tracking_events` 用 `(tenantId, shipmentId)` 唯一索引 `uniq_tracking_tenant_shipment`
（见 `server/migrations/20261105_000057_create-shop-tracking-events.ts`）保证一个运单只有一条轨迹缓存。
公开查询 `GET /track/:orderNo?accessToken=` 走 `orderNo + accessToken + tenantId` 双要素防枚举，
缓存超过 10 分钟且注入了 17track provider 时拉取外部轨迹并刷新缓存，异常降级到本地缓存。

问题在于缓存写入是 `findOne` → `create` / `update`，**没有任何并发认领**：

- `getOrderTracking`：无缓存时并发请求各自 `create`，只有一个成功；其余抛
  `SequelizeUniqueConstraintError`，被外层 `catch {}` 吞掉，`cache` 变量仍是 `null`，
  C 端请求因此返回「`provider=local` + 空轨迹」；
- 每个并发请求都各自调用一次外部 provider（17track 按次计费/限流）；
- `upsertTrackingCache`（后台发货刷新）同类写法且**没有 try/catch**，并发直接 500。

既有 `server/__tests__/storefront-tracking.test.ts` 只覆盖顺序查询、幂等 upsert、单请求刷新与降级，
并发窗口从未被覆盖，所以缺陷一直没暴露。

## 2. 修复前写库实证

新增 `server/__tests__/tracking-cache-race.test.ts`，专属租户 987705，每组 8 个并发请求，
provider 内 `setTimeout(40ms)` 拉开并发窗口。修复前 3 例失败、1 例阴性对照通过：

| 场景 | 期望 | 修复前实测 |
|---|---|---|
| 首次并发查询（无缓存） | 8 个都返回 `17track` / 1 条事件 | **1 个 `17track` + 7 个 `local` 空轨迹**（8 个请求全 200，异常被吞） |
| 同上 provider 调用次数 | 1 | **8** |
| 同上轨迹表行数 | 1 | 1（唯一索引仍守住） |
| 缓存过期并发刷新 | provider 1 次 | **8 次**（8 个视图均有轨迹，单纯重复外呼） |
| 并发 `upsertTrackingCache` | 8 成功 / 1 行 / 同一 id | **1 成功 / 7 个 `SequelizeUniqueConstraintError`**、rows=1 |
| 顺序查询 + 降级 + 错误 token 404 | 通过 | 通过（阴性对照） |

影响定性：C 端同一订单的并发首查有 7/8 概率看到「无轨迹」，刷新后又会突然出现；
后台批量发货刷新会因唯一键 500 中断；外部 provider 被放大 8 倍调用。

## 3. 修复（只动 2 个函数）

**`getOrderTracking`**

- 新增模块内 `inFlightPulls: Map<string, Promise<TrackingProviderResult>>` 与 `pullOnce()`：
  key 为 `${tenantId}:${shipmentId}`，同进程并发请求共享一次 provider 拉取，settled（含 reject）后删除；
- `create` 捕获 `UniqueConstraintError` 后**回读赢家缓存**，让输家也返回同一份轨迹；
- 新增 `pulled` 内存兜底：回读不到或写入异常时，仍返回本次拉取的 status/events/provider，
  而不是空轨迹；`provider` 抛错时 `pulled` 为 `null`，原降级语义不变。

**`upsertTrackingCache`**

- `create` 捕获 `UniqueConstraintError` → 回读赢家行 → `update` 同一行 → 返回同一 id；
  其它异常照抛，回读不到则重抛原异常。

未改动：防枚举双要素与 404 口径、10 分钟 TTL、provider 注入与降级策略、返回结构字段、
`site` 参数用途、轨迹模型、迁移、路由与控制器，以及其它任何服务。

## 4. 验证

| 项 | 结果 |
|---|---|
| 新增实证测试 | **4/4 通过**（3 并发 + 1 阴性对照） |
| 相关既有回归（串行） | **13 文件 / 98/98** |
| 后端串行全量 | **86 文件 / 764/764**（上轮 85/760，+1 文件 +4 例） |
| `npm --prefix server run typecheck` | 0 错 |
| ESLint `--no-ignore` | 0 error |
| `node scripts/check-doc-links.mjs` | **168/168 OK** |
| `node scripts/gate-preflight.mjs --strict --json` | 7 PASS / 2 WARN / **0 FAIL**，签字 1 已签 / 17 项 |

阴性核查：全仓检索 `ShopTrackingEvent.create` 只有 `getOrderTracking` 与 `upsertTrackingCache`
两处，本轮均已收口；`shop_tracking_events` 无其它写入口。地址簿
`server/modules/storefront/services/addressService.ts` 本轮静态复核无同类缺口（双条件归属 +
顾客行 `FOR UPDATE` + 默认地址兜底），未改动。

## 5. 残留登记（未改，均需业务/架构决策或另行改造）

| # | 残留 | 说明 |
|---|---|---|
| R1 | in-flight 合并仅进程内 | 多实例/多进程部署仍各拉一次；彻底收口需 DB 层 CAS 认领或分布式锁 |
| R2 | 站点归属未校验 | `getOrderTracking` 只用 `site.shopId` 写 `siteId`，未按站点校验订单；同租户多站点凭 token 可跨站查，属站点隔离口径 |
| R3 | 写库未合并 / 外部数据未校验 | 缓存已存在时 8 个请求仍各自 `update`（值相同、最后写入者胜）；provider 返回的 `events` 未做结构/长度校验即落 JSON 列 |
| R4 | in-flight 无超时 | provider 挂起时同 key 后续请求都等待该 Promise，依赖外部客户端自带超时 |
| R5 | 内存兜底视图的 `syncedAt` | 回读失败走 `pulled` 兜底时 `syncedAt` 仍为 `new Date(0)`，前端可能误判陈旧（本轮不改返回结构） |
| R6 | 并发 upsert 最终态 | 回读后多个请求 `update` 同一行，若 status 不同则最终态取决于最后写入者 |
| R7 | `catch {}` 吞异常无观测 | 原降级策略连 DB 故障一起吞，无计数/日志；本轮保持原语义未扩范围 |
| R8 | 到货通知断点 | 上轮 `docs/reports/cart-customer-fork-audit.md` 实证的「补货 hook 丢弃收件人」仍需新增通知通道，属业务决策，未改订阅代码 |
| R9 | 测试与并行方数据 | 租户 987705 遗留订单/轨迹为测试自建数据；并行方 WIP 与 G5 业务签字均按约定未碰 |

## 6. 本轮边界

- 未代勾门禁、未代替责任方签字、未回填 `shops/mds/storefront-execution-plan_v1.0.md` 任务行；
  `docs/reports/gate-signoff-pack.md` 原件未改动（业务方已签 1 项）。
- 精准暂存仅本轮 3 个文件，排除并行方 WIP、`.box-agent-scratch/`、`.workbuddy/memory/`、
  计划文档与签字包。
- 本轮进行中并行方在同一工作区提交 `3ca4fe8`（shops 商品级 TDK，4 文件），已核对未碰本轮文件；
  推送时顺带推进该已提交历史，属分支推进而非夹带。
