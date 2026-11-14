# storefront-ops-audit Dimension 06 · 支付、稳定性与生产就绪

Route: C
证据范围：`server/modules/storefront/payments/*`、`server/app.ts`、`server/modules/storefront/services/paymentReconcileService.ts`、`shops/nuxt.config.ts`、`shops/server/api/[...mock].ts`

## 结论

支付链路设计得比较严谨（状态机、幂等、验签、对账扫描、超时关单），这部分是全项目最扎实的模块。真正的风险在"数据源兜底"：`commerceSource=auto` 会在后端网络抖动时静默回退到 mock 数据，可能向真实顾客展示假商品。另外支付通道缺 Stripe / Apple Pay，对欧美市场是明显短板。

## 证据链

### 1. 已有的稳健设计（先肯定）

- 网关注册表按后台勾选 + feature flag + 币种能力三重过滤，`isProviderUsable` 在"建会话"与"webhook"两侧都校验，避免只改展示层被绕开。[^dim06-registry]
- 真实网关缺配置直接 503，禁止静默降级为 mock 或假成功。[^dim06-assert]
- 支付凭据加密存储，`secretBlob` 格式为 `iv:tag:cipher`，出参脱敏只回显末 4 位。[^dim06-cred]
- 对账扫描器每 5 分钟扫 `initiated` 单据，支持查单补单、超时关单并释放库存预占。[^dim06-recon]
- 退款按原支付通道原路退，`refundNo` 作为网关幂等键。[^dim06-refund]

### 2. 关键风险：auto 模式静默回退 mock

`commerceSource` 默认值为 `auto`：[^dim06-auto]

```js
commerceSource: process.env.NUXT_COMMERCE_SOURCE || 'auto',
```

`auto` 的语义是"real 优先，网络级失败回退 mock"。[^dim06-source]

在商品目录 BFF 中，网络级失败会落到 mock fixtures：[^dim06-fallback]

```js
// 网络级失败 → mock 回退（前端独立开发模式）
  }
  const mock = mockCatalog(path, query)
```

后果：一旦生产环境后端短暂不可达（重启、超时、证书过期），C 端会**正常返回 200 并展示演示商品**，顾客可以下单，但订单会落到 mock store 而不是真实数据库。监控层面看到的是"页面正常"，不会触发告警。

### 3. `.env.example` 默认 mock

`shops/.env.example` 里写的是 `NUXT_COMMERCE_SOURCE=mock`。[^dim06-envmock] 按该模板部署会直接进入 mock 模式。

### 4. 支付通道缺主流卡组织

`providerRegistry` 的通道清单为 paypal / wechat / alipay / unionpay / mock / bnpl。[^dim06-list]

无 Stripe、无 Apple Pay、无 Google Pay。对欧美假发品类（移动端占比高），Apple Pay 的转化提升通常比较明显。

### 5. 顾客身份存 localStorage

见 Dim04 第 7 条：token 存 localStorage，XSS 可直接读取。[^dim06-ls]

对比后台管理端使用 httpOnly Cookie + RefreshToken 模型（`server/models/RefreshToken.ts`），C 端顾客侧没有对齐。

## 影响判断

- auto 回退是**生产环境最高优先级风险**：它不会报错，只会让生意悄悄跑在假数据上。
- 缺 Apple Pay / 本地卡支付会拉低移动端结账完成率。
- 顾客 token 存储方式与后台不一致，安全基线不统一。

## 修复方向

1. **生产强制 real**：`NODE_ENV=production` 时 `commerceSource` 固定为 `real`，忽略环境变量的 `auto`/`mock`；或在启动时校验并拒绝以 mock/auto 启动生产实例。
2. **降级可见化**：保留 auto 仅用于开发，且回退时必须打 `X-Data-Source: mock` 响应头 + 上报监控；C 端在检测到 mock 数据源时展示维护横幅而非静默售卖。
3. **补支付通道**：优先接 Stripe（覆盖 card / Apple Pay / Google Pay / Link），复用现有 `GatewaySession` 的 `sdk` 动作类型。
4. **顾客会话升级**：token 改 httpOnly Cookie（`SameSite=Lax`，`Secure`），或至少改为内存 + refresh 双 token；同时补 CSRF 校验（后台已有 `originValidator`，C 端可复用）。

[^dim06-registry]: File: server/modules/storefront/payments/providerRegistry.ts, `isProviderUsable` 三重校验.
[^dim06-assert]: File: server/modules/storefront/payments/gatewayRegistry.ts, `assertGatewayConfigured` 缺配置抛 503.
[^dim06-cred]: File: server/modules/storefront/payments/credentialService.ts, `secretBlob` 为 iv:tag:cipher，出参脱敏.
[^dim06-recon]: File: server/modules/storefront/services/paymentReconcileService.ts, 5 分钟对账扫描与超时关单.
[^dim06-refund]: File: server/modules/shop/services/refundGatewayProvider.ts, 按原通道退款且 refundNo 幂等.
[^dim06-auto]: File: shops/nuxt.config.ts, `commerceSource: process.env.NUXT_COMMERCE_SOURCE || 'auto'`.
[^dim06-source]: File: shops/server/utils/commerce.ts, `auto`：real 优先，网络级失败回退 mock.
[^dim06-fallback]: File: shops/server/api/catalog/[...path].ts, 网络级失败后 `const mock = mockCatalog(path, query)`.
[^dim06-envmock]: File: shops/.env.example, `NUXT_COMMERCE_SOURCE=mock`.
[^dim06-list]: File: server/modules/storefront/payments/providerRegistry.ts, PROVIDERS 清单.
[^dim06-ls]: File: shops/shared/customer/auth.ts, token 存 localStorage.
