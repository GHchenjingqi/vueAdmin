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

# 复制前端源码
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

# 复制后端源码
COPY server/tsconfig.json ./
COPY server/swagger.ts ./
COPY server/app.ts ./
COPY server/bootstrap.ts ./
COPY server/config/ ./config/
COPY server/controllers/ ./controllers/
COPY server/middleware/ ./middleware/
COPY server/models/ ./models/
COPY server/routes/ ./routes/
COPY server/shared/ ./shared/
COPY server/types/ ./types/
COPY server/utils/ ./utils/
COPY server/validators/ ./validators/

# 构建后端
RUN npm run build

# -------------------- 阶段 3: 生产运行镜像 --------------------
FROM node:20-alpine AS production

# 设置时区
RUN apk add --no-cache tzdata && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone

WORKDIR /app

# 创建非 root 用户
RUN addgroup -g 1001 appgroup && \
    adduser -u 1001 -G appgroup -s /bin/sh -D appuser

# 复制前端构建产物
COPY --from=frontend-builder /app/dist /app/dist

# 复制后端构建产物和依赖
COPY --from=server-builder /app/server/dist /app/server/dist
COPY --from=server-builder /app/server/node_modules /app/server/node_modules
COPY --from=server-builder /app/server/package.json /app/server/package.json
COPY --from=server-builder /app/server/tsx /app/server/node_modules/.bin/tsx

# 复制迁移脚本和种子数据（运行时执行）
COPY server/migrations/ /app/server/migrations/
COPY server/seeders/ /app/server/seeders/
COPY server/scripts/ /app/server/scripts/
COPY server/utils/migrator.ts /app/server/dist/utils/migrator.js

# 复制前端 index.html（后端需要代理）
COPY index.html /app/dist/

# 复制环境变量模板
COPY .env.example /app/.env.example

# 创建上传目录
RUN mkdir -p /app/server/uploads && \
    mkdir -p /app/server/logs

# 修改所有者
RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:3000/health || exit 1

# 启动前执行数据库迁移，然后启动应用
CMD ["sh", "-c", "cd server && node dist/scripts/migrate.js up && node dist/app.js"]