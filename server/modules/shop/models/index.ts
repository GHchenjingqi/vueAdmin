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
