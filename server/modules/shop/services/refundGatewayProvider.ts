import { setRefundProvider } from './refundService.js'
import { ShopOrderPayment } from '../models/index.js'
import { getGateway } from '../../storefront/payments/gatewayRegistry.js'
import { logInfo } from '../../../utils/fileLogger.js'

/**
 * 生产退款通道注入：把「默认本地记账直成功」替换为按原支付通道调真实网关退款。
 *
 * - 按 orderNo 找到最近一笔已捕获的支付记录，确定 provider / 网关单号；
 * - 真实网关走适配器 refund（本地 refundNo 作为网关侧幂等键，死锁重试不会二次退款）；
 * - mock / 无适配器 / 查不到支付记录时返回 undefined，沿用既有本地记账语义，
 *   保证沙箱与历史订单不回归。
 */
export function installRefundGatewayProvider(): void {
  setRefundProvider(async (ctx) => {
    const payment = await ShopOrderPayment.findOne({
      where: { orderNo: ctx.orderNo, status: 'captured' },
      order: [['id', 'DESC']],
    })
    const gateway = payment ? getGateway(payment.provider) : undefined
    if (!gateway?.refund) return
    return gateway.refund({
      ...ctx,
      gatewayRef: payment?.gatewayRef ?? payment?.gatewayOrderNo ?? undefined,
      originalAmountCents: payment ? Number(payment.amountCents) : undefined,
      config: {},
    })
  })
  logInfo('退款通道注入完成：真实订单按原支付网关原路退款')
}
