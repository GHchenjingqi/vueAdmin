# 实测证据 · 现有后台基线（2026-11-04）

> 采集方式：对运行中系统 `https://localhost:5173` 实测（curl -k）；数据库：`npm --prefix server run migrate:status`

## 1. 数据库与迁移

```
> npm --prefix server run migrate:status
数据库 vue_admin 已就绪（utf8mb4 / utf8mb4_unicode_ci）
📊 迁移状态: 已执行 70, 待执行 0
```

## 2. 接口实测（节选）

| 时间(UTC) | 请求 | 结果 |
| --- | --- | --- |
| 06:55:02 | GET /health | `{"status":"ok","uptime":943.59}` |
| 06:55:02 | GET /api/storefront/v1/health | `{"code":0,"data":{"ok":true,"service":"storefront"}}` |
| 06:55:03 | GET /api/storefront/v1/products?pageSize=3 | total=35；返回 `currency:"USD"`（默认值，query/站点默认驱动）；商品 price=null（无价格行） |
| 06:55:07 | GET /api/v1/shop/health | `{"code":0,"data":{"ok":true,"service":"shop"}}` |
| 06:55:07 | GET /api/storefront/v1/categories | 返回类目树（多语言 name JSON） |
| 06:55:07 | GET /api/storefront/v1/store-config | **无响应（404）→ Store Config 服务缺口确认** |

## 3. 审计结论引用

- 币种配置不存在全局设置键（BACKEND_AUDIT §2）→ `store-config` 404 佐证。
- 金额列 DECIMAL(12,2)（迁移 20261104_000023/000008/000031 源码）→ 精度整改口径（审计 §7 T-8）。
- `settings` 表 key-value 机制可用（settingService.getSettingByKey/saveSettings/refreshSiteInfo）→ Store Config 落点可行。
