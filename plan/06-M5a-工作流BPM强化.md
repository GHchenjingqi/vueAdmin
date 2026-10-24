# M5a · 工作流 BPM 强化

> 前置：M1 多租户、M4 BullMQ 队列（超时/催办走队列）。这是企业版溢价的核心。

---

## 目标

把现有 5 节点工作流引擎（`server/services/WorkflowEngine.ts`）强化为可用 BPM：
1. 审批模式：会签（全部同意）、或签（任一同意）、加签（前/后加）。
2. 节点扩展：抄送（cc）、定时（timer）、并行网关（parallel）。
3. 流转增强：退回到任意节点、流程委托（请假代理人）、超时自动审批、催办。
4. SSE 通知复用现有推送（审批待办、催办）。

周期：3 周。

---

## 步骤 1：迁移与字段扩展

`server/migrations/`：
```
20260925_000001_extend-workflow-nodes.ts          # nodes 加 nodeType 扩展 + config
20260925_000002_extend-approval-tasks.ts         # tasks 加 会签/委托/超时/抄送字段
20260925_000003_create-workflow-delegates.ts      # 委托规则表
20260925_000004_create-workflow-cc-records.ts     # 抄送记录表
```

### workflow_nodes 扩展
```
nodeType  VARCHAR 扩展枚举: start/end/condition/approve/notify/cc/timer/parallel
approvalMode  VARCHAR NULL  -- approve 节点: countersign(会签)/any-sign(或签)/sequential(顺序)
config   JSON   -- timer:{cron|duration}; parallel:{branches}; cc:{rule}
timeoutSeconds INT NULL  -- approve 超时秒数
autoActionOnTimeout VARCHAR NULL -- approve/approve_on_timeout(自动通过)/reject_on_timeout(自动驳回)
```

### approval_tasks 扩展
```
nodeId, instanceId 已有
mode         VARCHAR   -- countersign/any-sign/sequential（冗余存便于查询）
delegateUserId BIG NULL  -- 被委托人（当前审批人请假时代办）
ccUserIds    JSON NULL    -- 抄送人列表（冗余，实际写 cc_records）
timeoutAt    DATETIME NULL
status 扩展: pending/approved/rejected/delegated/cc/timeout/cancelled
parentTaskId BIG NULL     -- 加签时关联父任务
```

### workflow_delegates（请假代理人规则）
```
id, tenantId, userId, delegateToUserId, startAt, endAt, enabled
```

### workflow_cc_records
```
id, tenantId, instanceId, nodeId, userId, readAt
```

---

## 步骤 2：模型

- 扩展 `server/models/WorkflowNode.ts`、`ApprovalTask.ts`、`WorkflowInstance.ts`（加 timeoutAt 等）。
- 新建 `server/modules/workflow/models/WorkflowDelegate.ts`、`WorkflowCcRecord.ts`（带 tenantId）。
> 工作流相关模型迁移入 `server/modules/workflow/`（从 `server/services/`、`server/models/` 逻辑迁移），但保持模型文件位置兼容或统一迁移。本步可只新增字段与新模型，不强制搬迁现有文件。

---

## 步骤 3：引擎强化（WorkflowEngine.ts）

### 3.1 会签/或签/加签
- `approve` 节点按 `approvalMode`：
  - countersign：为每个审批人建一条 task，全部 approved 才流转。
  - any-sign：任一 approved 即流转，其余置 cancelled。
  - sequential：按 `approverRuleResolver`（现有 6 种规则解析）顺序建 task，前者处理完才建后者。
- 加签：审批人可"前加签/后加签"，创建 sub task 关联 parentTaskId，引擎流转时纳入。

### 3.2 退回到任意节点
新增 `workflowInstanceController` 的 `rollback(instanceId, targetNodeId)`：
- 校验目标节点在已执行链路上；
- 把当前及之后节点 task 置 cancelled，目标节点重新建 task。

### 3.3 抄送（cc 节点）
- cc 节点不阻塞流程，到达时按规则解析抄送人，写 cc_records + SSE 推送"您被抄送"。

### 3.4 定时（timer 节点）
- timer 节点注册 BullMQ delayed/repeat job（M4 队列），到点触发引擎继续。
- 也支持流程级超时：审批 task 超时按 `autoActionOnTimeout` 自动处理。

### 3.5 并行网关（parallel）
- 到达 parallel 节点同时建多条分支 task，所有分支汇聚后才继续（或按配置）。

### 3.6 委托
- 流转建 task 前查 `workflow_delegates`：若当前审批人在委托期内，task 的 `delegateUserId` 填代理人，代理人可代为审批。

### 3.7 催办
- 新增 `POST /workflow/instances/:id/remind`：向当前 pending task 审批人发 SSE + 邮件（走 M4 mail 队列）。

---

## 步骤 4：前端设计器扩展

`src/views/workflow/WorkflowDesigner.vue`（Vue Flow 画布）：
- 节点面板新增 cc / timer / parallel 三种节点拖拽。
- approve 节点属性面板加：审批模式（会签/或签/顺序）、超时秒数、超时动作。
- 新增"退回"操作按钮在运行实例详情页。

`src/api/workflow.ts` 增 `rollback` / `remind` / `delegate` 接口。

---

## 步骤 5：单元测试

- `server/__tests__/workflowCountersign.test.ts`：会签全过才流转，缺一不流。
- `server/__tests__/workflowAnySign.test.ts`：或签任一即流转。
- `server/__tests__/workflowCc.test.ts`：抄送不阻塞，cc_records 正确。
- `server/__tests__/workflowDelegate.test.ts`：委托期内代办人可审批。
- `server/__tests__/workflowTimeout.test.ts`：超时按配置自动通过/驳回（用 BullMQ 测试环境或手动触发）。
- `server/__tests__/workflowRollback.test.ts`：退回到任意节点重建 task。

---

## 步骤 6：验证

```bash
npm run migrate:status
npm run typecheck && npm run lint
cd server && npx vitest run workflow
npm test
```
手动：设计一个"会签 + 超时自动通过 + 抄送"流程，发起实例走通。

---

## Definition of Done

- [ ] workflow_nodes 支持 cc/timer/parallel + approvalMode + 超时配置
- [ ] approval_tasks 支持会签/或签/顺序/加签/委托/超时/抄送
- [ ] workflow_delegates / workflow_cc_records 表
- [ ] 引擎实现会签/或签/加签/退回/抄送/定时/并行/委托/催办
- [ ] 设计器画布支持新节点拖拽与属性配置
- [ ] 超时/催办走 BullMQ 队列
- [ ] countersign/anySign/cc/delegate/timeout/rollback 测试通过
- [ ] typecheck / lint / test / migrate:status 全绿
