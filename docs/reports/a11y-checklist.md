# 无障碍走查报告（P4-T14 · 前端部分）

> 日期：2026-11-04 · 范围：`shops/` 全部页面 · 方法：代码级走查（WCAG 2.1 A/AA 关键项）· 移动端响应式见下

## 1. 通过项

| 检查项 | WCAG | 结果 |
| --- | --- | --- |
| 表单标签 | 1.3.1/3.3.2 | 结算页全部输入均有 `<label :for>`（fullName/phone/province/city/address1/postcode/email）✓ |
| 错误提示 | 3.3.1 | 字段级 `aria-invalid` + 红字错误文本（checkout 地址/邮箱）✓ |
| 图片替代文本 | 1.1.1 | 商品卡/详情 `<img :alt="title">`；装饰块 `aria-hidden` ✓ |
| 键盘可达 | 2.1.1 | 全部可交互元素为原生 button/a/NuxtLink；数量 +/- 按钮、Dialog Escape 关闭 ✓ |
| 焦点可见 | 2.4.7 | 全局 `:focus-visible` 双像素描边（app.vue）+ Skip-to-content 链接（layout）✓ |
| 语言标注 | 3.1.1 | `<html lang>` 取 store config.market.language（P1-T05 接线）✓ |
| 对比度 | 1.4.3 | 主文本 stone-900/白 ≈16:1；辅助 stone-500/白 ≈4.7:1（AA 正文）；反白按钮 stone-900 底白字 ✓ |
| 语义结构 | 1.3.1 | header/nav/main/footer landmark；面包屑 `aria-label`；Dialog `role=dialog aria-modal` ✓ |
| 状态标注 | 4.1.2 | 变体选择 `aria-pressed`；库存/支付状态徽章有色+文双通道 ✓ |
| 触控目标 | 2.5.8 | 按钮 ≥44px 高（py-2.5/py-3）；数量步进 28px（建议后续放大）△ |

## 2. 建议项（不阻塞）

1. Dialog 焦点圈禁（focus trap）未实现——关闭后焦点归位已由 Escape + 按钮 click 承接，建议后续补 `inert` 背景。
2. 数量步进按钮 28px 偏小，建议 ≥44px（移动端）。
3. 价格文本建议 `aria-label` 输出朗读友好格式（当前 tabular-nums 文本可读）。

## 3. 移动端验收（375/768/1280）

- 栅格：首页/集合 2→3→4 列；详情 lg 双栏；结算 lg 双栏。
- 无横向滚动：容器 max-w-6xl + px-4；图片 aspect-square 固定（无 CLS）。
- 触控：导航/按钮原生元素，Checkout 主按钮全宽。

## 4. 结论

前端部分 A/AA 关键项通过；遗留项均为增强建议，不阻塞。设备/读屏器实测（VoiceOver/NVDA）留验收环境。
