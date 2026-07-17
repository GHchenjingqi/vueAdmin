# 贡献指南

感谢您有兴趣为 Vue Admin 项目做出贡献！请花几分钟阅读本文档。

## 开发环境

### 环境要求

- **Node.js**: 20+
- **MySQL**: 8.0+
- **Redis**: 7+
- **pnpm** (推荐) 或 npm

### 快速开始

```bash
# 安装依赖
npm run install:all

# 复制环境变量
cp .env.example .env.development

# 启动开发服务器
npm run dev
```

### 使用 Docker（可选）

```bash
# 启动数据库和 Redis
docker compose up -d db redis

# 启动开发服务器
npm run dev
```

## 分支策略

| 分支 | 用途 | 保护 |
|------|------|------|
| `main` | 生产分支，代码冻结 | ✅ |
| `dev` | 开发主分支 | ✅ |
| `feat/*` | 功能分支 | — |
| `fix/*` | 修复分支 | — |
| `refactor/*` | 重构分支 | — |

**工作流程**:
1. 从 `dev` 创建功能分支
2. 开发并编写测试
3. 提交 PR 到 `dev`
4. CI 全部通过后合并

## 提交规范

遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

| 类型 | 说明 |
|------|------|
| `feat:` | 新功能 |
| `fix:` | 错误修复 |
| `perf:` | 性能优化 |
| `refactor:` | 重构 |
| `test:` | 测试相关 |
| `docs:` | 文档更新 |
| `chore:` | 工程化/构建 |

**示例**:

```bash
git commit -m "feat(user): 添加用户导出功能"
git commit -m "fix(upload): 修复大文件上传失败问题"
git commit -m "perf(api): 优化请求缓存逻辑"
```

## 代码规范

### ESLint

```bash
# 检查代码规范
npm run lint

# 自动修复
npm run lint -- --fix
```

### 类型检查

```bash
npm run typecheck
```

### 测试

```bash
# 运行所有测试
npm test

# 监听模式
npm run test:watch

# 生成覆盖率报告
npm run test:coverage
```

**覆盖率要求**:
- 前端: ≥ 65%
- 后端: ≥ 55%

## API 文档

API 文档使用 Swagger/OpenAPI 规范。

开发时访问: `http://localhost:3000/api-docs`

## 性能基准测试

```bash
# 运行基准测试
npx vitest bench
```

## 版本发布

使用语义化版本和 git tag：

```bash
# 1. 更新版本号（自动生成 CHANGELOG）
npm run version:bump

# 2. 推送标签
git push origin --tags

# 3. GitHub Actions 自动创建 Release
```

## 目录结构

```
.
├── src/                    # 前端源码
│   ├── api/               # API 接口定义
│   ├── components/        # Vue 组件
│   ├── composables/       # 组合式函数
│   ├── stores/            # Pinia 状态管理
│   ├── utils/             # 工具函数
│   └── views/             # 页面视图
├── server/                 # 后端源码
│   ├── controllers/       # 控制器
│   ├── middleware/        # 中间件
│   ├── routes/            # 路由定义
│   ├── services/          # 业务逻辑
│   └── __tests__/         # 后端测试
├── e2e/                    # E2E 测试
└── .github/workflows/     # GitHub Actions
```

## 常见问题

### 依赖安装失败

```bash
rm -rf node_modules package-lock.json
npm install
```

### 数据库迁移失败

```bash
# 重置数据库
npm run migrate:reset

# 重新迁移
npm run migrate
```

### 测试失败

```bash
# 清除 Vitest 缓存
npx vitest --clearCache

# 重新运行测试
npm test
```

## 获取帮助

- 提交 [Issue](https://github.com/your-org/vue-admin/issues)
- 参与 [Discussion](https://github.com/your-org/vue-admin/discussions)
