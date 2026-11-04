# PRODUCT_DATA_MODEL.md · 商品属性字典与数据模型（P0-T02）

> 生成：2026-11-04 · 首发：假发优先、服装并行 · 模型基础：`shop_spus / shop_skus / shop_attributes`（已有，见 BACKEND_AUDIT §1）

## 1. 属性字典（首发品类）

每个属性标注：**决定SKU / 仅展示 / 可筛选**（三选一，后台属性 `usage` 扩展列落点，见 BACKEND_AUDIT §7 T-1）。

### 1.1 假发（Wigs）属性组

| 属性 | code | 类型 | 标注 | 取值示例 |
| --- | --- | --- | --- | --- |
| 发质 | hairMaterial | select | 决定SKU | human-hair / synthetic / blend |
| 纹理 | texture | select | 决定SKU | straight / body-wave / deep-wave / curly / kinky |
| Lace 类型 | laceType | select | 决定SKU | transparent / HD / full-lace / lace-front |
| 帽围 | capSize | select | 决定SKU | 21.5 / 22 / 22.5 / 23 / 23.5（英寸） |
| 长度 | length | select | 决定SKU | 10/12/14/16/18/20/22/24/26（英寸） |
| 颜色 | color | select | 决定SKU | natural-black / #1b / #613 / … |
| 密度 | density | select | 可筛选 | 150% / 180% / 200% |
| 是否 Glueless | glueless | select | 可筛选 | yes / no |
| 帽型结构 | capConstruction | select | 仅展示 | basic-cap / 360-lace / u-part |

### 1.2 服装（Apparel）属性组

| 属性 | code | 类型 | 标注 | 取值 |
| --- | --- | --- | --- | --- |
| 尺码体系 | sizeSystem | select | 决定SKU | US / EU / UK |
| 尺码 | size | select | 决定SKU | XS–3XL / 数字码 |
| 颜色 | color | select | 决定SKU | 同上 |
| 面料 | fabric | text | 仅展示 | 95% cotton 5% elastane |
| 版型 | fit | select | 可筛选 | slim / regular / relaxed / oversized |
| 测量值 | measurements | text | 仅展示 | 胸围/衣长（按尺码表） |
| 试穿信息 | tryOnInfo | text | 仅展示（可空但结构存在） | 模特身高 + 所穿尺码 |

## 2. 数据约束（落点：`shops/` 前端校验 + 后端 shared/schemas/shop.ts）

1. 「决定SKU」属性必须参与 `shop_skus.spec`（Record<string,string>），同一 SPU 内组合唯一（校验在 spuService/skuService，补充唯一性校验）。
2. 「可筛选」属性进入集合页筛选参数白名单（`SEO_SPEC.md` §5），来源=属性字典而非硬编码。
3. 假发与服装各成独立属性组（categoryId 绑定，互不混用）。
4. 多语言文本字段（name/description）沿用 `Record<string,string>`，键=BCP47（en-US/zh-CN）。

## 3. 与既有模型的衔接

| 计划概念 | 落点 | 说明 |
| --- | --- | --- |
| SPU/变体 | ShopSpu / ShopSku（已有） | spec Record 承载「决定SKU」属性 |
| 属性字典 | ShopAttribute（已有）+ usage 扩展列（迁移） | decide/display/filter 三态 |
| C 端详情页 | `/api/storefront/v1/products/:slug` | variants[].spec 返回参与变体的属性 |
| 品类模块（P2-T05/T06） | `shops/` 前端组件 | 属性来自字典 API，不硬编码 |
