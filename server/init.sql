-- Docker MySQL 首次初始化脚本（仅在数据卷为空时执行一次）
-- 数据库本体由 MYSQL_DATABASE 创建；此处保证字符集。
-- 修改本文件后若数据卷已存在，不会再次执行；需 docker compose down -v 后重建。

ALTER DATABASE `vue_admin` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 应用表结构与种子数据由后端 Umzug 迁移负责：
--   npm run migrate
--   npm run migrate:seed
-- 或直接 npm run dev（bootstrap 自动迁移 + 空库时写入种子）