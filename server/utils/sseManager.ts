// SSE (Server-Sent Events) 连接管理器
// 用于向所有连接的客户端实时推送通知事件

const clients = new Map() // userId -> Set<{ id, res }>

// 添加 SSE 客户端连接
export function addClient(userId, res) {
  if (!clients.has(userId)) {
    clients.set(userId, new Set())
  }
  const clientSet = clients.get(userId)
  const client = { id: Date.now() + Math.random(), res }
  clientSet.add(client)

  // 客户端断开时自动清理
  res.on('close', () => {
    clientSet.delete(client)
    if (clientSet.size === 0) {
      clients.delete(userId)
    }
  })

  return client
}

// 向指定用户推送事件
export function sendToUser(userId, event, data) {
  const clientSet = clients.get(userId)
  if (!clientSet) return

  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const client of clientSet) {
    try {
      client.res.write(message)
    } catch {
      clientSet.delete(client)
    }
  }
}

// 向所有在线用户广播事件
export function broadcast(event, data) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const [, clientSet] of clients) {
    for (const client of clientSet) {
      try {
        client.res.write(message)
      } catch {
        clientSet.delete(client)
      }
    }
  }
}

// 获取在线用户数（用于监控）
export function getOnlineCount() {
  return clients.size
}