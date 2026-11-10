/**
 * 商城后台模型统一导出
 *
 * 模型均含 tenantId 属性，租户隔离由 service 层显式注入 tenantId 实现
 * （全局 Sequelize 钩子 options.model 为 undefined，无法可靠注入，见阶段 1 复盘）。
 */
export { default as ShopCategory } from './ShopCategory.js'
export { default as ShopBrand } from './ShopBrand.js'
export { default as ShopAttribute } from './ShopAttribute.js'
export { default as ShopSpu } from './ShopSpu.js'
export { default as ShopSku } from './ShopSku.js'
export { default as ShopRateSnapshot } from './ShopRateSnapshot.js'
export { default as ShopProductPrice } from './ShopProductPrice.js'

// 阶段 2：渠道 / 店铺 / 渠道商品
export { default as ShopChannel } from './ShopChannel.js'
export { default as ShopShop } from './ShopShop.js'
export { default as ShopChannelProduct } from './ShopChannelProduct.js'

// 阶段 3：库存中心 / 订单履约
export { default as ShopWarehouse } from './ShopWarehouse.js'
export { default as ShopInventory } from './ShopInventory.js'
export { default as ShopInventoryLog } from './ShopInventoryLog.js'
export { default as ShopOrder } from './ShopOrder.js'
export { default as ShopOrderItem } from './ShopOrderItem.js'
export { default as ShopOrderShipment } from './ShopOrderShipment.js'

// 阶段 4：营销中心 / 数据参谋
export { default as ShopPromotion } from './ShopPromotion.js'
export { default as ShopCoupon } from './ShopCoupon.js'
export { default as ShopBundle } from './ShopBundle.js'

// 阶段 5 步骤 3：C 端顾客（与 admin users 隔离，独立 JWT）
export { default as ShopCustomer } from './ShopCustomer.js'
export { default as ShopCustomerAddress } from './ShopCustomerAddress.js'

// 阶段 5 步骤 4：购物车 / 库存预占 / 支付单据（复用 shop 模型层，不建第二套后端）
export { default as ShopCart } from './ShopCart.js'
export { default as ShopCartItem } from './ShopCartItem.js'
export { default as ShopInventoryReservation } from './ShopInventoryReservation.js'
export { default as ShopOrderPayment } from './ShopOrderPayment.js'

// 阶段 5 步骤 5：邮件订阅 + 到货提醒（复用 shop 模型层，不建第二套后端）
export { default as ShopNewsletter } from './ShopNewsletter.js'
export { default as ShopRestockSubscription } from './ShopRestockSubscription.js'

// 阶段 5 步骤 5（第二切片）：商品评价 + 问答（复用 shop 模型层，不建第二套后端）
export { default as ShopReview } from './ShopReview.js'
export { default as ShopProductQA } from './ShopProductQA.js'

// 阶段 5 步骤 5（第三切片）：内容管理（博客/内容页，复用 shop 模型层，不建第二套后端）
export { default as ShopArticle } from './ShopArticle.js'

// 阶段 5 步骤 5（第四切片）：退货/售后（复用 shop 模型层，不建第二套后端）
export { default as ShopRmaRequest } from './ShopRmaRequest.js'

// 阶段 5 步骤 5（第五切片）：物流轨迹缓存（复用 shop 模型层，不建第二套后端）
export { default as ShopTrackingEvent } from './ShopTrackingEvent.js'

// 阶段 5 步骤 6：服务端 CAPI 埋点事件（复用 shop 模型层，不建第二套后端）
export { default as ShopAnalyticsEvent } from './ShopAnalyticsEvent.js'

// T-07 优惠券占用流水（复用 shop 模型层，不建第二套后端）
export { default as ShopCouponRedemption } from './ShopCouponRedemption.js'

// T-09 订单退款流水（复用 shop 模型层，不建第二套后端）
export { default as ShopOrderRefund } from './ShopOrderRefund.js'
// P3-T06 税率规则表
export { default as ShopTaxRate } from './ShopTaxRate.js'

// P3-T17 订单邮件 outbox（确认 / 发货 / 退款）
export { default as ShopOrderEmail } from './ShopOrderEmail.js'
export { default as ShopReferralCommission } from './ShopReferralCommission.js'

// X-T03 审计日志（订单/支付/库存/退款状态变更留痕；币种配置审计在 config_changes）
export { default as AuditLog } from './AuditLog.js'

// 支付网关凭据加密存储（替代纯环境变量；DB 主、env 兜底）
export { default as ShopPaymentCredential } from './ShopPaymentCredential.js'
