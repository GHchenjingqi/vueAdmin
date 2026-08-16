# MySQL 排障参考

## 启动链路

```
server/.env
  → ensureDatabaseExists()   # 无库名连接 + CREATE DATABASE (query)
  → sequelize.authenticate()
  → migrator.up()            # server/migrations/*.ts
  → seeder.up() if users=0   # server/seeders/*.ts
  → HTTPS listen SERVER_PORT
```

## 已修复的历史坑

| 问题 | 原因 | 现状 |
|------|------|------|
| 自动建库“失败可忽略”后迁移仍挂 | 旧逻辑用 `execute(CREATE DATABASE)`，且建库后未强制重连 | 改为 `query` + 启动/CLI 统一 `ensureDatabaseExists` |
| Docker 挂载 init.sql 不存在 | compose 引用 `./server/init.sql` 但文件缺失 | 已补 `server/init.sql` |
| Docker `MYSQL_USER=root` | 官方镜像禁止 | compose 默认 `vue_admin` |
| admin 密码永远不对 | seeder 里假 bcrypt 字符串 | seeder 运行时 `bcrypt.hash('123456')` |
| Windows migrate 成功但无表 | Umzug 反斜杠绝对路径 glob 匹配 0 文件 | `migrator.ts` 路径 `/` 归一化 |
| 根目录 `tsx` 找不到 | Windows PATH/`cd server && tsx` | 根脚本 `npm --prefix server run migrate*` |

## 命令速查

```bash
npm run install:all
npm run dev
npm run migrate
npm run migrate:seed
npm run migrate:status
npm run migrate:down
npm run migrate:reset   # 危险：清空后重建
```

## Windows MySQL 常用

```powershell
Get-Service *mysql*
Start-Service MySQL80   # 服务名以本机为准
# CLI 示例
& "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe" --host=127.0.0.1 --port=3306 -uroot -p
```

## 权限

自动建库需要账号具备 `CREATE`。开发推荐 root；生产用最小权限并预先建库。

## Docker 注意

- init 脚本只在 **空数据卷** 首次启动执行  
- 改 `init.sql` 后不生效：`docker compose down -v` 再 `up`（丢数据）  
- 业务表不要只写在 init.sql；以 Umzug 为准  

## 空库排查口诀

1. 先 `ping` / `SELECT 1`  
2. `SHOW DATABASES` 看库是否存在  
3. `SHOW TABLES`：若只有 `sequelizemeta`/`seedermeta` → 多半是 Windows glob  
4. `SELECT * FROM SequelizeMeta`：executed 很多但无表 → 历史错误成功记录，需清库重跑  
5. `SELECT username,password FROM users`：假哈希以 `$2a$10$6Z3Kz6n...` 为特征  

## tsx / esbuild 异常兜底

若 `tsx` 报 `TransformError: The service was stopped`：

```powershell
Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'esbuild' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
cd server
node .\node_modules\typescript\lib\tsc.js -p tsconfig.json
node dist/app.js
```

注意：`tsc` 可能因测试文件类型错误非 0 退出，但仍可能生成 `dist/app.js`。
