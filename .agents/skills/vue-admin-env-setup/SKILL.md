---
name: vue-admin-env-setup
description: Bootstrap and repair the vue-admin local/dev environment for this repo (Vue 3 + Express + MySQL + Umzug). Use when the user reclones the project, MySQL auto-create fails, migrations/seeders fail, Docker MySQL will not start, or they ask how to reinstall dependencies and start npm run dev.
---

# vue-admin 环境启动

## Overview

本 skill 是 **本仓库内置** 的本地环境搭建与 MySQL 初始化排障指南（路径：`.agents/skills/vue-admin-env-setup/`）。默认本机 MySQL；Docker 仅作可选基础设施。

实测验证（2026-07）：在隔离库 `vue_admin_skill_test`、端口 `3307`、服务端口 `5180` 上完成依赖安装、自动/手动建库、16 个 migration、seed、`admin/123456` 登录哈希与 `/health`、`/api/v1/auth/captcha` 健康检查。

## 何时使用

- 重新 clone / 换机器后无法启动
- 自动创建数据库失败
- 建库成功但建表 / 种子导入失败
- Docker MySQL 起不来或空库无表
- 需要一份可重复的启动检查清单

## 关键事实（先读）

- 后端 env：**`server/.env`**（模板 `server/.env.example`）
- 自动建库：`server/utils/ensureDatabase.ts` → `CREATE DATABASE IF NOT EXISTS`（**必须用 `query`，不能用 `execute`**）
- 启动链路：`server/bootstrap.ts` → ensure DB → authenticate → Umzug migrate → 空用户表则 seed
- 手动迁移：`npm run migrate` / `migrate:seed` / `migrate:status` / `migrate:reset`
- 默认管理员：`admin` / `123456`
- API 前缀：**`/api/v1`**（例如 `/api/v1/auth/captcha`）
- 健康检查：`/health`
- Docker：`MYSQL_USER` **禁止 root**；compose 默认业务用户 `vue_admin`；`server/init.sql` 仅数据卷首次初始化执行

### Windows 必知坑（2026-07 实测）

| 症状 | 根因 | 修复 |
|------|------|------|
| `npm run migrate*` 报找不到 `tsx` | 根目录 `cd server && tsx` 未走 server 的 `node_modules/.bin` | 根脚本改为 `npm --prefix server run migrate*`，在 `server/package.json` 定义 `tsx scripts/migrate.ts ...` |
| migrate 显示成功但只有 `SequelizeMeta`，无业务表 | Umzug 在 Windows 上对**反斜杠绝对路径 glob** 匹配失败，pending=0 | `server/utils/migrator.ts` 对 glob 做 `.replace(/\\/g, '/')` |
| 自动建库“失败可忽略”，随后 Unknown database | 旧逻辑 `execute(CREATE DATABASE)` + 建库后未强制重连 | 使用 `ensureDatabaseExists()`（`query` + 启动/CLI 统一调用） |
| 能进系统但 admin 密码不对 | seeder 里假 bcrypt 字符串 | `server/seeders/20260707_000001_admin_user.ts` 运行时 `bcrypt.hash('123456')` |
| 本机 `tsx`/`esbuild` 报 `The service was stopped` | 部分 Windows 环境 esbuild service 异常 | 兜底：`cd server && npx tsc -p tsconfig.json` 后 `node dist/app.js`；或排查杀软/残留 esbuild 进程 |

## 标准启动流程

按顺序执行，不要跳步。

### 1) 依赖

```bash
npm run install:all
```

### 2) 环境变量

```powershell
if (!(Test-Path server/.env)) {
  if (Test-Path server/.env.example) { Copy-Item server/.env.example server/.env }
  else {
    @"
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=vue_admin
DB_USER=root
DB_PASSWORD=root
SERVER_PORT=5173
JWT_SECRET=vue_admin_secret_key_2024
CAPTCHA_ENABLED=true
REDIS_ENABLED=false
"@ | Set-Content server/.env -Encoding UTF8
  }
}
```

至少确认：

```ini
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=vue_admin
DB_USER=root
DB_PASSWORD=<本机 MySQL 真实密码>
SERVER_PORT=5173
JWT_SECRET=vue_admin_secret_key_2024
```

隔离测试时请换库名/端口，例如 `DB_NAME=vue_admin_skill_test`、`DB_PORT=3307`、`SERVER_PORT=5180`。**不要覆盖同事或本机正在使用的开发库。**

### 3) MySQL 可用性

```powershell
Get-Service *mysql*
# 或 CLI（路径按本机安装调整）
# & "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysqladmin.exe" --host=127.0.0.1 --port=3306 --user=root --password=xxx ping
```

若服务未启动：先启动 MySQL，再继续。

### 4) 一键启动（推荐）

```bash
npm run dev
```

期望日志包含：

- 数据库 `...` 已就绪
- 数据库连接成功
- 发现 N 个待执行迁移 / 或已是最新版本
- 种子数据写入完成（仅空库）
- Vue Admin 服务启动成功 → `https://localhost:<SERVER_PORT>`

### 5) 若启动失败：手动建库 + 迁移

```sql
CREATE DATABASE IF NOT EXISTS vue_admin
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

```bash
npm run migrate:status
npm run migrate
npm run migrate:seed
npm run dev
```

期望 `migrate:status` 显示 **executed > 0**，且库中有 `users` 等业务表，而不是只有 meta 表。

## 决策树

1. **连不上 MySQL** → 服务/端口/密码/`DB_HOST`；不要先改业务代码
2. **Unknown database** → 走 ensure（重跑 dev 或 migrate CLI）；仍失败则手动 `CREATE DATABASE`
3. **表不存在 / 迁移中断** → `migrate:status` 看 pending；若 pending=0 但无业务表，先查 Umzug Windows glob 修复
4. **能进系统但 admin 登录失败** → 种子未写或假哈希；空库 `migrate:seed`；可接受清库时 `migrate:reset`
5. **Docker MySQL 起不来** → 检查 `MYSQL_USER!=root`、`server/init.sql` 存在；数据卷脏了用 `docker compose down -v`（丢容器数据）
6. **tsx The service was stopped** → 杀残留 esbuild；或 `tsc` 编译后 `node dist/app.js` 兜底启动

## 助手执行约定

使用本 skill 时：

1. 先读 `server/.env`、`server/bootstrap.ts`、`server/utils/ensureDatabase.ts`、`server/utils/migrator.ts`、最近 `server/logs/app-*.log`
2. 用终端验证 MySQL 服务与端口，而不是只猜
3. 优先修复配置与迁移，不重写 ORM
4. 改完后用 `npm run migrate:status` 或一次 `npm run dev` 验证
5. 不要提交真实密码；文档示例用占位符
6. 验证时尽量隔离库名/端口，避免覆盖现有开发库

## 可选 Docker 基础设施

仅 MySQL + Redis：

```bash
docker compose up -d mysql redis
```

此时 `server/.env` 建议：

```ini
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=vue_admin
DB_USER=vue_admin
DB_PASSWORD=<与 compose DB_PASSWORD 一致>
```

全栈 compose 需要根目录 `.env` 提供 `JWT_SECRET`。

## 验证清单

- [ ] `server/.env` 存在且密码正确
- [ ] MySQL 服务 Running / 可 ping
- [ ] `server/utils/migrator.ts` glob 已做 Windows 斜杠归一化
- [ ] 根 `package.json` migrate 脚本走 `npm --prefix server run ...`
- [ ] `npm run migrate:status` executed>0，或 dev 日志迁移完成
- [ ] `SHOW TABLES` 含 `users`（不只 `SequelizeMeta`）
- [ ] admin 密码哈希可用（`bcrypt.compare('123456', hash)`）
- [ ] `https://localhost:<PORT>/health` 返回 ok
- [ ] `https://localhost:<PORT>/api/v1/auth/captcha` 返回 200

## 快速自检脚本

在仓库根目录：

```bash
node .agents/skills/vue-admin-env-setup/scripts/check-env.mjs
```

排障细节见 [references/mysql-troubleshoot.md](references/mysql-troubleshoot.md)。

相关文档：

- [README.md](../../../README.md) → 「快速安装」「MySQL 环境配置」
- [AI_DEVELOPMENT_GUIDE.md](../../../AI_DEVELOPMENT_GUIDE.md) → 「本地环境搭建」
- [`.ai-knowledge/project-specs/09-本地环境搭建.md`](../../../.ai-knowledge/project-specs/09-本地环境搭建.md)
