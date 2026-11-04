/**
 * 商城后台模型统一导出
 *
 * 模型均含 tenantId 属性，租户隔离由全局钩子
 * （server/modules/tenant/hooks/sequelizeTenantScope.ts）自动注入。
 */
export { default as ShopCategory } from './ShopCategory.js'
export { default as ShopBrand } from './ShopBrand.js'
export { default as ShopAttribute } from './ShopAttribute.js'
export { default as ShopSpu } from './ShopSpu.js'
export { default as ShopSku } from './ShopSku.js'
export { default as ShopRateSnapshot } from './ShopRateSnapshot.js'
export { default as ShopProductPrice } from './ShopProductPrice.js'
