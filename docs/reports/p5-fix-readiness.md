# P5 缺陷修复就绪包（B 线）

> 生成时间：2026-11-06 15:00 · 状态：**补丁已验证，等待并行方提交 P5 批次后应用**
> 关联报告：`docs/reports/p5-extension-audit.md`、`docs/reports/p5t03-webhook-audit.md`

## 1. 为什么现在只是「就绪」而不是「已修」

`B` 线的触发条件是并行方提交 P5-T03/T04/T05/T07。截至本次核查：

- 分支 `0/0` 同步，最新提交 `780b4ae`，近 35 分钟无新提交；
- `server/modules/storefront/payments/`、迁移 `000066`~`000069`、`bundleService.ts`、`referralService.ts`、`warehouseRoutingService.ts` 及三个扩展测试文件**全部仍是未跟踪 WIP**；
- 缺陷代码本身只存在于 WIP：`quoteService.ts` 的 57 行 Bundle 逻辑在 HEAD 中不存在，因此**无法对 HEAD 打补丁**；把 WIP 版修复送进主干会夹带并行方未提交的新特性；Webhook 修复依赖未跟踪的 `providerRegistry.ts`，单独提交会让主干编译失败。

所以本轮不提交任何源码改动，改为交付一套**已在真实工作树上应用、跑通验证、再精确撤销**的补丁与用例，把对方提交后的落地工作压缩到几分钟。

## 2. 交付物

| 文件 | 内容 |
| --- | --- |
| `docs/patches/p5-fix-readiness.patch` | 5 个文件、6 个 hunk 的 unified diff，`git apply --check` 通过 |
| `docs/patches/p5-fix-readiness.test.ts.txt` | 17 例可执行回归用例（复制后去掉 `.txt` 后缀） |
| `docs/patches/.gitattributes` | 声明 `*.patch` / `*.txt` 为 `-text`，保持原始字节 |
| 本报告 | 逐项修复说明、验证证据、应用顺序、业务待决项 |

**行尾说明**：仓库 `core.autocrlf=true`，而补丁天然是混合行尾（4 个 CRLF 源文件的 hunk 带 `\r`，2 个 LF 源文件的 hunk 不带）。若补丁被规范化成全 CRLF 或全 LF，`git apply` 会对其中一类文件上下文失配。局部 `.gitattributes` 让这两个文件按原始字节入库；已核验 index blob 与工作树字节一致（CRLF 84 行 / LF 148 行）。

## 3. 补丁内容（5 文件 / 6 hunk）

| # | 缺陷 | 文件 | 修复 |
| --- | --- | --- | --- |
| A | **P0 Bundle 双重折扣** | `server/modules/storefront/services/quoteService.ts` | bundle 优惠已在 L165-171 折入行单价并重算小计；改为 `discountCents = couponDiscountCents`，金额侧只再扣券折。`discountCents` 语义变为「从折后小计额外扣减的券折」，bundle 优惠仍由 `bundleDiscountCents` / `bundle` 单独暴露 |
| B | **P5-T03 Webhook 四类校验缺失** | `server/modules/storefront/services/paymentService.ts` | ① `getProvider` 注册校验在验签前返回 400；② `isProviderUsable` 校验 flag/币种返回 403；③ 改按 `providerRef` 查绑定记录，换 provider 重投返回 400；④ 验签密钥优先用 `def.webhookSecret` |
| C | **P1 佣金唯一索引未落库** | `server/migrations/20261106_000069_add-referral-system.ts` | `up()` 补 `addIndex(['tenantId','orderId'], { unique: true, name: 'uq_referral_tenant_order' })` |
| D | **P1 归因窗口可绕过 + 重复计佣** | `server/modules/storefront/services/referralService.ts` | 未来时间 / Invalid Date 一律 fail-closed 计 `void`；`recordCommission` 加 `findOne` 幂等，唯一索引为并发兜底 |
| E | **P2 承诺仓 ≠ 发货仓** | `server/modules/shop/services/warehouseRoutingService.ts` | 抽 `primaryWarehouse(rows)`（首个有货仓），`pickWarehouse` 与 `getDeliveryCommitment` 共用，杜绝两处口径再次漂移 |

**A 为什么这样修**：WIP 版 `storefront-bundle.test.ts` 已有断言 `amount === subtotal + shipping + tax - discountCents`。若保留 `discountCents` 含 bundle 优惠，修复会让这条既有测试变红。改为「`discountCents` 只含券折」后等式天然成立，无需改任何既有断言，且 `Σ lineTotalCents + 运费 + 税 - 券折 === amountCents` 这一财务不变量成立。实测：16000 分订单命中 fixed 500 → `amountCents = 15500`（修复前 15000）。

## 4. 验证证据

验证方式：在**当前 WIP 工作树**上 `git apply` 补丁 → 放入 17 例用例 → 跑测试 → `git apply -R` 精确撤销 → 哈希比对还原。

| 项目 | 结果 |
| --- | --- |
| 17 例新用例 + 既有 Bundle 8 例 + Referral 7 例 | **32/32 通过** |
| 后端全量（两轮） | **675/675（73 文件）**，两轮稳定 |
| `tsc -p server/tsconfig.json --noEmit` | 0 错误 |
| `git apply --check` / `git apply -R` | 均通过 |
| 还原后 6 个源文件 SHA-256 | 全部与补丁前一致 |

17 例分布：Bundle 4（A1~A4）/ 佣金 2（B1~B2）/ 归因窗口 3（C1~C3）/ 仓网 3（D1~D3）/ Webhook 5（W1~W5），对应两份审计报告的「待补用例」清单。用例使用独立租户 `987654` 与唯一 SKU/单号，与并行方 dev 数据零共享，且整体 `vi.mock` 了 feature flag，不写全局 Setting 行。

**期间发现并回退的一处设计问题**：最初还包含第 6 个 hunk（把归因触点改为「服务端首单时间」），实测使既有 `storefront-referral.test.ts` 的「窗口超时 → void」用例从 `void` 变 `pending`。该改动实质是**改写归因业务契约**（触点 = 点击时刻 还是 首单时刻），不应由技术侧代决，已整体移出补丁，见 §6。

## 5. 应用步骤（并行方提交 P5 批次后）

```bash
# 1) 校验补丁仍能套用（对方提交后若上下文漂移，需按报告逐 hunk 对齐）
git apply --check docs/patches/p5-fix-readiness.patch
git apply docs/patches/p5-fix-readiness.patch

# 2) 放入回归用例（TESTS_DIR 指向测试目录）
TESTS_DIR=server/__tests__
cp docs/patches/p5-fix-readiness.test.ts.txt "$TESTS_DIR"/p5-fix-readiness.test.ts

# 3) 数据库前置：清理历史重复佣金台账后执行迁移中的唯一索引
#    （000069 若已执行，需另建 000070 补索引，见下）

# 4) 验证
cd server && npx vitest run
npx tsc -p tsconfig.json --noEmit
```

**落地顺序建议**：A（上线阻断）→ B（交易安全）→ C/D（资金台账）→ E（承诺一致性）。每步单独提交便于回滚。

## 6. 未纳入补丁 / 需业务或环境决策

| 项 | 状态 | 原因 |
| --- | --- | --- |
| 归因窗口「服务端首次触点」彻底修复 | **待业务决策** | 需要新增触点持久化表（按 `referralCode + visitorId` 记录点击时刻）并改写现有窗口契约；当前补丁只做未来时间/非法值 fail-closed 止血，客户端仍可每次传 `now` 使窗口不失效 |
| `inventory` 缺 `(tenantId,skuId,warehouseId)` 唯一索引 | **待环境确认** | 需新建迁移；编号与并行方未跟踪的 `000066`~`000069` 冲突，且补索引前须核查历史重复数据 |
| `000069` 已执行时的唯一索引 | **需另建迁移** | 推荐 `000070`，`down()` 对应 `removeIndex`；本补丁直接改 `000069.up()`，仅适用于该迁移尚未执行的环境 |
| Webhook「无历史支付记录放行」兼容策略 | **待业务确认** | 补丁按兼容策略放行（内部建单/回归夹具）；是否收紧为「一律拒绝」需明确 |
| Provider 独立 webhook 密钥用例 | **待配置** | 当前 `providerRegistry.ts` 两个 provider 都未声明 `webhookSecret`，W5 只验全局密钥路径；配置后需补一例独立密钥错签 401 |
| qty>1 分摊舍入 | **P2 残留** | A3 断言差额 ≤ 组件数，未要求严格相等；严格相等需另行修分摊舍入 |

## 7. 零残留声明

补丁应用与撤销全程使用 `git apply` / `git apply -R`，只改补丁涉及的 hunk，不整文件覆盖；`git apply` 在 Windows 上把两个 LF 文件规范化成 CRLF，撤销后已逐字节转回。**六个源文件最终 SHA-256 与补丁前完全一致**，临时测试文件已删除，并行方工作树中的 WIP 未被修改或暂存。本轮提交只包含 `docs/` 下的报告、补丁、用例与计划文档。

---

*修复与门禁状态变更须由 P5 各责任方在提交后回填；本报告不代勾任何任务行。*
