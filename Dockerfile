# ============================================
# 多阶段构建 Dockerfile
# 阶段 1: 构建前端
# 阶段 2: 构建后端
# 阶段 3: 生产运行镜像
# ============================================

# -------------------- 阶段 1: 前端构建 --------------------
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# 安装前端依赖
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# 复制前端源码与构建配置
COPY index.html ./
COPY vite.config.ts ./
COPY tsconfig.json ./
COPY auto-imports.d.ts ./
COPY components.d.ts ./
COPY src/ ./src/

# 构建前端
RUN npm run build

# -------------------- 阶段 2: 后端构建 --------------------
FROM node:20-alpine AS server-builder

WORKDIR /app/server

# 安装后端依赖
COPY server/package.json server/package-lock.json ./
RUN npm ci --ignore-scripts

# 复制后端源码（含 services / migrations / seeders / scripts）
COPY server/tsconfig.json ./
COPY server/swagger.ts ./
COPY server/app.ts ./
COPY server/bootstrap.ts ./
COPY server/config/ ./config/
COPY server/controllers/ ./controllers/
COPY server/middleware/ ./middleware/
COPY server/models/ ./models/
COPY server/routes/ ./routes/
COPY server/services/ ./services/
COPY server/shared/ ./shared/
COPY server/types/ ./types/
COPY server/utils/ ./utils/
COPY server/validators/ ./validators/
COPY server/migrations/ ./migrations/
COPY server/seeders/ ./seeders/
COPY server/scripts/ ./scripts/

# 构建后端（输出 dist，含 services 与 migrations 编译产物）
RUN npm run build

# -------------------- 阶段 3: 生产运行镜像 --------------------
FROM node:20-alpine AS production

# 设置时区与健康检查工具
RUN apk add --no-cache tzdata wget &&     cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime &&     echo "Asia/Shanghai" > /etc/timezone

WORKDIR /app

# 创建非 root 用户
RUN addgroup -g 1001 appgroup &&     adduser -u 1001 -G appgroup -s /bin/sh -D appuser

# 复制前端构建产物
COPY --from=frontend-builder /app/dist /app/dist

# 复制后端构建产物和依赖
COPY --from=server-builder /app/server/dist /app/server/dist
COPY --from=server-builder /app/server/node_modules /app/server/node_modules
COPY --from=server-builder /app/server/package.json /app/server/package.json

# 运行时迁移/种子源文件（供运维排查；运行时以 dist 编译结果为准）
COPY server/migrations/ /app/server/migrations/
COPY server/seeders/ /app/server/seeders/

# 环境变量模板
COPY .env.example /app/.env.example

# 创建上传与日志目录
RUN mkdir -p /app/server/uploads /app/server/logs &&     chown -R appuser:appgroup /app

USER appuser

EXPOSE 3000

# 健康检查（兼容 HTTP / 自签名 HTTPS）
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3     CMD wget -qO- http://127.0.0.1:3000/health || wget -qO- https://127.0.0.1:3000/health --no-check-certificate || exit 1

# bootstrap 启动时会执行待处理迁移
WORKDIR /app/server
CMD ["node", "dist/app.js"]
