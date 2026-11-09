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

## 8. 复核记录（2026-11-06 16:15，B 线解锁前例行复核）

本轮不修改任何 WIP 文件、不代勾门禁，只复核「补丁是否仍可落地」。

| 复核项 | 结果 |
| --- | --- |
| 分支同步 | `4633dad`（JsonLd 改用 `useHead`）已推送，`master_shop` 与 `origin` 同步（ahead/behind 0/0）；此前因网络滞留的 `538ebe8`、`7911aee` 均已入库 |
| P5 解锁状态 | **未解锁**：`storefront/payments/`、`bundleService.ts`、`referralService.ts`、`warehouseRoutingService.ts`、迁移 `000066`~`000069` 及三个扩展测试仍是未跟踪 WIP（工作树约 55 项变更） |
| 补丁可套用性 | `git apply --check --verbose docs/patches/p5-fix-readiness.patch` 退出 0，5 个文件全部通过；上下文未漂移，行号偏移由 git 自行处理 |
| 17 例用例契约 | 静态核对通过：`paymentService.ts` 已 import `getProvider` / `isProviderUsable`；`PaymentProviderDef.webhookSecret?` 已声明；`RecordCommissionParams` / `CommissionResult` 字段与补丁返回值一致；`Quote` / `OrderView` 含 `discountCents` / `amountCents` / `bundleDiscountCents` / `lineTotalCents`；`DeliveryCommitment` 含 `warehouseId` / `deliveryEstimateDays` / `available`；8 个模型均从 `shop/models/index.ts` 导出 |
| 类型检查 | `cd server && npx tsc -p tsconfig.json --noEmit` 退出 0（当前 HEAD + 工作树 WIP 基线） |

### 新增残留风险：账面承诺仓 ≠ 物理发货仓（不纳入本补丁）

复核调用链发现：`checkoutService.ts` 经 `reservationService.pickWarehouse` 选仓，后者（`:31-33`）只是转发到 `warehouseRouting.pickWarehouse`，因此补丁 E 生效后**账面**承诺仓与选仓口径一致。但 `reserveItems` 内部调用 `inventoryService.occupy(skuId, qty, ref)`（`:45`）**不按 `warehouseId` 指定物理仓**，`ShopInventoryReservation.warehouseId` 仅是账面代表仓，真实履约仍可能从其它有货仓发货。这属于跨仓库存口径的架构契约，需仓储/业务决策（是否按选仓强制定向扣减），不在本补丁 6 个 hunk 的覆盖范围内；决策落地前，D1~D3 只保证「路由层自洽」，不保证「履约层一致」。

**结论**：B 线就绪包保持有效，落地前置条件未变（等待并行方提交 P5 批次）；本轮零源码改动、零 WIP 暂存。

## 9. 落地记录（2026-11-09）

P5 后端批次已由 `7e1f82c` 入库（16 新文件 + 22 接线），B 线解锁。本节记录补丁实际应用结果与两处偏离预案的修正，**不代勾任何任务行或门禁**。

### 9.1 补丁应用结果

`git apply --check --verbose` 5/5 通过后 `git apply` 成功，5 文件 6 hunk（`+60/-10`）：

| 项 | 内容 | 结果 |
| --- | --- | --- |
| A | Bundle 双重折扣：`discountCents = couponDiscountCents`（上线阻断） | 落地，A1~A4 通过 |
| B | Webhook：provider 注册校验 / `providerRef` 绑定 / `isProviderUsable` / 独立 `webhookSecret` | 落地，W1~W5 通过 |
| C | `000069` 补 `uq_referral_tenant_order` | **仅对全新环境有效**，见 9.2 |
| D | 归因窗口未来时间 / Invalid Date fail-closed + 台账幂等 | 落地，C1~C3 通过；并发缺陷另修，见 9.3 |
| E | `primaryWarehouse()` 统一承诺仓与发货仓口径 | 落地，D1~D3 通过 |

Windows `core.autocrlf=true` 下 `git apply` 把两个原本 LF 的文件（`000069`、`warehouseRoutingService.ts`）规范成 CRLF，已逐字节转回 LF；其余 3 个文件保持纯 CRLF，diff 无行尾污染。

### 9.2 偏离预案：`000069` 已执行，另建 `000070`

实查 `sequelizemeta`，`000066`~`000069` **均已执行**，`referral_commissions` 无重复台账（仅 1 行），但 `uq_referral_tenant_order` 确实缺失。直接改 `000069` 不会让索引落库，故按 §6 预案新增 `server/migrations/20261106_000070_add-referral-commission-unique.ts`：

- `up()` 先 `showIndex` 判存，已存在则跳过（全新环境由 `000069` 建过）；表不存在亦跳过；
- 建索引前检查历史重复 `(tenantId, orderId)`，**有重复即抛错要求人工核对清理**（fail-closed，不自动删业务数据）；
- `down()` 同样幂等 `removeIndex`。

`npm run migrate` 执行成功，实查 `information_schema` 确认 `uq_referral_tenant_order`（`tenantId, orderId`，`NON_UNIQUE=0`）已落库。

### 9.3 新增修复：计佣并发唯一键冲突（B2 首次失败）

17 例首次运行 16/17，B2（`Promise.allSettled` 两次 `recordCommission`）失败：补丁 D 的 `findOne` 存在性检查与 `create` 非原子，索引落库后并发的第二个调用撞 `uq_referral_tenant_order` 抛异常。修复参照项目既有惯例（`refundService.ts` / `couponService.ts`）：`referralService.ts` 导入 `UniqueConstraintError`，`create` 包 try/catch，仅捕获唯一键冲突后回读首笔台账返回（不重复计佣、不抛异常），其它错误照常抛出。修复后 **17/17 通过**。

### 9.4 新增修复：回归用例租户 ID 冲突（并行全量 flake）

并行全量第 3 轮出现 4 例 `SKU 4910 库存不足（可用 0）`。根因：用例模板的 `TID=987654` 与既有 `inventory-concurrency.test.ts` **共用同一租户**，后者在 `beforeEach` 执行 `ShopInventory.destroy({ where: { tenantId: TID } })`，把本用例 `beforeAll` 初始化的库存清掉。已将 `server/__tests__/p5-fix-readiness.test.ts` 与模板 `docs/patches/p5-fix-readiness.test.ts.txt` 同步改为专属 `TID=987690`（全仓无占用），两份文件逐字节一致。修复后三轮并行全量中该失败不再出现。

### 9.5 验证与既有 flake

| 验证 | 结果 |
| --- | --- |
| 17 例就绪回归 | 单跑 17/17（修复前 16/17） |
| P5 相关既有回归（6 文件） | 51/51 |
| 服务端 typecheck | 0 错误 |
| 并行全量（首轮） | **727/727（79 文件）全绿** |
| 串行全量 `--no-file-parallelism` | **727/727（79 文件）全绿** |
| 文档链接 | 72/72 |

并行全量后三轮各 1 例失败，均为既有 `shopPhases.test.ts > 销售报表能聚合订单` 超时（`5000ms` 阈值；单跑两轮 2.3~2.5s、18/18 稳定）。该 flake 在本轮改动前多轮已登记，与本补丁无关；按最小改动约定**未修改既有测试的超时配置**，以串行全量全绿作为干净基线证据。

### 9.6 仍待决策（沿用 §6、§8，本轮未扩改）

Webhook「无历史支付记录放行」兼容策略、Provider 独立 webhook 密钥配置、归因窗口服务端首次触点持久化、账面承诺仓 ≠ 物理发货仓（`reserveItems` 不按仓定向扣减）、`inventory` 组合唯一索引、qty>1 分摊舍入严格相等、以及 `shopPhases` 超时 flake，均保持原状，需业务/环境/CI 责任方决策。

---

*修复与门禁状态变更须由 P5 各责任方在提交后回填；本报告不代勾任何任务行。*
