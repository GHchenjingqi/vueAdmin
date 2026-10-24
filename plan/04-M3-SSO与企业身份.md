# M3 · SSO 与企业身份

> 前置：M1 多租户已完成。可与 M2 并行。

---

## 目标

1. 租户级身份源（IdP）配置：OIDC / SAML / LDAP / 钉钉 / 企业微信 / 飞书。
2. 可插拔策略统一接口，本地账密保留为 fallback。
3. SSO 回调与本地登录共享同一 JWT 签发逻辑。
4. 外部身份与本地账号的绑定关系。

周期：2 周。完成即过企业采购门槛。

---

## 步骤 1：数据库迁移

`server/migrations/` 新增：
```
20260915_000001_create-idp-connections.ts
20260915_000002_create-external-identities.ts
```

### idp_connections（租户级，带 tenantId）
```
id PK AI
tenantId    BIGINT UNSIGNED  INDEX
type        VARCHAR(20)  -- oidc/saml/ldap/dingtalk/wecom/feishu
name        VARCHAR(100)
config      JSON  -- 加密存储（clientId/clientSecret/issuer/...）
enabled     TINYINT
UNIQUE(tenantId, type)   -- 同租户同类型默认一条（多实例可放宽）
```

### external_identities（外部身份与本地用户绑定）
```
id PK AI
userId      BIGINT UNSIGNED  INDEX
tenantId    BIGINT UNSIGNED
idpType     VARCHAR(20)
externalId  VARCHAR(200)     -- IdP 侧唯一ID（sub/unionid）
externalEmail VARCHAR(200)
UNIQUE(tenantId, idpType, externalId)
```

> config 中的 secret 字段用 `server/utils` 新增 `crypto.ts` 做 AES 加解密（密钥取 `config.app.encryptionKey`，缺失则启动报错）。

---

## 步骤 2：模型

新建 `server/modules/iam/models/`：
- `IdpConnection.ts`（带 tenantId）
- `ExternalIdentity.ts`（带 tenantId）
- 都会被 M1 全局 tenant hook 自动约束。

---

## 步骤 3：统一策略接口

新建 `server/modules/iam/strategies/types.ts`：
```ts
export interface SsoStrategy {
  type: 'oidc' | 'saml' | 'ldap' | 'dingtalk' | 'wecom' | 'feishu'
  getAuthorizeUrl(config: IdpConfig, redirectUri: string, state: string): string
  exchangeCode(config: IdpConfig, code: string, redirectUri: string): Promise<ExternalUserInfo>
}
export interface ExternalUserInfo {
  externalId: string
  email?: string
  username?: string
  nickname?: string
  avatar?: string
  raw?: Record<string, unknown>
}
```

实现文件（按需，M3 先做 OIDC + 钉钉，其余留接口）：
- `strategies/oidc.ts`（依赖 `openid-client`）
- `strategies/dingtalk.ts`（OAuth2 手写，无重依赖）
- `strategies/saml.ts`（依赖 `@node-saml/passport-saml`，M3 可后置）
- `strategies/ldap.ts`、`wecom.ts`、`feishu.ts` 留 TODO 占位

策略注册器 `strategies/registry.ts`：按 type 查表返回实例，找不到抛 400。

> 引入新依赖需在 `server/package.json` 显式列出，并记录到 README 技术栈表。

---

## 步骤 4：抽离共享签发逻辑

修改 `server/services/authService.ts`：把登录成功后的 token 签发抽成公共函数：
```ts
export async function issueTokens(user: User, rememberMe?: boolean) {
  // 复用现有 access + refresh + SSE ticket 逻辑
  // payload 含 tenantId / isPlatformAdmin（M1 已加）
  return { accessToken, refreshToken, user: pickProfile(user) }
}
```
`authController.login` 与新的 `ssoCallback` 都调用它，保证 token 结构一致。

---

## 步骤 5：SSO 路由与回调

新建 `server/modules/iam/routes/ssoRoutes.ts`：
```
GET  /auth/sso/:type           → 跳转 IdP 授权页（state=tenantId|nonce|csrf）
GET  /auth/sso/:type/callback   → 回调，校验 state，调 strategy.exchangeCode
POST /auth/sso/bind/:type        → 已登录用户绑定外部身份（需 authMiddleware）
GET  /auth/sso/connections      → 列出本租户已配置 IdP（需平台/租户管理员）
```

回调核心流程：
1. 校验 state（防 CSRF，state 含一次性 nonce，存 Redis 60s）。
2. `strategy.exchangeCode` 得 `ExternalUserInfo`。
3. 查 `external_identities`（按 tenantId+idpType+externalId）：
   - 命中 → 取关联 User → `issueTokens(user)`。
   - 未命中但 email 匹配本租户某 User → 自动绑定 + 签发（可配置开关，默认关，需用户确认）。
   - 都不命中 → 返回前端"未绑定，是否用当前外部身份创建/绑定账号"引导页。
4. 签发后 302 回前端（带短期一次性 code，前端换 token；或直接种 HttpOnly cookie 复用现有 cookie 机制）。

> SSO 回调不走 `authMiddleware`，但要走 `originValidator` + state 校验。

---

## 步骤 6：IdP 配置管理（租户管理员）

新建 `server/modules/iam/controllers/idpController.ts`：
- CRUD `idp_connections`（仅本租户，受 tenant hook 隔离）。
- 写入时 secret 字段加密；返回时脱敏（不回吐 secret）。

前端新增 `src/views/SsoSettings.vue`（挂在系统设置下），表单配置各 IdP。`src/api/iam.ts` 对接。

---

## 步骤 7：登录页入口

修改 `src/views/Login.vue`：
- 调 `GET /auth/sso/connections?public=1` 取本租户启用的 IdP 列表（按域名/子域识别租户，见 M6 白标）。
- 渲染"企业账号登录"按钮，点击跳 `/auth/sso/:type`。
- 本地账密登录保留。

---

## 步骤 8：单元测试

- `server/__tests__/ssoState.test.ts`：state 生成/校验/过期。
- `server/__tests__/externalIdentity.test.ts`：绑定/解绑/重复绑定。
- `strategies/dingtalk.test.ts`：用 nock mock 钉钉 OAuth 全流程（authorize→exchange→userinfo）。
- `strategies/oidc.test.ts`：mock issuer discovery。

---

## 步骤 9：验证

```bash
npm run migrate:status
npm run typecheck && npm run lint
cd server && npx vitest run sso externalIdentity dingtalk oidc
npm test
```
手动：自建 Keycloak 或测试 OIDC，租户 A 配置后用 SSO 登录走通；本地账密仍可登录。

---

## Definition of Done

- [ ] idp_connections / external_identities 两表（带 tenantId）
- [ ] IdP config 加密存储、返回脱敏
- [ ] SsoStrategy 统一接口 + OIDC/钉钉实现
- [ ] issueTokens 抽离，本地与 SSO 共享签发
- [ ] SSO 跳转/回调/state 校验走通
- [ ] 外部身份与本地用户绑定关系正确
- [ ] 登录页展示已启用 IdP 入口
- [ ] ssoState / externalIdentity / dingtalk / oidc 测试通过
- [ ] typecheck / lint / test / migrate:status 全绿
