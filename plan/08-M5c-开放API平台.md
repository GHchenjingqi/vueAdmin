# M5c · 开放 API 平台

> 前置：M1 多租户、M2 配额（apiCalls 计量）、M4 审计。可与 M5a/M5b 并行。

---

## 目标

让企业能把本系统集成进自己的系统：
1. 租户级 API Key 管理（签发/吊销/限流/作用域）。
2. `apiKeyAuth` 中间件替代 JWT 鉴权对外接口。
3. Webhook：工作流事件节点 HTTP 外发。
4. 对外 OpenAPI 文档按租户可见 API 子集。

周期：1 周。

---

## 步骤 1：迁移

`server/migrations/20261001_000001_create-api-keys.ts`：
```
api_keys:
id PK AI
tenantId   BIGINT UNSIGNED  INDEX
name       VARCHAR(100)
keyPrefix  VARCHAR(10)      -- 展示用前缀（va_xxxx）
keyHash    VARCHAR(128) UNIQUE  -- bcrypt 或 sha256(全key)
scopes     JSON              -- ["lowcode:read","users:read"]
rateLimitPerMin INT DEFAULT 60
lastUsedAt DATETIME
status     TINYINT          -- 1启用 0吊销
expiresAt  DATETIME NULL
createdAt/updatedAt
INDEX(tenantId, status)
```

---

## 步骤 2：模型与 Service

`server/modules/openapi/models/ApiKey.ts`（带 tenantId）。
`server/modules/openapi/services/apiKeyService.ts`：
- `createKey(tenantId, name, scopes, ttlDays)`：生成 `va_<32位随机>`，存 keyHash，**明文只返回一次**。
- `verifyKey(rawKey)` → 查 keyHash → 返回 tenantId/scopes/status。
- `revoke(id)`、`listByTenant(tenantId)`。

---

## 步骤 3：apiKeyAuth 中间件

`server/modules/openapi/middleware/apiKeyAuth.ts`：
```ts
// 从 header X-Api-Key 或 Authorization: ApiKey xxx 取
// verifyKey → req.apiKey = { tenantId, scopes }
// 设 tenantContext(走 runInTenant，与 JWT 路径一致)
// 作用域校验：req.route.scope ∈ req.apiKey.scopes
// 配额：incrUsage(tenantId, 'apiCalls')；超限 429
```
对外接口统一前缀 `/openapi/v1/*`，挂 `apiKeyAuth + quotaGuard('apiCalls')`。

---

## 步骤 4：对外接口

`server/modules/openapi/routes/openapiRoutes.ts`：
- 首批只读：`GET /openapi/v1/users`、`GET /openapi/v1/departments`、`GET /openapi/v1/lowcode/:code/records`、`GET /openapi/v1/workflow/instances/:id`。
- 每个接口在 OpenAPI 注解里标 `x-scope: users:read`。
- 写接口（POST）按需逐步开放，每条写操作记 audit（M4）。

> 对外接口的 controller 与内部复用，但需确保走 tenantContext + apiKey 上下文，不复用 JWT 的 `req.user`。

---

## 步骤 5：Webhook（工作流事件外发）

扩展 M5a 的 `notify` 节点 → 加 `notifyHttp` 子类型：
- 节点 config：`{ url, method, headers, bodyTemplate, retryPolicy }`。
- 引擎到达该节点时投递 `webhook` BullMQ job（M4 队列），worker 执行 HTTP 请求，失败按 retryPolicy 重试，记录投递日志（可加 `webhook_deliveries` 表，M5c 可选）。

`server/modules/openapi/services/webhookService.ts`：签名（HMAC，密钥取租户 settings `webhook_secret`）放 header，便于对端验签。

---

## 步骤 6：对外 API 文档

- 现有 `server/swagger.ts`（Redoc）已生成 OpenAPI。新增一个独立 spec 仅含 `/openapi/v1/*`，租户在"开放 API"页可查看其有权 scope 对应的接口。
- 前端 `src/views/ApiKeys.vue`：API Key 管理 + 在线文档入口 + 调试控制台（可发示例请求）。

---

## 步骤 7：前端

`src/api/openapi.ts`：`listKeys / createKey / revokeKey`。
`src/views/ApiKeys.vue`：列表 + 创建弹窗（明文 key 仅创建时一次展示，可复制）+ scope 多选 + 文档链接。

---

## 步骤 8：单元测试

- `server/__tests__/apiKeyAuth.test.ts`：有效/无效/过期/吊销 key；scope 不匹配 403；超限 429。
- `server/__tests__/apiKeyService.test.ts`：明文只返回一次；keyHash 校验。
- `server/__tests__/webhook.test.ts`：HMAC 签名正确；重试策略。

---

## 步骤 9：验证

```bash
npm run migrate:status
npm run typecheck && npm run lint
cd server && npx vitest run apiKey webhook
npm test
```
手动：租户创建 API Key → 用 curl 带 `X-Api-Key` 访问 `/openapi/v1/users` 成功；超 rateLimit 返回 429。

---

## Definition of Done

- [ ] api_keys 表（带 tenantId，keyHash 不存明文）
- [ ] apiKeyAuth 中间件 + scope 校验 + apiCalls 配额
- [ ] 对外只读接口 `/openapi/v1/*` 走通
- [ ] Webhook（notifyHttp 节点）HMAC 签名 + 重试
- [ ] 对外 OpenAPI 文档按 scope 可见
- [ ] 前端 ApiKeys 管理页（明文仅创建时一次）
- [ ] apiKeyAuth / apiKeyService / webhook 测试通过
- [ ] typecheck / lint / test / migrate:status 全绿
