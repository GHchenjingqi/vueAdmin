import https from 'https'
import sequelize from '../config/database.js'
const port = 5173
function req(opts: any, data?: any): Promise<{ status: number; body: string }> {
  return new Promise((res, rej) => {
    const r = https.request({ rejectUnauthorized: false, ...opts }, (resp) => {
      let b = ''
      resp.on('data', (d) => (b += d))
      resp.on('end', () => res({ status: resp.statusCode || 0, body: b }))
    })
    r.on('error', rej)
    if (data) r.write(data)
    r.end()
  })
}
;(async () => {
  await sequelize.query("UPDATE settings SET optionValue='0' WHERE optionKey='captcha_enabled'")
  try {
    const login = await req({ host: 'localhost', port, path: '/api/v1/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json' } }, JSON.stringify({ username: 'admin', password: '123456' }))
    const token = JSON.parse(login.body).data?.accessToken
    const menus = await req({ host: 'localhost', port, path: '/api/v1/menus/tree', method: 'GET', headers: { Authorization: 'Bearer ' + token } })
    const md = JSON.parse(menus.body)
    const wf = (md.data || []).find((m: any) => m.path === '/workflow')
    console.log('tree status', menus.status, 'workflow present', !!wf, 'children', wf ? wf.children.map((c: any) => c.name).join(',') : '')
  } catch (e: any) { console.error('ERR', e && e.message) }
  finally { await sequelize.query("UPDATE settings SET optionValue='1' WHERE optionKey='captcha_enabled'"); await sequelize.close() }
})()
