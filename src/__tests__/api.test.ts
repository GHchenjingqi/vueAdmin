import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockPut = vi.fn()
const mockPatch = vi.fn()
const mockDelete = vi.fn()

vi.mock('@/utils/request', () => ({
  default: {
    get: mockGet,
    post: mockPost,
    put: mockPut,
    patch: mockPatch,
    delete: mockDelete,
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('authApi', () => {
  it('captcha() calls GET /auth/captcha', async () => {
    const { authApi } = await import('@/api/auth')
    authApi.captcha()
    expect(mockGet).toHaveBeenCalledWith('/auth/captcha', { params: { _t: expect.any(Number) } })
  })

  it('login() calls POST /auth/login', async () => {
    const { authApi } = await import('@/api/auth')
    const params = { username: 'admin', password: '123456' }
    authApi.login(params)
    expect(mockPost).toHaveBeenCalledWith('/auth/login', params)
  })

  it('refresh() calls POST /auth/token', async () => {
    const { authApi } = await import('@/api/auth')
    authApi.refresh()
    expect(mockPost).toHaveBeenCalledWith('/auth/token')
  })

  it('logout() calls DELETE /auth/session', async () => {
    const { authApi } = await import('@/api/auth')
    authApi.logout()
    expect(mockDelete).toHaveBeenCalledWith('/auth/session')
  })

  it('profile() calls GET /auth/profile', async () => {
    const { authApi } = await import('@/api/auth')
    authApi.profile()
    expect(mockGet).toHaveBeenCalledWith('/auth/profile')
  })

  it('changePassword() calls PATCH /auth/password', async () => {
    const { authApi } = await import('@/api/auth')
    authApi.changePassword({ newPassword: 'new123' })
    expect(mockPatch).toHaveBeenCalledWith('/auth/password', { newPassword: 'new123' })
  })

  it('forgotPassword() calls POST /auth/password/forgot', async () => {
    const { authApi } = await import('@/api/auth')
    authApi.forgotPassword('admin@test.com')
    expect(mockPost).toHaveBeenCalledWith('/auth/password/forgot', { email: 'admin@test.com' })
  })

  it('resetPassword() calls POST /auth/password/reset', async () => {
    const { authApi } = await import('@/api/auth')
    authApi.resetPassword('token123', 'newPass')
    expect(mockPost).toHaveBeenCalledWith('/auth/password/reset', { token: 'token123', newPassword: 'newPass' })
  })

  it('sseTicket() calls POST /auth/sse-ticket', async () => {
    const { authApi } = await import('@/api/auth')
    authApi.sseTicket()
    expect(mockPost).toHaveBeenCalledWith('/auth/sse-ticket')
  })
})

describe('userApi', () => {
  it('list() calls GET /users', async () => {
    const { userApi } = await import('@/api/user')
    userApi.list({ page: 1, pageSize: 10 })
    expect(mockGet).toHaveBeenCalledWith('/users', { params: { page: 1, pageSize: 10 } })
  })

  it('getById() calls GET /users/:id', async () => {
    const { userApi } = await import('@/api/user')
    userApi.getById(1)
    expect(mockGet).toHaveBeenCalledWith('/users/1')
  })

  it('create() calls POST /users', async () => {
    const { userApi } = await import('@/api/user')
    userApi.create({ username: 'test' })
    expect(mockPost).toHaveBeenCalledWith('/users', { username: 'test' })
  })

  it('update() calls PUT /users/:id', async () => {
    const { userApi } = await import('@/api/user')
    userApi.update(1, { username: 'updated' })
    expect(mockPut).toHaveBeenCalledWith('/users/1', { username: 'updated' })
  })

  it('changePassword() calls PATCH /users/:id/password', async () => {
    const { userApi } = await import('@/api/user')
    userApi.changePassword(1, { password: 'new123' })
    expect(mockPatch).toHaveBeenCalledWith('/users/1/password', { password: 'new123' })
  })

  it('delete() calls DELETE /users/:id', async () => {
    const { userApi } = await import('@/api/user')
    userApi.delete(1)
    expect(mockDelete).toHaveBeenCalledWith('/users/1')
  })

  it('downloadTemplate() calls GET /users/template', async () => {
    const { userApi } = await import('@/api/user')
    userApi.downloadTemplate()
    expect(mockGet).toHaveBeenCalledWith('/users/template', { responseType: 'blob' })
  })

  it('importUsers() calls POST /users/import', async () => {
    const { userApi } = await import('@/api/user')
    const fd = new FormData()
    userApi.importUsers(fd)
    expect(mockPost).toHaveBeenCalledWith('/users/import', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  })

  it('batchDelete() calls DELETE /users/batch', async () => {
    const { userApi } = await import('@/api/user')
    userApi.batchDelete([1, 2, 3])
    expect(mockDelete).toHaveBeenCalledWith('/users/batch', { data: { ids: [1, 2, 3] } })
  })
})

describe('menuApi', () => {
  it('getTree() calls GET /menus/tree', async () => {
    const { menuApi } = await import('@/api/menu')
    menuApi.getTree()
    expect(mockGet).toHaveBeenCalledWith('/menus/tree')
  })

  it('list() calls GET /menus', async () => {
    const { menuApi } = await import('@/api/menu')
    menuApi.list()
    expect(mockGet).toHaveBeenCalledWith('/menus')
  })

  it('getById() calls GET /menus/:id', async () => {
    const { menuApi } = await import('@/api/menu')
    menuApi.getById(1)
    expect(mockGet).toHaveBeenCalledWith('/menus/1')
  })

  it('create() calls POST /menus', async () => {
    const { menuApi } = await import('@/api/menu')
    menuApi.create({ name: 'Test' })
    expect(mockPost).toHaveBeenCalledWith('/menus', { name: 'Test' })
  })

  it('update() calls PUT /menus/:id', async () => {
    const { menuApi } = await import('@/api/menu')
    menuApi.update(1, { name: 'Updated' })
    expect(mockPut).toHaveBeenCalledWith('/menus/1', { name: 'Updated' })
  })

  it('delete() calls DELETE /menus/:id', async () => {
    const { menuApi } = await import('@/api/menu')
    menuApi.delete(1)
    expect(mockDelete).toHaveBeenCalledWith('/menus/1')
  })
})

describe('roleApi', () => {
  it('list() calls GET /roles', async () => {
    const { roleApi } = await import('@/api/role')
    roleApi.list({ page: 1 })
    expect(mockGet).toHaveBeenCalledWith('/roles', { params: { page: 1 } })
  })

  it('getAll() calls GET /roles/all', async () => {
    const { roleApi } = await import('@/api/role')
    roleApi.getAll()
    expect(mockGet).toHaveBeenCalledWith('/roles/all')
  })

  it('getById() calls GET /roles/:id', async () => {
    const { roleApi } = await import('@/api/role')
    roleApi.getById(1)
    expect(mockGet).toHaveBeenCalledWith('/roles/1')
  })

  it('create() calls POST /roles', async () => {
    const { roleApi } = await import('@/api/role')
    roleApi.create({ name: 'Admin' })
    expect(mockPost).toHaveBeenCalledWith('/roles', { name: 'Admin' })
  })

  it('update() calls PUT /roles/:id', async () => {
    const { roleApi } = await import('@/api/role')
    roleApi.update(1, { name: 'Updated' })
    expect(mockPut).toHaveBeenCalledWith('/roles/1', { name: 'Updated' })
  })

  it('delete() calls DELETE /roles/:id', async () => {
    const { roleApi } = await import('@/api/role')
    roleApi.delete(1)
    expect(mockDelete).toHaveBeenCalledWith('/roles/1')
  })
})

describe('deptApi', () => {
  it('getTree() calls GET /departments', async () => {
    const { deptApi } = await import('@/api/dept')
    deptApi.getTree()
    expect(mockGet).toHaveBeenCalledWith('/departments')
  })

  it('getById() calls GET /departments/:id', async () => {
    const { deptApi } = await import('@/api/dept')
    deptApi.getById(1)
    expect(mockGet).toHaveBeenCalledWith('/departments/1')
  })

  it('create() calls POST /departments', async () => {
    const { deptApi } = await import('@/api/dept')
    deptApi.create({ name: 'Engineering' })
    expect(mockPost).toHaveBeenCalledWith('/departments', { name: 'Engineering' })
  })

  it('update() calls PUT /departments/:id', async () => {
    const { deptApi } = await import('@/api/dept')
    deptApi.update(1, { name: 'Updated' })
    expect(mockPut).toHaveBeenCalledWith('/departments/1', { name: 'Updated' })
  })

  it('delete() calls DELETE /departments/:id', async () => {
    const { deptApi } = await import('@/api/dept')
    deptApi.delete(1)
    expect(mockDelete).toHaveBeenCalledWith('/departments/1')
  })
})

describe('dictApi', () => {
  it('getTypes() calls GET /dict/types', async () => {
    const { dictApi } = await import('@/api/dict')
    dictApi.getTypes({ page: 1 })
    expect(mockGet).toHaveBeenCalledWith('/dict/types', { params: { page: 1 } })
  })

  it('getAllTypes() calls GET /dict/types/all', async () => {
    const { dictApi } = await import('@/api/dict')
    dictApi.getAllTypes()
    expect(mockGet).toHaveBeenCalledWith('/dict/types/all')
  })

  it('createType() calls POST /dict/types', async () => {
    const { dictApi } = await import('@/api/dict')
    dictApi.createType({ name: 'Test' })
    expect(mockPost).toHaveBeenCalledWith('/dict/types', { name: 'Test' })
  })

  it('updateType() calls PUT /dict/types/:id', async () => {
    const { dictApi } = await import('@/api/dict')
    dictApi.updateType(1, { name: 'Updated' })
    expect(mockPut).toHaveBeenCalledWith('/dict/types/1', { name: 'Updated' })
  })

  it('deleteType() calls DELETE /dict/types/:id', async () => {
    const { dictApi } = await import('@/api/dict')
    dictApi.deleteType(1)
    expect(mockDelete).toHaveBeenCalledWith('/dict/types/1')
  })

  it('getDataByType() calls GET /dict/data', async () => {
    const { dictApi } = await import('@/api/dict')
    dictApi.getDataByType('gender')
    expect(mockGet).toHaveBeenCalledWith('/dict/data', { params: { scope: 'options', type: 'gender' } })
  })

  it('getDataList() calls GET /dict/data', async () => {
    const { dictApi } = await import('@/api/dict')
    dictApi.getDataList({ dictType: 'gender', page: 1 })
    expect(mockGet).toHaveBeenCalledWith('/dict/data', { params: { dictType: 'gender', page: 1 } })
  })

  it('createData() calls POST /dict/data', async () => {
    const { dictApi } = await import('@/api/dict')
    dictApi.createData({ label: 'Test' })
    expect(mockPost).toHaveBeenCalledWith('/dict/data', { label: 'Test' })
  })

  it('updateData() calls PUT /dict/data/:id', async () => {
    const { dictApi } = await import('@/api/dict')
    dictApi.updateData(1, { label: 'Updated' })
    expect(mockPut).toHaveBeenCalledWith('/dict/data/1', { label: 'Updated' })
  })

  it('deleteData() calls DELETE /dict/data/:id', async () => {
    const { dictApi } = await import('@/api/dict')
    dictApi.deleteData(1)
    expect(mockDelete).toHaveBeenCalledWith('/dict/data/1')
  })

  it('refreshCache() calls POST /dict/cache/refresh', async () => {
    const { dictApi } = await import('@/api/dict')
    dictApi.refreshCache()
    expect(mockPost).toHaveBeenCalledWith('/dict/cache/refresh')
  })
})

describe('noticeApi', () => {
  it('list() calls GET /notices', async () => {
    const { noticeApi } = await import('@/api/notice')
    noticeApi.list({ page: 1 })
    expect(mockGet).toHaveBeenCalledWith('/notices', { params: { page: 1 } })
  })

  it('getById() calls GET /notices/:id', async () => {
    const { noticeApi } = await import('@/api/notice')
    noticeApi.getById(1)
    expect(mockGet).toHaveBeenCalledWith('/notices/1')
  })

  it('create() calls POST /notices', async () => {
    const { noticeApi } = await import('@/api/notice')
    noticeApi.create({ title: 'Notice' })
    expect(mockPost).toHaveBeenCalledWith('/notices', { title: 'Notice' })
  })

  it('update() calls PUT /notices/:id', async () => {
    const { noticeApi } = await import('@/api/notice')
    noticeApi.update(1, { title: 'Updated' })
    expect(mockPut).toHaveBeenCalledWith('/notices/1', { title: 'Updated' })
  })

  it('delete() calls DELETE /notices/:id', async () => {
    const { noticeApi } = await import('@/api/notice')
    noticeApi.delete(1)
    expect(mockDelete).toHaveBeenCalledWith('/notices/1')
  })

  it('markRead() calls PATCH /notices/:id', async () => {
    const { noticeApi } = await import('@/api/notice')
    noticeApi.markRead(1)
    expect(mockPatch).toHaveBeenCalledWith('/notices/1', { isRead: true })
  })

  it('markAllRead() calls PATCH /notices', async () => {
    const { noticeApi } = await import('@/api/notice')
    noticeApi.markAllRead()
    expect(mockPatch).toHaveBeenCalledWith('/notices')
  })

  it('getUnreadCount() calls GET /notices/unread/count', async () => {
    const { noticeApi } = await import('@/api/notice')
    noticeApi.getUnreadCount()
    expect(mockGet).toHaveBeenCalledWith('/notices/unread/count')
  })
})

describe('messageApi', () => {
  it('list() calls GET /messages', async () => {
    const { messageApi } = await import('@/api/message')
    messageApi.list({ page: 1 })
    expect(mockGet).toHaveBeenCalledWith('/messages', { params: { page: 1 } })
  })

  it('getById() calls GET /messages/:id', async () => {
    const { messageApi } = await import('@/api/message')
    messageApi.getById(1)
    expect(mockGet).toHaveBeenCalledWith('/messages/1')
  })

  it('send() calls POST /messages', async () => {
    const { messageApi } = await import('@/api/message')
    messageApi.send({ title: 'Hello', content: 'World', receiverId: 1 })
    expect(mockPost).toHaveBeenCalledWith('/messages', { title: 'Hello', content: 'World', receiverId: 1 })
  })

  it('markRead() calls PATCH /messages/:id', async () => {
    const { messageApi } = await import('@/api/message')
    messageApi.markRead(1)
    expect(mockPatch).toHaveBeenCalledWith('/messages/1', { isRead: true })
  })

  it('markAllRead() calls PATCH /messages', async () => {
    const { messageApi } = await import('@/api/message')
    messageApi.markAllRead()
    expect(mockPatch).toHaveBeenCalledWith('/messages')
  })

  it('delete() calls DELETE /messages/:id', async () => {
    const { messageApi } = await import('@/api/message')
    messageApi.delete(1)
    expect(mockDelete).toHaveBeenCalledWith('/messages/1')
  })
})

describe('logApi', () => {
  it('list() calls GET /logs', async () => {
    const { logApi } = await import('@/api/log')
    logApi.list({ page: 1 })
    expect(mockGet).toHaveBeenCalledWith('/logs', { params: { page: 1 } })
  })

  it('getById() calls GET /logs/:id', async () => {
    const { logApi } = await import('@/api/log')
    logApi.getById(1)
    expect(mockGet).toHaveBeenCalledWith('/logs/1')
  })

  it('exportLogs() calls GET /logs with export scope', async () => {
    const { logApi } = await import('@/api/log')
    logApi.exportLogs({ page: 1 })
    expect(mockGet).toHaveBeenCalledWith('/logs', { params: { page: 1, scope: 'export' }, responseType: 'blob' })
  })

  it('cleanup() calls DELETE /logs', async () => {
    const { logApi } = await import('@/api/log')
    logApi.cleanup({ beforeDays: 30 })
    expect(mockDelete).toHaveBeenCalledWith('/logs', { params: { beforeDays: 30 } })
  })

  it('getLoginFailureStats() calls GET /logs with stats scope', async () => {
    const { logApi } = await import('@/api/log')
    logApi.getLoginFailureStats()
    expect(mockGet).toHaveBeenCalledWith('/logs', { params: { scope: 'stats', type: 'login-failures' } })
  })
})

describe('dashboardApi', () => {
  it('getStats() calls GET /dashboard/stats', async () => {
    const { dashboardApi } = await import('@/api/dashboard')
    dashboardApi.getStats()
    expect(mockGet).toHaveBeenCalledWith('/dashboard/stats')
  })
})

describe('settingApi', () => {
  it('list() calls GET /settings', async () => {
    const { settingApi } = await import('@/api/setting')
    settingApi.list()
    expect(mockGet).toHaveBeenCalledWith('/settings')
  })

  it('getByKey() calls GET /settings/:key', async () => {
    const { settingApi } = await import('@/api/setting')
    settingApi.getByKey('site_title')
    expect(mockGet).toHaveBeenCalledWith('/settings/site_title')
  })

  it('save() calls PUT /settings', async () => {
    const { settingApi } = await import('@/api/setting')
    settingApi.save({ site_title: 'New' })
    expect(mockPut).toHaveBeenCalledWith('/settings', { site_title: 'New' })
  })
})

describe('siteApi', () => {
  it('info() calls GET /site/info', async () => {
    const { siteApi } = await import('@/api/setting')
    siteApi.info()
    expect(mockGet).toHaveBeenCalledWith('/site/info')
  })
})

describe('uploadApi', () => {
  it('list() calls GET /upload', async () => {
    const { uploadApi } = await import('@/api/upload')
    uploadApi.list()
    expect(mockGet).toHaveBeenCalledWith('/upload')
  })

  it('upload() calls POST /upload', async () => {
    const { uploadApi } = await import('@/api/upload')
    const file = new File([''], 'test.txt')
    uploadApi.upload(file)
    expect(mockPost).toHaveBeenCalledWith('/upload', expect.any(FormData), {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  })

  it('uploadBatch() calls POST /upload/batch', async () => {
    const { uploadApi } = await import('@/api/upload')
    const files = [new File([''], 'a.txt'), new File([''], 'b.txt')]
    uploadApi.uploadBatch(files)
    expect(mockPost).toHaveBeenCalledWith('/upload/batch', expect.any(FormData), {
      headers: { 'Content-Type': 'multipart/form-data', 'X-Upload-Batch': 'true' },
    })
  })

  it('remove() calls DELETE /upload/:id', async () => {
    const { uploadApi } = await import('@/api/upload')
    uploadApi.remove('2025/01/abc.jpg')
    expect(mockDelete).toHaveBeenCalledWith('/upload/2025/01/abc.jpg')
  })
})

describe('onlineUserApi', () => {
  it('list() calls GET /online-users', async () => {
    const { onlineUserApi } = await import('@/api/onlineUser')
    onlineUserApi.list()
    expect(mockGet).toHaveBeenCalledWith('/online-users')
  })

  it('kick() calls DELETE /online-users/:id/session', async () => {
    const { onlineUserApi } = await import('@/api/onlineUser')
    onlineUserApi.kick(1)
    expect(mockDelete).toHaveBeenCalledWith('/online-users/1/session')
  })
})

describe('taskApi', () => {
  it('list() calls GET /tasks', async () => {
    const { taskApi } = await import('@/api/task')
    taskApi.list({ page: 1 })
    expect(mockGet).toHaveBeenCalledWith('/tasks', { params: { page: 1 } })
  })

  it('getById() calls GET /tasks/:id', async () => {
    const { taskApi } = await import('@/api/task')
    taskApi.getById(1)
    expect(mockGet).toHaveBeenCalledWith('/tasks/1')
  })

  it('create() calls POST /tasks', async () => {
    const { taskApi } = await import('@/api/task')
    taskApi.create({ name: 'Task' })
    expect(mockPost).toHaveBeenCalledWith('/tasks', { name: 'Task' })
  })

  it('update() calls PUT /tasks/:id', async () => {
    const { taskApi } = await import('@/api/task')
    taskApi.update(1, { name: 'Updated' })
    expect(mockPut).toHaveBeenCalledWith('/tasks/1', { name: 'Updated' })
  })

  it('delete() calls DELETE /tasks/:id', async () => {
    const { taskApi } = await import('@/api/task')
    taskApi.delete(1)
    expect(mockDelete).toHaveBeenCalledWith('/tasks/1')
  })

  it('execute() calls POST /tasks/:id/execute', async () => {
    const { taskApi } = await import('@/api/task')
    taskApi.execute(1)
    expect(mockPost).toHaveBeenCalledWith('/tasks/1/execute')
  })

  it('toggleStatus() calls PATCH /tasks/:id/status', async () => {
    const { taskApi } = await import('@/api/task')
    taskApi.toggleStatus(1)
    expect(mockPatch).toHaveBeenCalledWith('/tasks/1/status')
  })
})

describe('serverApi', () => {
  it('getStats() calls GET /server/stats', async () => {
    const { serverApi } = await import('@/api/server')
    serverApi.getStats()
    expect(mockGet).toHaveBeenCalledWith('/server/stats')
  })
})

describe('searchApi', () => {
  it('search() calls GET /search', async () => {
    const { searchApi } = await import('@/api/search')
    searchApi.search('test')
    expect(mockGet).toHaveBeenCalledWith('/search', { params: { keyword: 'test' } })
  })
})
