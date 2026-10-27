---
name: execute-plan
description: 分阶段执行 plan/ 目录下的商业化升级里程碑文档。每个里程碑落地后先做代码质量自检（乱码/冗余逻辑/规范合规），再依次运行 format→typecheck→lint→test 并修复至全绿，通过后方可进入下一里程碑。适用于需要按 plan 文档顺序开发、且每阶段交付带"编码→自检→验证"闭环的场景。
---

# 按计划文档分阶段落地与验证

## Overview

本 skill 定义一个 **读文档 → 编码 → 自检 → 验证** 的阶段性闭环工作流，驱动 AI 助手严格按 `plan/` 目录的里程碑顺序（`00` → `01` → … → `09`）落地 vue-admin 商业化升级。每个里程碑交付前必须通过代码质量自检与 npm scripts 全绿验证，**不通过不进入下一阶段**。

## 何时使用

- 需要按 `plan/` 里程碑顺序开发落地商业化升级
- 希望每个阶段交付带"编码 → 自检 → 验证"闭环
- 用户说"执行 plan"、"按计划开发"、"带验证地分阶段推进"
- 落地 `plan/` 下任意一个里程碑并需要确认质量与构建通过

## 关键约定（先读）

1. **里程碑顺序**（`plan/` 目录）：`00-总览` → `01-M0` → `02-M1` → `03-M2` → `04-M3` → `05-M4` → `06-M5a` → `07-M5b` → `08-M5c` → `09-M6`。依赖关系见 `plan/00-总览与执行约定.md`。
2. **规范基准**：`AI_DEVELOPMENT_GUIDE.md`（命名、无分号、单引号、2 空格、组件 `<script setup lang="ts">`、Pinia setup store、API 模块化、Zod schema 前后端共享、迁移命名 `YYYYMMDD_NNNNNN_描述.ts` 等）。
3. **编码**：所有源文件 UTF-8 无 BOM（见 `AI_DEVELOPMENT_GUIDE.md` 3.4）。乱码症状见下文第二步 A。
4. **验证脚本**（根 `package.json`）：`format` / `typecheck` / `lint` / `test`。后端 `server/` 另有 `typecheck`、`test`，且根 `format` 不覆盖 `server/`，需单独格式化（见第三步）。
5. **每个里程碑文件结尾有 `Definition of Done`**，是该阶段验收清单，逐条勾选。
6. **一次只推进一个里程碑**，不跨阶段批量写代码。即便 M2/M3 标注可并行，单线程执行仍按编号逐个完成。
7. 所有命令在仓库根目录执行（PowerShell 环境）。

---

## 工作流：三步循环（对每个里程碑重复）

进入一个里程碑前，先读 `plan/00-总览与执行约定.md` 与 `plan/<当前里程碑>.md` 全文。

### 第一步：读文档并执行当前里程碑

- 读当前里程碑 md 全文，理解目标、步骤、新增/修改文件清单、关键代码骨架。
- 按文档内"步骤 1 → 步骤 N"顺序实现：
  - 新建/修改文件（严格按清单，不擅自增删）。
  - 写数据库迁移（命名遵循约定，放 `server/migrations/`）。
  - 写模型、中间件、路由、service、控制器、前端页面/API/store。
  - 同步推进该里程碑的 `Definition of Done` 清单。
- 本里程碑代码写完即进入第二步（不急着跑脚本，先自检）。
- **修改现有文件前必须先读该文件**（遵循 `AI_DEVELOPMENT_GUIDE.md` 14.1 的"先读后改、最小修改"原则）。

### 第二步：代码质量自检与优化

逐条检查本里程碑**改动过的所有文件**，发现问题立即优化，优化后重新自检，直至无遗留：

#### A. 乱码检查
- 通读改动文件中的中文文本，确认无 mojibake（GBK/UTF-8 误解码产生的乱码，常见形如 `æ±‰å­—`、`ä¸­ç­`、`å‡º`、`äºº`、`å­—`、`ÖÐ`、`ֵ`）。
- 辅助筛查命令（ripgrep，在仓库根执行；命中须逐个定位并修复——以 UTF-8 无 BOM 重新保存）：
  ```powershell
  rg -n "Ã¦|Ã§|Ã¨|Ã©|ä¸­|äºº|å­|æ±‰|ÖÐ" --glob "*.{ts,vue,js,json,md}" src server plan
  ```
- 检查是否误存为非 UTF-8：可读文件首字节看是否有 BOM（`EF BB BF`），有则去除。

#### B. 逻辑冗余检查（"逻辑绕来绕去"）
- 是否存在过度嵌套（>3 层 if/for）、重复代码块、无意义中间变量 → 重构简化。
- 是否存在绕来绕去的条件分支或为赶进度写的 `any` 滥用 → 收紧类型与控制流。
- 是否有未使用的导入/变量（`tsconfig.json` 的 `noUnusedLocals`/`noUnusedParameters` 会抓，先自查）。

#### C. 规范合规检查
- 对照 `AI_DEVELOPMENT_GUIDE.md`：
  - 组件 `<script setup lang="ts">`、Props 用 TS 接口 + `withDefaults`、Emits 用重载语法。
  - Pinia 用 Setup Store 风格；Store 实例放 `stores/pinia.ts`。
  - API 模块每业务一文件，对象字面量组织，返回 `ApiResponse<T>`。
  - Zod schema 放 `server/shared/schemas/`，前端从后端推断类型。
  - 迁移命名 `YYYYMMDD_NNNNNN_描述.ts`，用 `query`/`addColumn`/`addIndex`，不用 sync。
  - 新增菜单须同步 `src/i18n/zh-CN`、`en-US` 的 `sidebar.*` Key（见 9.5 节）。
  - 无分号、单引号、2 空格缩进（最终由 Prettier 兜底，但先自查明显违规）。

> 第二步全部通过后进入第三步。

### 第三步：运行验证脚本并修复

严格按顺序执行，**前一个通过再执行下一个**；任一命令失败 → 读错误输出 → 定位修复 → 重跑该命令 → 通过后再继续：

```powershell
# 前端四步（根 package.json）
npm run format        # 1) Prettier 格式化（仅 src/）
npm run typecheck     # 2) vue-tsc 类型检查（前端）
npm run lint          # 3) ESLint --fix（全项目）
npm run test          # 4) Vitest 单元测试（前端）
```

当本里程碑改动**包含 `server/`** 时，追加后端验证（根 `format` 不覆盖 `server/`，故后端单独格式化）：

```powershell
# 后端补充
npm --prefix server run typecheck          # 5) tsc --noEmit（后端类型）
npm --prefix server run test               # 6) vitest run（后端单测）
npx prettier --write "server/**/*.ts"      # 7) 后端格式化
```

当本里程碑**含数据库迁移**时：

```powershell
npm run migrate:status                     # 确认新迁移已 executed
```

**修复原则**：
- 报错先读完整错误信息，定位到具体文件/行号再改，不要盲目改动。
- 类型错误优先补全/收窄类型，而非用 `any` 绕过（`@typescript-eslint/no-explicit-any` 会 warn）。
- 测试失败优先修正实现或测试本身，不删测试跳过问题。
- 同一命令反复失败：回到第二步重新审视改动是否引入了结构性问题。

---

## 阶段完成判定

一个里程碑算完成，需同时满足：

- **第一步**：里程碑内所有步骤已实现，`Definition of Done` 全部勾选。
- **第二步**：乱码 / 逻辑冗余 / 规范自检无遗留。
- **第三步**：`format` → `typecheck` → `lint` → `test`（含 `server/` 改动时的后端 `typecheck` + `test` + prettier，含迁移时的 `migrate:status`）全部通过，无报错。

三步均满足 → 标记该里程碑完成，输出本阶段**改动清单 + 验证结果**小结 → 进入下一个里程碑，重复三步循环。

---

## 注意事项

- **不跳阶段**：按编号顺序逐个完成，不要先看 M5 就跳去做 M5。
- **失败不放过**：第三步任一命令报错必须修复到通过，禁止"先跳过后面再补"。
- **引入新依赖**：仅当里程碑文档显式列出（如 `bullmq`、`@aws-sdk/client-s3`、`openid-client`、`ali-oss`）才安装，并同步更新 `README.md` 技术栈表与 `AI_DEVELOPMENT_GUIDE.md` 技术栈详解。
- **安全红线**：不写真实密码 / JWT secret；多租户查询拿不到 `tenantId` 时兜底 `where id=-1`（见 `plan/02-M1`）。
- **范围控制**：只改当前里程碑涉及的文件，不夹带无关重构。
- **Windows 环境**：PowerShell 不支持 `&&`，命令分步执行或用 `;` / `if ($?) {}` 串联；`server` 验证优先用 `npm --prefix server run ...` 避免切目录。
