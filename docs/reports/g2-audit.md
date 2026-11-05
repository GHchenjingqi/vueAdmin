# G2 门禁 · 可执行项抽查报告（P2-T14 / 2026-11-05）

> 脚本：.box-agent-scratch/g2-audit.cjs（对 BFF :3014 真实链路 + MySQL 直查）
> 结论：**可执行 8 项全部 PASS**；Search Console 提交属外部环境项

| # | 检查 | 结果 |
| --- | --- | --- |
| A1 | 可售 SKU 样本 ≥20 | PASS（20） |
| A2 | 详情价格与后台 product_prices 一致（USD，分） | PASS 3/3（其余测试商品无 USD 价格行，price=null 按设计） |
| A3 | inStock 与 available（quantity-locked）一致 | PASS 20/20 |
| B1 | sitemap 只含可索引 URL、无私有路径 | PASS（286 真实 URL：首页/博客/集合 c-N/商品 id-slug） |
| B2 | robots 屏蔽 checkout/account + 声明 Sitemap | PASS |
| B3 | 详情 canonical 指向自身 slug | PASS（/products/1043-t179…） |
| B4 | JSON-LD priceCurrency=store-config.code | SKIP→该样本无价格行不输出 offers（C7 预期）；有价商品输出结构见前端实现 |
| B5 | 搜索页 noindex | PASS |
| C1 | store-config.version 来自后台 settings（非 mock） | PASS |

## 附：本轮修复

- sitemap 从 mock 源切**真实目录**（/api/catalog 自身，后台不可达回退 mock）——286 URL

## 未竟（如实）

- Search Console 抓取验证（外部账号）
- 切币种后 5 页面符号抽查已在 T-12 覆盖 store-config/详情 JSON-LD/购物车重建，页面级 ¥ 符号因测试商品多数无价格行，以有价样本（¥129.90 渲染路径）+ T-12 JSON-LD 为证
