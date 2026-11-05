// T-03 证据：同一事件重复投递 → 第二次 alreadyProcessed，订单/库存不再变更
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
const https = require('https')
const crypto = require('crypto')
require('D:/codes/web/server/node_modules/dotenv').config({ path: 'D:/codes/web/server/.env' })
;(async () => {
  const mysql = require('D:/codes/web/server/node_modules/mysql2/promise.js')
  const c = await mysql.createConnection({ host: process.env.DB_HOST, port: +process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME })
  const [[order]] = await c.query("SELECT orderNo, paymentStatus FROM orders WHERE status='paid' ORDER BY id DESC LIMIT 1")
  const [[pay]] = await c.query('SELECT providerRef FROM order_payments WHERE orderNo=? LIMIT 1', [order.orderNo])
  const [[resv]] = await c.query('SELECT COUNT(*) n FROM inventory_reservations WHERE ref=?', [order.orderNo])
  const invBefore = await c.query('SELECT skuId, quantity, locked FROM inventory WHERE skuId IN (SELECT skuId FROM order_items WHERE orderId=(SELECT id FROM orders WHERE orderNo=?))', [order.orderNo])
  await c.end()

  const rawBody = JSON.stringify({ providerRef: pay.providerRef, orderNo: order.orderNo, type: 'payment.succeeded', currency: 'USD' })
  const sig = crypto.createHmac('sha256', 'storefront_mock_webhook_secret').update(rawBody).digest('hex')
  function post() {
    return new Promise((resolve, reject) => {
      const req = https.request({ host: '127.0.0.1', port: 5173, path: '/api/storefront/v1/payments/webhooks/mock', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(rawBody), 'x-mock-signature': sig } }, (r) => {
        let b = ''
        r.on('data', (x) => (b += x))
        r.on('end', () => resolve({ status: r.statusCode, body: b }))
      })
      req.on('error', reject)
      req.end(rawBody)
    })
  }
  const r1 = await post()
  const r2 = await post()
  const c2 = await mysql.createConnection({ host: process.env.DB_HOST, port: +process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: process.env.DB_NAME })
  const [[order2]] = await c2.query('SELECT paymentStatus FROM orders WHERE orderNo=?', [order.orderNo])
  const [[resv2]] = await c2.query('SELECT COUNT(*) n FROM inventory_reservations WHERE ref=?', [order.orderNo])
  const invAfter = await c2.query('SELECT skuId, quantity, locked FROM inventory WHERE skuId IN (SELECT skuId FROM order_items WHERE orderId=(SELECT id FROM orders WHERE orderNo=?))', [order.orderNo])
  await c2.end()
  console.log('order:', order.orderNo, 'webhook#1:', r1.status, r1.body.slice(0, 90))
  console.log('webhook#2(dup):', r2.status, r2.body.slice(0, 90))
  console.log('paymentStatus unchanged:', order.paymentStatus === order2.paymentStatus ? 'yes(' + order2.paymentStatus + ')' : 'CHANGED!')
  console.log('reservations unchanged:', resv.n === resv2.n ? 'yes(' + resv2.n + ')' : 'CHANGED')
  console.log('inventory unchanged:', JSON.stringify(invBefore[0]) === JSON.stringify(invAfter[0]) ? 'yes ' + JSON.stringify(invAfter[0].map((r) => ({ q: r.quantity, l: r.locked }))) : 'CHANGED')
  process.exit(0)
})()
