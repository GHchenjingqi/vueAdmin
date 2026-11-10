# 发现式实证审计 · 支付凭据后台配置链路

> 本轮对象：上一轮新交付的「凭据后台可配置 + DB 加密落库 + env 兜底」链路。
> 该链路处理商户密钥/证书，历轮审计（订单/库存/配额/评价/网关）从未覆盖。
> 方法：先**写库实证测试跑红坐实缺陷**，再做最小修复转绿，最后全量回归。

## 一、审计范围

| 文件 | 职责 |
|---|---|
| `payments/credentialService.ts` | 加解密、DB/env 合并、掩码、保存 |
| `payments/credentialFields.ts` | 四网关字段权威源 |
| `shop/controllers/paymentChannelsController.ts` | 后台 API（开关/状态/凭据读写） |
| `shared/schemas/storefront-commerce.ts` | 凭据更新 zod 校验 |
| `shop/models/ShopPaymentCredential.ts` + 迁移 000076 | 加密落库，`uq_tenant_provider` |

## 二、坐实的缺陷（实证测试 `credential-hardening.test.ts`，修复前 5/5 全红）

### D1 · 高危：解密失败静默回退 env 凭据（fail-open）

`getStoredCredentials` 用 `try { findOne + decrypt } catch { return {} }` 吞掉**所有**异常。
于是当加密密钥轮换/漏配、或密文损坏时：

```
DB 里存的是 PROD 凭据 + env 里残留旧 SANDBOX 凭据
→ decrypt 抛错被吞 → 返回 {} → resolveGatewayConfig 落到 env 兜底
→ 返回 SANDBOX_CID / SANDBOX_SECRET
→ assertGatewayConfigured 仍判定「已配置」并通过
```

即**生产订单可能悄悄用沙箱商户号收款**，且系统全程无报错、无日志。这是比「缺配置 503」更危险的失败模式。
实证：`resolveGatewayConfig` 未抛错而返回 env 值；`assertGatewayConfigured` 误判通过（2 用例跑红）。

### D2 · 并发首次保存抛唯一键冲突

`saveCredentials` 是 `findOne → create/save`，并发首次保存同一 `(tenantId, provider)` 时多个请求都读到 `null` 并各自 `create`，触发 `uq_tenant_provider`：
`SequelizeUniqueConstraintError: Validation error`（后台 409/500，凭据保存失败）。

### D3 · 并发部分更新 lost-update

「留空=保留原值」的实现是 read-modify-write：两个并发请求分别改 `CLIENT_ID` 与 `ENV`，各自基于同一份旧值写回全量，后提交者覆盖前者。
实证：并发后 `CLIENT_ID` 回退为 `PROD_CID`（预期 `NEW_CID`），改动丢失。密钥轮换场景下可能残留旧证书。

### D4 · 改收款凭据无审计留痕

`updateCredentials` 保存后直接返回，未写任何审计记录。谁在何时换了哪个通道的商户凭据完全不可追溯（等同改收款账户）。
实证：`AuditLog` 查询返回 `null`。

## 三、最小修复

| 缺陷 | 修复 |
|---|---|
| D1 | `decryptCredentials` 统一包装为 `AppError(503, 'PAYMENT_CREDENTIAL_DECRYPT_FAILED: ...')`；`getStoredCredentials` **仅**在 `ER_NO_SUCH_TABLE`（未迁移/纯 env 部署）时降级，解密失败一律向上抛。支付会话、webhook 验签、后台凭据页全部 fail-closed；后台通道列表由 `credentialsState` 捕获并展示为「未配置 + 明确原因」。 |
| D1 附 | `getCipherKey()` 生产环境 `PAYMENT_CREDENTIAL_SECRET` 与 `JWT_SECRET` 皆缺时抛 503，禁止用公开可猜的 `dev-only-insecure-credential-key` 加密商户凭据（DB 泄露即等同明文）。 |
| D2/D3 | `saveCredentials` 改为 `sequelize.transaction` + `SELECT ... FOR UPDATE`（`Transaction.LOCK.UPDATE`）串行化同 key 的 read-modify-write；并发首次插入的唯一键冲突 / gap-lock 死锁回滚后开新事务重试（最多 3 次），重试时可读到已提交行并走合并更新。 |
| D4 | `updateCredentials` 成功后写 `AuditLog`：`action=payment.credentials_updated`、`entityType=config`、actor 取 `req.user`，`beforeState/afterState` **只记字段名集合与操作人**，不含任何凭据值（明文或掩码）。审计写入失败仅告警、不阻断主流程（沿用 `auditLogService.record` 既有语义）。 |

未改动：字段定义、网关适配器、schema、前端页面、迁移、鉴权路由。

## 四、验证

- 实证测试 `credential-hardening.test.ts` **5/5 转绿**；原有 `credentialService.test.ts` **8/8 保持绿**；合计 13/13。
- 测试库为真实 **MySQL**（`config/index.ts` 固定 `dialect:'mysql'`），行锁与事务重试是被真实并发验证的，非 SQLite 单点串行假象。
- 全量后端套件：**872 passed / 873 total**，唯一失败为历轮已知 `shopPhases.test.ts` 销售报表聚合超时（7.47s > 默认 5s）；`--testTimeout=30000` 复跑 **18/18 通过**，与本轮改动无关。
- `tsc --noEmit` 全库 **0 错误**（工作树含并行方 WIP 时亦为 0）。
- 本轮未改前端，无需 `vue-tsc`。

## 五、残留风险与运维手册（需用户侧输入/决策，未代改）

1. **加密密钥轮换**：`PAYMENT_CREDENTIAL_SECRET` 未显式设置时复用 `JWT_SECRET`；轮换任一密钥都会让已存密文无法解密。建议生产**显式单独设置** `PAYMENT_CREDENTIAL_SECRET` 并纳入密钥托管，与 JWT 密钥解耦。
2. **解密失败后的恢复路径**：本修复是 fail-closed，密文损坏时后台凭据页返回 503 且无法直接覆盖重写。恢复方式：①把密钥改回写入时的值，再进后台改凭据；②密钥确实丢失时由 DBA 删除该行后重新录入：
   `DELETE FROM shop_payment_credentials WHERE tenantId=? AND provider=?;`
   如需「后台一键强制重置」，需新增 `replace` 语义（schema/service/前端/测试），属独立需求，本轮未扩大范围。
3. **多租户 Webhook**：`resolveGatewayConfig` 的 tenant 取 ambient `TenantContext` 兜底 1，与既有 `paymentService.tid()` 口径一致；多站点各配各的凭据需按单号定位租户扩展。
4. **凭据值无长度上限**：`credentials: z.record(z.string(), z.string())` 未限制单值长度；admin 已是高权限，风险低，可选补 `.max(...)`。
5. **失败路径未留审计**：保存失败（如解密失败 503）未写审计记录，仅成功路径留痕。
6. **真实扣款联调**仍是唯一业务阻塞：需用户申请到四套商户凭据后在后台填入，才能跑沙箱→生产全链路。
7. 既有 6 项运维配置（证书轮换 / 租户隔离验证 / 银联外币结算币种 / 关闭 mock / 二维码依赖 / 对账文件）仍待确认。

## 六、下一轮候选方向

- 「通知/邮件」链路的幂等与重试（P3-T17 订单邮件、营销邮件 WIP 属并行方，需避开）。
- 后台高敏操作审计覆盖度普查（币种/通道开关/退款/凭据是否都有可追溯记录）。
- 凭据 API 的限流与失败审计、以及生产密钥显式配置的启动期校验。
