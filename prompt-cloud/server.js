'use strict'

const express = require('express')
const multer = require('multer')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

const PORT = Number(process.env.PORT) || 3000
const ROOT = __dirname
const CLIENT_DIR = path.join(ROOT, 'client')
const UPLOAD_DIR = path.join(ROOT, 'uploads')
const DATA_DIR = path.join(ROOT, 'data')
const DB_FILE = path.join(DATA_DIR, 'db.json')
const BACKUP_DIR = path.join(DATA_DIR, 'backups')
const MAX_BACKUPS = 10
const BACKUP_MIN_INTERVAL_MS = 60 * 1000
const JWT_SECRET = process.env.JWT_SECRET || 'prompt-cloud-jwt-secret-20261116'
const COOKIE_NAME = 'ppt_token'
const CATEGORY_NAMES = ['人物', '服装', '环境', '建筑', '产品', '美食', '动物', '插画艺术', '摄影', '其他']
const DB_SCHEMA = 'prompt-cloud-v1'
const IMAGES_PER_GROUP = 20
const IMAGES_PER_STEP_GROUP = 1
const MAX_STEPS = 100
const MAX_CATEGORIES = 10
const MAX_RELATED_PROMPTS = 50
const MAX_CHAIN_DEPTH = 20
const DEFAULT_PLATFORM_ID = 1
const DEFAULT_PLATFORM_NAMES = ['通用', '即梦', '可灵', 'GPT', 'Midjourney', 'Stable Diffusion', '通义万相']
const AI_KEY_PREFIX = 'ppt_ai_'
const AI_IMAGE_MAX_BYTES = 15 * 1024 * 1024
const AI_FETCH_TIMEOUT_MS = 20000
// Skills 下载中心：附件数量与单文件大小上限
const MAX_SKILL_ATTACHMENTS = 20
const SKILL_FILE_MAX_BYTES = 50 * 1024 * 1024

fs.mkdirSync(UPLOAD_DIR, { recursive: true })
fs.mkdirSync(DATA_DIR, { recursive: true })

const nowIso = () => new Date().toISOString()

// 演示数据：让社区风前台首次打开就有内容（图片用 picsum 外链，失败时前端有渐变兜底）
const DEMO_USERS = [
  { id: 2, username: 'lin_zhou', nickname: '林舟', role: 'user' },
  { id: 3, username: 'mumu', nickname: '木木', role: 'user' },
  { id: 4, username: 'green_tea', nickname: '绿茶', role: 'user' },
  { id: 5, username: 'anyu', nickname: '安羽', role: 'user' },
]

const DEMO_PROMPTS = [
  { title: '海边玻璃心 · 夏日清透人像', categoryId: 9, modelName: 'Midjourney v6', authorId: 2, views: 1284, favs: 86, seed: 'ocean-glass', ratio: [720, 960], content: 'A crystal clear glass heart held in hands on a summer beach, sunlight refraction, turquoise seawater, hyper-realistic, soft bokeh, cinematic lighting --ar 3:4 --v 6.0' },
  { title: '暗调咖啡与烟雾 · 静物摄影', categoryId: 9, modelName: 'Stable Diffusion XL', authorId: 3, views: 968, favs: 54, seed: 'coffee-smoke', ratio: [720, 900], content: 'Moody still life of a coffee cup with rising smoke, dark background, warm rim light, ultra detailed, 85mm lens, shallow depth of field' },
  { title: '东方红衣少女 · 国风写意', categoryId: 8, modelName: 'Midjourney v6', authorId: 5, views: 2140, favs: 173, seed: 'red-dress', ratio: [720, 1000], content: 'A young woman in flowing red hanfu, ethereal mist, traditional Chinese painting meets photorealism, dramatic composition, delicate details --ar 3:4' },
  { title: '极简产品渲染 · 玻璃质感', categoryId: 5, modelName: 'Flux.1 Pro', authorId: 4, views: 756, favs: 41, seed: 'glass-product', ratio: [720, 860], content: 'Minimalist glass perfume bottle product shot, soft studio lighting, clean background, high-end commercial photography, refraction and caustics' },
  { title: '森林小屋 · 治愈系插画', categoryId: 4, modelName: 'Midjourney v6', authorId: 2, views: 1523, favs: 112, seed: 'forest-cabin', ratio: [720, 960], content: 'Cozy little cabin deep in a misty forest, warm glowing windows, storybook illustration style, soft pastel palette, whimsical atmosphere --ar 3:4' },
  { title: '赛博朋克街景 · 霓虹雨夜', categoryId: 10, modelName: 'Stable Diffusion XL', authorId: 3, views: 1886, favs: 129, seed: 'cyber-rain', ratio: [720, 920], content: 'Cyberpunk city street at night, heavy rain, neon reflections on wet asphalt, cinematic wide angle, volumetric fog, blade runner aesthetic' },
  { title: '奶油甜品 · 美食特写', categoryId: 6, modelName: 'Flux.1 Pro', authorId: 4, views: 634, favs: 38, seed: 'cream-dessert', ratio: [720, 880], content: 'Close-up of a creamy strawberry dessert, natural window light, food photography, ultra detailed texture, soft shadows, appetizing composition' },
  { title: '雪原狐狸 ·  wildlife', categoryId: 7, modelName: 'Midjourney v6', authorId: 5, views: 1102, favs: 76, seed: 'snow-fox', ratio: [720, 980], content: 'An arctic fox standing on snow field at golden hour, fluffy fur, calm expression, wildlife photography, telephoto lens, shallow depth of field --ar 3:4' },
  { title: '未来主义建筑 · 曲线美学', categoryId: 4, modelName: 'Stable Diffusion XL', authorId: 2, views: 845, favs: 47, seed: 'future-arch', ratio: [720, 900], content: 'Futuristic architectural facade with flowing curves, white concrete, bright sky, architectural photography, clean geometric composition' },
  { title: '职场通勤穿搭 · 时尚街拍', categoryId: 2, modelName: 'Midjourney v6', authorId: 3, views: 972, favs: 63, seed: 'street-fashion', ratio: [720, 1000], content: 'Minimalist office street style fashion portrait, neutral tones, natural light, editorial photography, full body shot --ar 3:4' },
  { title: '梦幻独角兽 · 童话插画', categoryId: 8, modelName: 'Flux.1 Pro', authorId: 4, views: 1338, favs: 98, seed: 'unicorn', ratio: [720, 940], content: 'A majestic unicorn in an enchanted forest, sparkling particles, dreamy pastel colors, children book illustration, soft glowing light' },
  { title: '晨光瑜伽 · 生活美学', categoryId: 1, modelName: 'Midjourney v6', authorId: 5, views: 712, favs: 35, seed: 'morning-yoga', ratio: [720, 960], content: 'A woman practicing yoga by the window in morning sunlight, serene atmosphere, lifestyle photography, warm tones, soft shadows --ar 3:4' },
]

// 有序步骤套组示例：一套太极三式，每步一个动作、每平台一张代表图
const SEQUENCE_DEMO = {
  title: '太极三式 · 起势到收势',
  categoryId: 1,
  modelName: '即梦 / 可灵',
  authorId: 2,
  views: 1860,
  favs: 142,
  characterAnchor: '同一名白衣武者，身形清瘦，晨雾中的古朴庭院，写实电影质感，全身构图，统一柔和光线',
  steps: [
    { name: '起势', actionPrompt: '双脚并拢站立，双手自然垂于身体两侧，缓缓吸气，目光平视前方', camera: '正面全身平视', seconds: 5, transition: '重心左移，进入左搂膝拗步', images: [{ seed: 'morning-yoga', platformId: 2 }] },
    { name: '左搂膝拗步', actionPrompt: '左腿前弓成弓步，左手搂膝向左下划弧，右手立掌向前推出，目视右手', camera: '侧面全身', seconds: 8, transition: '重心后移，收脚换势进入单鞭', images: [{ seed: 'red-dress', platformId: 2 }, { seed: 'street-fashion', platformId: 3 }] },
    { name: '单鞭收势', actionPrompt: '身体右转，右手勾手，左手立掌向左缓缓推出，随后双手回收归于腹前', camera: '正面全身平视', seconds: 8, transition: '套路结束，气息归元', images: [{ seed: 'morning-yoga', platformId: 3 }] },
  ],
}

function buildDemoData(t) {
  const users = DEMO_USERS.map((u) => ({
    ...u,
    email: `${u.username}@demo.local`,
    passwordHash: bcrypt.hashSync('demo123', 10),
    status: 1,
    createdAt: t,
  }))
  let imageId = 0
  let favoriteId = 0
  const favoritePlan = [[2, 1], [3, 1], [4, 1], [2, 3], [5, 3], [3, 3], [4, 3], [2, 5], [5, 5], [2, 8], [4, 8], [3, 11]]
  const prompts = DEMO_PROMPTS.map((p, i) => {
    const id = i + 1
    return {
      id,
      title: p.title,
      content: p.content,
      categoryId: p.categoryId,
      modelName: p.modelName,
      status: 'published',
      source: 'demo',
      authorId: p.authorId,
      rejectReason: null,
      reviewedBy: 1,
      reviewedAt: t,
      viewCount: p.views,
      isDeleted: 0,
      createdAt: new Date(Date.now() - (i + 1) * 3600000).toISOString(),
      updatedAt: t,
    }
  })
  const images = DEMO_PROMPTS.flatMap((p, i) => {
    imageId += 1
    return [{
      id: imageId,
      promptId: i + 1,
      platformId: DEFAULT_PLATFORM_ID,
      url: `/uploads/demo-${p.seed}.jpg`,
      filePath: null,
      sort: 0,
      isCover: 1,
    }]
  })
  const favorites = favoritePlan.map(([userId, promptId]) => ({
    id: ++favoriteId,
    userId,
    promptId,
    createdAt: t,
  }))

  // 追加套组示例：先建 prompt，再建 steps，最后给每步挂对应平台的单张效果图
  const sequencePromptId = prompts.length + 1
  prompts.push({
    id: sequencePromptId,
    title: SEQUENCE_DEMO.title,
    content: SEQUENCE_DEMO.steps.map((s, i) => `${i + 1}. ${s.name}：${s.actionPrompt}`).join('\n'),
    categoryId: SEQUENCE_DEMO.categoryId,
    modelName: SEQUENCE_DEMO.modelName,
    type: 'sequence',
    characterAnchor: SEQUENCE_DEMO.characterAnchor,
    status: 'published',
    source: 'demo',
    authorId: SEQUENCE_DEMO.authorId,
    rejectReason: null,
    reviewedBy: 1,
    reviewedAt: t,
    viewCount: SEQUENCE_DEMO.views,
    isDeleted: 0,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    updatedAt: t,
  })
  let stepId = 0
  const steps = []
  SEQUENCE_DEMO.steps.forEach((step, stepIndex) => {
    stepId += 1
    const currentStepId = stepId
    steps.push({
      id: currentStepId,
      promptId: sequencePromptId,
      stepOrder: stepIndex + 1,
      name: step.name,
      actionPrompt: step.actionPrompt,
      camera: step.camera,
      seconds: step.seconds,
      transition: step.transition,
      createdAt: t,
      updatedAt: t,
    })
    for (const imageRef of step.images) {
      imageId += 1
      images.push({
        id: imageId,
        promptId: sequencePromptId,
        platformId: imageRef.platformId,
        stepId: currentStepId,
        url: `/uploads/demo-${imageRef.seed}.jpg`,
        filePath: null,
        sort: 0,
        isCover: 1,
      })
    }
  })

  return {
    users,
    prompts,
    images,
    steps,
    favorites,
    seq: {
      user: 5,
      category: CATEGORY_NAMES.length,
      platform: DEFAULT_PLATFORM_NAMES.length,
      prompt: prompts.length,
      image: imageId,
      step: stepId,
      favorite: favorites.length,
      upload: 0,
    },
  }
}

function seedDb() {
  const t = nowIso()
  const demo = buildDemoData(t)
  return {
    schema: DB_SCHEMA,
    seq: demo.seq,
    users: [
      {
        id: 1,
        username: 'admin',
        nickname: '管理员',
        email: 'admin@portal.local',
        passwordHash: bcrypt.hashSync('123456', 10),
        role: 'admin',
        status: 1,
        createdAt: t,
      },
      ...demo.users,
    ],
    categories: CATEGORY_NAMES.map((name, i) => ({
      id: i + 1,
      name,
      description: null,
      sort: i,
      status: 1,
      createdAt: t,
      updatedAt: t,
    })),
    platforms: DEFAULT_PLATFORM_NAMES.map((name, i) => ({
      id: i + 1,
      name,
      sort: i,
      status: 1,
      builtin: name === '通用',
      createdAt: t,
      updatedAt: t,
    })),
    prompts: demo.prompts,
    images: demo.images,
    steps: demo.steps,
    favorites: demo.favorites,
    uploads: [],
    skills: [],
    demoSeeded: true,
  }
}

// 兼容已有空库：首次加载到空 prompts 且未注入过演示数据时补齐
function ensureDemo(db) {
  // 演示数据外链 → 本地图片迁移（避免部署后仍指向 picsum）
  let migrated = false
  for (const img of db.images) {
    if (typeof img.url === 'string' && img.url.includes('picsum.photos/seed/')) {
      const seed = img.url.match(/seed\/([^/]+)\//)?.[1]
      if (seed) {
        img.url = `/uploads/demo-${seed}.jpg`
        migrated = true
      }
    }
  }
  if (db.demoSeeded || db.prompts.length > 0) return migrated
  const t = nowIso()
  const demo = buildDemoData(t)
  db.users.push(...demo.users)
  db.prompts.push(...demo.prompts)
  db.images.push(...demo.images)
  db.steps = [...(db.steps || []), ...demo.steps]
  db.favorites.push(...demo.favorites)
  db.seq = {
    user: Math.max(db.seq?.user || 0, demo.seq.user),
    category: db.seq?.category || CATEGORY_NAMES.length,
    platform: Math.max(db.seq?.platform || 0, demo.seq.platform),
    prompt: demo.seq.prompt,
    image: demo.seq.image,
    step: demo.seq.step,
    favorite: demo.seq.favorite,
    upload: db.seq?.upload || 0,
  }
  db.demoSeeded = true
  return true
}

// 老库升级：补齐平台字典与图片的 platformId（旧数据统一归入「通用」组）
function ensurePlatforms(db) {
  let migrated = false
  if (!Array.isArray(db.platforms) || db.platforms.length === 0) {
    const t = nowIso()
    db.platforms = DEFAULT_PLATFORM_NAMES.map((name, i) => ({
      id: i + 1,
      name,
      sort: i,
      status: 1,
      builtin: name === '通用',
      createdAt: t,
      updatedAt: t,
    }))
    migrated = true
  } else if (!db.platforms.some((p) => p.id === DEFAULT_PLATFORM_ID)) {
    db.platforms.unshift({ id: DEFAULT_PLATFORM_ID, name: '通用', sort: 0, status: 1, builtin: true, createdAt: nowIso(), updatedAt: nowIso() })
    migrated = true
  }
  for (const img of db.images || []) {
    if (!img.platformId) {
      img.platformId = DEFAULT_PLATFORM_ID
      migrated = true
    }
  }
  db.seq = db.seq || {}
  if (!db.seq.platform) {
    db.seq.platform = db.platforms.reduce((max, p) => Math.max(max, Number(p.id) || 0), 0)
    migrated = true
  }
  return migrated
}

// 老库升级：补齐 steps 集合、prompt 的 type/characterAnchor、图片的 stepId
function ensureSequence(db) {
  let migrated = false
  if (!Array.isArray(db.steps)) {
    db.steps = []
    migrated = true
  }
  for (const prompt of db.prompts || []) {
    if (!prompt.type) {
      prompt.type = 'single'
      migrated = true
    }
    if (prompt.characterAnchor === undefined) {
      prompt.characterAnchor = null
      migrated = true
    }
  }
  for (const img of db.images || []) {
    if (img.stepId === undefined) {
      img.stepId = null
      migrated = true
    }
  }
  db.seq = db.seq || {}
  if (!db.seq.step) {
    db.seq.step = db.steps.reduce((max, step) => Math.max(max, Number(step.id) || 0), 0)
  }
  return migrated
}

// AI 推送：首次启动自动生成一个管理员可在设置页查看/轮换的 API Key
function ensureIntegrationData(db) {
  let migrated = false
  if (!Array.isArray(db.apiKeys)) {
    db.apiKeys = []
    migrated = true
  }
  if (!Array.isArray(db.integrationCalls)) {
    db.integrationCalls = []
    migrated = true
  }
  db.seq = db.seq || {}
  if (!db.apiKeys.length) {
    const id = Math.max(0, ...db.apiKeys.map((k) => Number(k.id) || 0)) + 1
    const admin = (db.users || []).find((u) => u.role === 'admin' && u.status === 1)
    db.apiKeys.push({
      id,
      name: '默认 AI 推送密钥',
      key: `${AI_KEY_PREFIX}${crypto.randomBytes(18).toString('hex')}`,
      status: 1,
      createdAt: nowIso(),
      lastUsedAt: null,
      createdBy: admin ? admin.id : null,
    })
    db.seq.apiKey = Math.max(Number(db.seq.apiKey) || 0, id)
    migrated = true
  }
  return migrated
}

// Skills 下载中心数据集合，缺失时自动补种（兼容线上已有库）
function ensureSkills(db) {
  let migrated = false
  if (!Array.isArray(db.skills)) {
    db.skills = []
    migrated = true
  }
  db.seq = db.seq || {}
  if (!db.seq.skill) {
    db.seq.skill = db.skills.reduce((max, s) => Math.max(max, Number(s.id) || 0), 0)
  }
  return migrated
}

// 短剧方向特殊分类：「提示词专题」与「角色库」的固定归属分类，缺失时自动补种
const SPECIAL_CATEGORY_NAMES = { collection: '提示词', character: '角色库' }

function ensureSpecialCategories(db) {
  let migrated = false
  db.seq = db.seq || {}
  for (const name of Object.values(SPECIAL_CATEGORY_NAMES)) {
    if (!db.categories.some((c) => c.name === name)) {
      const id = Math.max(0, ...db.categories.map((c) => Number(c.id) || 0)) + 1
      db.categories.push({
        id,
        name,
        description: null,
        sort: 0,
        status: 1,
        parentId: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      })
      db.seq.category = Math.max(Number(db.seq.category) || 0, id)
      migrated = true
    }
  }
  return migrated
}

function loadDb() {
  let loaded = null
  try {
    if (fs.existsSync(DB_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))
      if (parsed && parsed.schema === DB_SCHEMA && Array.isArray(parsed.users) && Array.isArray(parsed.prompts) && Array.isArray(parsed.categories)) loaded = parsed
      else {
        try {
          fs.copyFileSync(DB_FILE, `${DB_FILE}.legacy-${Date.now()}.bak`)
          console.warn('incompatible legacy db detected, backed up and reseeding')
        } catch (err) {
          console.warn('legacy db backup failed:', err.message)
        }
      }
    }
  } catch (err) {
    console.error('db load failed, reseeding:', err.message)
  }
  const db = loaded || seedDb()
  const platformMigrated = ensurePlatforms(db)
  const sequenceMigrated = ensureSequence(db)
  const demoMigrated = ensureDemo(db)
  const integrationMigrated = ensureIntegrationData(db)
  const specialCategoryMigrated = ensureSpecialCategories(db)
  const skillsMigrated = ensureSkills(db)
  if (demoMigrated || platformMigrated || sequenceMigrated || integrationMigrated || specialCategoryMigrated || skillsMigrated || !loaded) {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8')
    if (integrationMigrated) console.log('initialized AI push API key')
    if (specialCategoryMigrated) console.log('ensured special categories for collections and character library')
    if (demoMigrated && platformMigrated) console.log('seeded demo prompts and upgraded platform groups')
    else if (demoMigrated) console.log('seeded demo prompts into empty database')
    else if (platformMigrated) console.log('upgraded legacy images into default platform group')
    if (sequenceMigrated && !demoMigrated) console.log('upgraded database for prompt sequences')
  }
  return db
}

let db = loadDb()

let lastBackupAt = 0

// 滚动备份：每次持久化前把当前库拷贝到 data/backups，同一分钟限一份，保留最近 MAX_BACKUPS 份
function backupDb() {
  try {
    if (!fs.existsSync(DB_FILE)) return
    const now = Date.now()
    if (now - lastBackupAt < BACKUP_MIN_INTERVAL_MS) return
    lastBackupAt = now
    fs.mkdirSync(BACKUP_DIR, { recursive: true })
    const stamp = new Date(now).toISOString().replace(/[:.]/g, '-')
    fs.copyFileSync(DB_FILE, path.join(BACKUP_DIR, `db-${stamp}.json`))
    const files = fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('db-') && f.endsWith('.json'))
      .sort()
    while (files.length > MAX_BACKUPS) {
      fs.unlinkSync(path.join(BACKUP_DIR, files.shift()))
    }
  } catch (err) {
    console.warn('db backup failed:', err.message)
  }
}

function validDbSnapshot(snapshot) {
  const arrays = ['users', 'prompts', 'images', 'steps', 'categories', 'platforms', 'favorites', 'uploads']
  return snapshot && snapshot.schema === DB_SCHEMA && arrays.every((key) => Array.isArray(snapshot[key]))
}

function listBackups() {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return []
    return fs
      .readdirSync(BACKUP_DIR)
      .filter((f) => f.startsWith('db-') && f.endsWith('.json'))
      .sort()
      .reverse()
      .map((name) => {
        const stat = fs.statSync(path.join(BACKUP_DIR, name))
        return { name, size: stat.size, createdAt: stat.mtime.toISOString() }
      })
  } catch (err) {
    console.warn('list backups failed:', err.message)
    return []
  }
}

function persist() {
  backupDb()
  const tmp = DB_FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8')
  fs.renameSync(tmp, DB_FILE)
}

function nextId(key) {
  db.seq[key] = (db.seq[key] || 0) + 1
  return db.seq[key]
}

function ok(res, data, status = 200, message = 'success') {
  res.status(status).json({ code: 0, data, message })
}

function fail(res, message, status = 400) {
  res.status(status).json({ code: status, message, data: null })
}

function normalizePage(query) {
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 10))
  return { page, pageSize }
}

function paged(rows, page, pageSize) {
  return { rows: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize }
}

function parseCookies(header) {
  const out = {}
  if (!header) return out
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=')
    if (idx < 0) return
    const key = part.slice(0, idx).trim()
    if (key) out[key] = decodeURIComponent(part.slice(idx + 1).trim())
  })
  return out
}

function setAuthCookie(res, user) {
  const token = jwt.sign({ uid: user.id, role: user.role, username: user.username }, JWT_SECRET, { expiresIn: '7d' })
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=604800; HttpOnly; SameSite=Lax`)
  return token
}

function clearAuthCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`)
}

function currentUser(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME]
  if (!token) return null
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    return db.users.find((u) => u.id === payload.uid && u.status === 1) || null
  } catch {
    return null
  }
}

function requireUser(req, res, next) {
  const user = currentUser(req)
  if (!user) return fail(res, '未登录或登录已失效', 401)
  req.user = user
  next()
}

function requireAdmin(req, res, next) {
  const user = currentUser(req)
  if (!user) return fail(res, '未登录或登录已失效', 401)
  if (user.role !== 'admin') return fail(res, '您没有权限执行此操作', 403)
  req.user = user
  next()
}

function requireApiKey(req, res, next) {
  // 网关会注入自己的 X-API-Key / Authorization，因此优先读专用查询参数 pushKey
  const queryKey = String(req.query.pushKey || req.query.aiKey || req.query.apiKey || req.query.api_key || '').trim()
  const authHeader = String(req.headers.authorization || '')
  const bearer = /^Bearer\s+(.+)$/i.exec(authHeader)?.[1] || ''
  const raw = queryKey || String(req.headers['x-api-key'] || '').trim() || bearer.trim()
  if (!raw) return fail(res, '缺少 API 密钥（pushKey 参数、X-API-Key 或 Authorization: Bearer）', 401)
  const record = (db.apiKeys || []).find((item) => item.key === raw && item.status === 1)
  if (!record) return fail(res, 'API Key 无效或已停用', 401)
  record.lastUsedAt = nowIso()
  req.apiKey = record
  next()
}

function publicApiKey(record) {
  return {
    id: record.id,
    name: record.name,
    key: record.key,
    prefix: record.key.slice(0, 12),
    status: record.status,
    createdAt: record.createdAt,
    lastUsedAt: record.lastUsedAt || null,
  }
}

function rotateApiKey() {
  const record = (db.apiKeys || [])[0]
  if (!record) return null
  record.key = `${AI_KEY_PREFIX}${crypto.randomBytes(18).toString('hex')}`
  record.status = 1
  record.rotatedAt = nowIso()
  return record
}

function publicUser(u) {
  return {
    id: u.id,
    username: u.username,
    nickname: u.nickname,
    email: u.email,
    role: u.role,
    status: u.status,
    roles: u.role === 'admin' ? ['admin'] : ['user'],
    permissions: [],
    avatar: '',
    createdAt: u.createdAt,
  }
}

function livePrompts() {
  return db.prompts.filter((p) => !p.isDeleted)
}

function imagesOf(promptId, stepId) {
  return db.images
    .filter((img) => img.promptId === promptId && (stepId === undefined || (img.stepId ?? null) === (stepId ?? null)))
    .sort((a, b) => (a.sort - b.sort) || (a.id - b.id))
    .map((img) => ({
      id: img.id,
      platformId: img.platformId || DEFAULT_PLATFORM_ID,
      stepId: img.stepId ?? null,
      url: img.url,
      filePath: img.filePath,
      sort: img.sort,
      isCover: img.isCover,
      usage: img.usage || 'result',
      imageKey: img.imageKey || null,
    }))
}

function groupImagesByPlatform(images) {
  const groups = []
  const byId = new Map()
  for (const img of images) {
    const platformId = img.platformId || DEFAULT_PLATFORM_ID
    if (!byId.has(platformId)) {
      const platform = db.platforms.find((p) => p.id === platformId)
      const group = { platformId, platformName: platform ? platform.name : '通用', images: [], coverImage: '' }
      byId.set(platformId, group)
      groups.push(group)
    }
    byId.get(platformId).images.push(img)
  }
  for (const group of groups) {
    const cover = group.images.find((img) => img.isCover === 1) || group.images[0]
    group.coverImage = cover ? cover.url : ''
  }
  return groups
}

function platformGroupsOf(promptId) {
  return groupImagesByPlatform(imagesOf(promptId).filter((img) => img.usage === 'result'))
}

// 角色+姿势组合：角色图与姿势图不参与模型名派生和作品封面
function resultImagesOf(promptId) {
  return imagesOf(promptId).filter((img) => img.usage === 'result')
}

function publicPoseImage(img) {
  return img ? { url: img.url, filePath: img.filePath ?? null, sort: img.sort ?? 0, isCover: Boolean(img.isCover) } : null
}

function hasPromptResultImages(prompt) {
  if (prompt.type === 'collection') return relatedIdsOf(prompt).length > 0
  if (prompt.type === 'character') return imagesOf(prompt.id).length > 0
  return (prompt.type === 'character-pose' ? resultImagesOf(prompt.id) : imagesOf(prompt.id)).length > 0
}

function writePromptImages(promptId, data) {
  if (data.type === 'sequence') replaceSteps(promptId, data)
  else if (data.type === 'character-pose') replaceCharacterPose(promptId, data)
  else if (data.type === 'character') replaceCharacterLibrary(promptId, data)
  else if (data.type === 'collection') db.images = db.images.filter((img) => img.promptId !== promptId)
  else if (data.platformGroups !== undefined || data.images !== undefined) replaceImages(promptId, data)
}

function characterPoseOf(promptId) {
  const images = imagesOf(promptId)
  const character = images.find((img) => img.usage === 'character')
  const poseImages = images.filter((img) => img.usage === 'pose')
  const poses = poseImages.map((pose, index) => {
    const key = pose.imageKey || `pose-${index + 1}`
    const results = images.filter((img) => img.usage === 'result' && img.imageKey === key)
    return {
      key,
      poseImage: publicPoseImage(pose),
      platformGroups: groupImagesByPlatform(results),
    }
  })
  return { characterImage: publicPoseImage(character), poses }
}

/** 专题关联的提示词 ID 列表（存于 prompt.relatedIds，去重） */
function relatedIdsOf(prompt) {
  const raw = Array.isArray(prompt.relatedIds) ? prompt.relatedIds : []
  return Array.from(new Set(raw.map(Number).filter((id) => Number.isFinite(id) && id > 0)))
}

function relatedPromptBrief(id) {
  const target = livePrompts().find((p) => p.id === Number(id) && p.status === 'published')
  if (!target) return null
  const imgs = imagesOf(target.id)
  const cover = imgs.find((img) => img.isCover === 1) || imgs[0]
  const category = db.categories.find((c) => c.id === target.categoryId)
  return {
    id: target.id,
    title: target.title,
    coverImage: cover ? cover.url : '',
    modelName: target.modelName || '',
    categoryName: category ? category.name : '',
    type: target.type || 'single',
  }
}

function relatedPromptsOf(prompt) {
  return relatedIdsOf(prompt)
    .map((id) => relatedPromptBrief(id))
    .filter(Boolean)
}

/** 角色库资产：三视图 / 服装三视图 / 发型特写 / 道具图 / 面部表情 五组，usage 即组名 */
const CHARACTER_LIBRARY_GROUPS = [
  { key: 'turnarounds', usage: 'char-view' },
  { key: 'costumes', usage: 'costume' },
  { key: 'hairstyles', usage: 'hairstyle' },
  { key: 'props', usage: 'prop' },
  { key: 'expressions', usage: 'expression' },
]

function characterLibraryOf(promptId) {
  const images = imagesOf(promptId)
  const result = {}
  for (const group of CHARACTER_LIBRARY_GROUPS) {
    result[group.key] = images
      .filter((img) => img.usage === group.usage)
      .map((img) => ({ url: img.url, filePath: img.filePath ?? null, sort: img.sort ?? 0 }))
  }
  return result
}

function stepsOf(promptId) {
  return (db.steps || [])
    .filter((step) => step.promptId === promptId)
    .sort((a, b) => (a.stepOrder - b.stepOrder) || (a.id - b.id))
    .map((step) => {
      const stepImages = imagesOf(promptId, step.id)
      const platformGroups = groupImagesByPlatform(stepImages)
      return {
        id: step.id,
        stepOrder: step.stepOrder,
        name: step.name,
        actionPrompt: step.actionPrompt,
        camera: step.camera ?? null,
        seconds: step.seconds ?? null,
        transition: step.transition ?? null,
        platformGroups,
        coverImage: platformGroups[0]?.coverImage || stepImages[0]?.url || '',
      }
    })
}

/** 分类多选：优先 categoryIds，未传时回退 categoryId，兼容投稿等旧调用方 */
function resolveCategoryIds(data) {
  const raw = Array.isArray(data.categoryIds) && data.categoryIds.length ? data.categoryIds : [data.categoryId]
  return Array.from(new Set(raw.map(Number).filter((id) => Number.isFinite(id) && id > 0)))
}

/** 专题关联提示词入参：去重 + 过滤非法值 */
function relatedInputIds(data) {
  const raw = Array.isArray(data.relatedIds) ? data.relatedIds : []
  return Array.from(new Set(raw.map(Number).filter((id) => Number.isFinite(id) && id > 0)))
}

/** 回溯祖先链：返回直接父标题、层级深度和根 → 当前的正文链 */
function resolveParentChain(prompt) {
  const seen = new Set([prompt.id])
  const chain = []
  let cursor = prompt
  let depth = 0
  const directParent = prompt.parentId ? livePrompts().find((p) => p.id === Number(prompt.parentId)) : null
  const parentTitle = directParent ? directParent.title : ''
  for (let i = 0; cursor.parentId && i < MAX_CHAIN_DEPTH; i += 1) {
    const parent = livePrompts().find((p) => p.id === Number(cursor.parentId))
    if (!parent || seen.has(parent.id)) break
    seen.add(parent.id)
    depth += 1
    chain.unshift({ id: parent.id, title: parent.title, content: parent.content })
    cursor = parent
  }
  chain.push({ id: prompt.id, title: prompt.title, content: prompt.content })
  return { parentTitle, depth, chain }
}

function childrenOf(promptId) {
  return db.prompts
    .filter((p) => !p.isDeleted && Number(p.parentId) === Number(promptId))
    .sort((a, b) => a.id - b.id)
    .map((p) => {
      const imgs = imagesOf(p.id)
      const first = imgs.find((img) => img.usage === 'result') || imgs[0]
      return { id: p.id, title: p.title, status: p.status, coverImage: first ? first.url : '' }
    })
}

function parentError(data, currentId) {
  if (!data.parentId) return null
  const id = Number(data.parentId)
  if (!Number.isFinite(id) || id <= 0) return '关联的提示词无效'
  if (currentId && id === Number(currentId)) return '不能关联自己'
  const parent = findPrompt(id)
  if (!parent) return '关联的提示词不存在'
  if (parent.status !== 'published') return '只能关联已发布的提示词'
  let cursor = parent
  const seen = new Set([id])
  for (let depth = 0; cursor.parentId && depth < MAX_CHAIN_DEPTH; depth += 1) {
    const ancestorId = Number(cursor.parentId)
    if (currentId && ancestorId === Number(currentId)) return '不能关联自己的下游提示词'
    if (seen.has(ancestorId)) break
    seen.add(ancestorId)
    const ancestor = findPrompt(ancestorId)
    if (!ancestor) break
    cursor = ancestor
  }
  return null
}

function hasCategory(prompt, categoryId) {
  return resolveCategoryIds(prompt).includes(Number(categoryId))
}

/** 姿势分类树：根分类名为「姿势」，包含其所有后代；不依赖分类启用状态 */
function poseCategoryIds() {
  const ids = new Set(db.categories.filter((c) => c.name === '姿势').map((c) => c.id))
  if (!ids.size) return ids
  let expanded = true
  while (expanded) {
    expanded = false
    for (const c of db.categories) {
      if (c.parentId && ids.has(Number(c.parentId)) && !ids.has(c.id)) {
        ids.add(c.id)
        expanded = true
      }
    }
  }
  return ids
}

function isPosePrompt(prompt, poseIds = poseCategoryIds()) {
  return resolveCategoryIds(prompt).some((id) => poseIds.has(id))
}

/** 提示词数据分组：pose=姿势库，collection=提示词专题，character=角色库，null=普通提示词 */
function promptGroup(prompt, poseIds = poseCategoryIds()) {
  if (prompt.type === 'collection') return 'collection'
  if (prompt.type === 'character') return 'character'
  if (isPosePrompt(prompt, poseIds)) return 'pose'
  return null
}

function matchesScope(prompt, scope, poseIds) {
  return String(scope || '') === '' ? promptGroup(prompt, poseIds) === null : promptGroup(prompt, poseIds) === String(scope)
}

/**
 * 通用关键字匹配：标题（及可选附加字段）模糊匹配 + ID 精确匹配。
 * 关联选择器 option 的 label 为 `#${id} ${title}`，用户输入 `#35` / `35` 时应能命中 id=35 的条目。
 */
function matchesKeyword(item, keyword, extraFields = []) {
  if (!keyword) return true
  const raw = String(keyword).trim()
  const lower = raw.toLowerCase()
  if ([item.title, ...extraFields].some((value) => String(value || '').toLowerCase().includes(lower))) return true
  const idToken = raw.replace(/^#/, '').trim()
  return /^\d+$/.test(idToken) && String(item.id) === idToken
}

/** 特殊类型归属分类 ID：分类缺失时返回 null（由 ensureSpecialCategories 兜底补种） */
function specialCategoryId(type) {
  const name = SPECIAL_CATEGORY_NAMES[type]
  if (!name) return null
  const category = db.categories.find((c) => c.name === name)
  return category ? category.id : null
}

/** 全部特殊分类 ID（提示词专题 + 角色库），用于在广场/普通列表中隐藏 */
function specialCategoryIds() {
  return new Set(Object.values(SPECIAL_CATEGORY_NAMES).map((name) => db.categories.find((c) => c.name === name)?.id).filter(Boolean))
}

function decorate(prompt) {
  const category = db.categories.find((c) => c.id === prompt.categoryId)
  const categoryIds = resolveCategoryIds(prompt)
  const categoryNames = categoryIds.map((id) => {
    const item = db.categories.find((c) => c.id === id)
    return item ? item.name : ''
  })
  const images = imagesOf(prompt.id)
  const parentMeta = resolveParentChain(prompt)
  const isSequence = prompt.type === 'sequence'
  const isCharacterPose = prompt.type === 'character-pose'
  const isCollection = prompt.type === 'collection'
  const isCharacter = prompt.type === 'character'
  const steps = isSequence ? stepsOf(prompt.id) : []
  const characterPoseData = isCharacterPose ? characterPoseOf(prompt.id) : null
  const characterLibraryData = isCharacter ? characterLibraryOf(prompt.id) : null
  const relatedPrompts = isCollection ? relatedPromptsOf(prompt) : []
  const relatedBriefs = relatedPrompts.map((item) => ({ id: item.id, coverImage: item.coverImage }))
  const coverPool = isSequence && steps.length && steps[0].platformGroups.length
    ? steps[0].platformGroups[0].images
    : isCharacterPose
      ? resultImagesOf(prompt.id)
      : isCollection
        ? relatedBriefs.map((brief) => ({ isCover: 0, url: brief.coverImage })).filter((item) => item.url)
        : images
  const cover = coverPool.find((img) => img.isCover === 1) || coverPool[0]
  return {
    id: prompt.id,
    title: prompt.title,
    content: prompt.content,
    categoryId: prompt.categoryId,
    categoryIds,
    categoryNames,
    categoryName: category ? category.name : '',
    parentId: prompt.parentId ?? null,
    parentTitle: parentMeta.parentTitle,
    depth: parentMeta.depth,
    chain: parentMeta.chain,
    children: childrenOf(prompt.id),
    modelName: prompt.modelName,
    type: prompt.type || 'single',
    characterAnchor: prompt.characterAnchor ?? null,
    steps,
    characterPose: characterPoseData,
    characterLibrary: characterLibraryData,
    relatedIds: isCollection ? relatedIdsOf(prompt) : [],
    relatedPrompts,
    status: prompt.status,
    source: prompt.source,
    authorId: prompt.authorId,
    rejectReason: prompt.rejectReason ?? null,
    reviewedBy: prompt.reviewedBy ?? null,
    reviewedAt: prompt.reviewedAt ?? null,
    viewCount: prompt.viewCount || 0,
    images,
    platformGroups: platformGroupsOf(prompt.id),
    coverImage: cover ? cover.url : '',
    createdAt: prompt.createdAt,
    updatedAt: prompt.updatedAt,
  }
}

function withSocial(row, userId) {
  const author = db.users.find((u) => u.id === row.authorId)
  return {
    ...row,
    authorName: author ? author.nickname || author.username : '匿名用户',
    favoriteCount: db.favorites.filter((f) => f.promptId === row.id).length,
    isFavorited: userId ? db.favorites.some((f) => f.promptId === row.id && f.userId === userId) : false,
  }
}

// 兼容：新结构 platformGroups=[{platformId, images}]，旧结构 images=[...] 归入默认平台
function inputGroups(data) {
  const raw = Array.isArray(data.platformGroups) ? data.platformGroups : data.images
  if (!Array.isArray(raw)) return []
  return raw.some((item) => item && Array.isArray(item.images)) ? raw : [{ platformId: DEFAULT_PLATFORM_ID, images: raw }]
}

function countInputImages(data) {
  if (data.type === 'character') {
    const payload = data.characterLibrary && typeof data.characterLibrary === 'object' ? data.characterLibrary : {}
    return CHARACTER_LIBRARY_GROUPS.reduce((sum, group) => sum + (Array.isArray(payload[group.key]) ? payload[group.key].filter((img) => img && img.url).length : 0), 0)
  }
  if (data.type === 'character-pose') {
    return (Array.isArray(data.characterPose?.poses) ? data.characterPose.poses : []).reduce(
      (sum, pose) =>
        sum +
        (Array.isArray(pose.platformGroups) ? pose.platformGroups.reduce((s, g) => s + (Array.isArray(g.images) ? g.images.length : 0), 0) : 0),
      0,
    )
  }
  if (data.type === 'sequence') {
    return (Array.isArray(data.steps) ? data.steps : []).reduce(
      (sum, step) => sum + (Array.isArray(step.platformGroups) ? step.platformGroups.reduce((s, g) => s + (Array.isArray(g.images) ? g.images.length : 0), 0) : 0),
      0,
    )
  }
  return inputGroups(data).reduce((sum, group) => sum + (Array.isArray(group.images) ? group.images.length : 0), 0)
}

function replaceImages(promptId, data) {
  db.images = db.images.filter((img) => img.promptId !== promptId)
  for (const group of inputGroups(data)) {
    const platformId = Number(group.platformId) || DEFAULT_PLATFORM_ID
    const images = Array.isArray(group.images) ? group.images.slice(0, IMAGES_PER_GROUP) : []
    const explicit = images.findIndex((img) => img.isCover === true || img.isCover === 1)
    const coverIndex = explicit >= 0 ? explicit : 0
    images.forEach((img, index) => {
      db.images.push({
        id: nextId('image'),
        promptId,
        platformId,
        stepId: null,
        url: String(img.url || ''),
        filePath: img.filePath ?? null,
        sort: Number.isFinite(Number(img.sort)) ? Number(img.sort) : index,
        isCover: index === coverIndex ? 1 : 0,
      })
    })
  }
}

function replaceSteps(promptId, data) {
  db.images = db.images.filter((img) => img.promptId !== promptId)
  db.steps = (db.steps || []).filter((step) => step.promptId !== promptId)
  const steps = Array.isArray(data.steps) ? data.steps : []
  steps.forEach((step, index) => {
    const stepId = nextId('step')
    const t = nowIso()
    db.steps.push({
      id: stepId,
      promptId,
      stepOrder: Number.isFinite(Number(step.stepOrder)) && Number(step.stepOrder) > 0 ? Number(step.stepOrder) : index + 1,
      name: String(step.name || '').trim(),
      actionPrompt: String(step.actionPrompt || '').trim(),
      camera: step.camera ? String(step.camera).trim() : null,
      seconds: Number.isFinite(Number(step.seconds)) ? Number(step.seconds) : null,
      transition: step.transition ? String(step.transition).trim() : null,
      createdAt: t,
      updatedAt: t,
    })
    for (const group of Array.isArray(step.platformGroups) ? step.platformGroups : []) {
      const platformId = Number(group.platformId) || DEFAULT_PLATFORM_ID
      const images = Array.isArray(group.images) ? group.images.slice(0, IMAGES_PER_STEP_GROUP) : []
      images.forEach((img, imageIndex) => {
        db.images.push({
          id: nextId('image'),
          promptId,
          platformId,
          stepId,
          url: String(img.url || ''),
          filePath: img.filePath ?? null,
          sort: imageIndex,
          isCover: imageIndex === 0 ? 1 : 0,
        })
      })
    }
  })
}

function replaceCharacterPose(promptId, data) {
  db.images = db.images.filter((img) => img.promptId !== promptId)
  const payload = data.characterPose && typeof data.characterPose === 'object' ? data.characterPose : {}
  const character = payload.characterImage
  if (character && character.url) {
    db.images.push({
      id: nextId('image'),
      promptId,
      platformId: DEFAULT_PLATFORM_ID,
      stepId: null,
      url: String(character.url),
      filePath: character.filePath ?? null,
      sort: 0,
      isCover: 0,
      usage: 'character',
      imageKey: 'character',
    })
  }
  let firstResult = true
  ;(Array.isArray(payload.poses) ? payload.poses : []).forEach((pose, index) => {
    const key = String(pose.key || `pose-${index + 1}`)
    if (pose.poseImage && pose.poseImage.url) {
      db.images.push({
        id: nextId('image'),
        promptId,
        platformId: DEFAULT_PLATFORM_ID,
        stepId: null,
        url: String(pose.poseImage.url),
        filePath: pose.poseImage.filePath ?? null,
        sort: index,
        isCover: 0,
        usage: 'pose',
        imageKey: key,
      })
    }
    for (const group of Array.isArray(pose.platformGroups) ? pose.platformGroups : []) {
      const platformId = Number(group.platformId) || DEFAULT_PLATFORM_ID
      const images = Array.isArray(group.images) ? group.images.slice(0, IMAGES_PER_GROUP) : []
      images.forEach((img, imageIndex) => {
        db.images.push({
          id: nextId('image'),
          promptId,
          platformId,
          stepId: null,
          url: String(img.url || ''),
          filePath: img.filePath ?? null,
          sort: imageIndex,
          isCover: firstResult ? 1 : 0,
          usage: 'result',
          imageKey: key,
        })
        firstResult = false
      })
    }
  })
}

/** 角色库：按五组写入 usage 标记的图片，无平台分组概念 */
function replaceCharacterLibrary(promptId, data) {
  db.images = db.images.filter((img) => img.promptId !== promptId)
  const payload = data.characterLibrary && typeof data.characterLibrary === 'object' ? data.characterLibrary : {}
  let first = true
  for (const group of CHARACTER_LIBRARY_GROUPS) {
    const images = Array.isArray(payload[group.key]) ? payload[group.key] : []
    images.forEach((img, index) => {
      if (!img || !img.url) return
      db.images.push({
        id: nextId('image'),
        promptId,
        platformId: DEFAULT_PLATFORM_ID,
        stepId: null,
        url: String(img.url),
        filePath: img.filePath ?? null,
        sort: index,
        isCover: first ? 1 : 0,
        usage: group.usage,
        imageKey: group.usage,
      })
      first = false
    })
  }
}

function characterPoseError(data, requireGenerated) {  const payload = data.characterPose && typeof data.characterPose === 'object' ? data.characterPose : {}
  if (!payload.characterImage || !payload.characterImage.url) return '请选择角色图'
  const poses = Array.isArray(payload.poses) ? payload.poses : []
  if (!poses.length) return '请至少添加一个姿势'
  if (poses.length > IMAGES_PER_GROUP) return `最多添加 ${IMAGES_PER_GROUP} 个姿势`
  for (const [index, pose] of poses.entries()) {
    if (!pose || !pose.poseImage || !pose.poseImage.url) return `第 ${index + 1} 个姿势缺少姿势图`
    const groups = Array.isArray(pose.platformGroups) ? pose.platformGroups : []
    for (const group of groups) {
      if (!db.platforms.some((p) => p.id === Number(group.platformId) && p.status === 1)) return '所选平台不存在或已停用'
      if (Array.isArray(group.images) && group.images.length > IMAGES_PER_GROUP) return `每个平台最多上传 ${IMAGES_PER_GROUP} 张生成图`
    }
    if (requireGenerated && !groups.some((group) => Array.isArray(group.images) && group.images.length > 0)) {
      return `第 ${index + 1} 个姿势缺少对应的生成图`
    }
  }
  return null
}

function validationError(data, requireImage) {
  if (!data.title || !String(data.title).trim()) return '标题不能为空'
  // 角色库的描述可选；其余类型正文必填
  if (data.type !== 'character' && (!data.content || !String(data.content).trim())) return '提示词正文不能为空'
  if (data.type === 'collection') {
    const ids = relatedInputIds(data)
    if (!ids.length) return '请至少关联一个提示词'
    if (ids.length > MAX_RELATED_PROMPTS) return `最多关联 ${MAX_RELATED_PROMPTS} 个提示词`
    for (const id of ids) {
      const target = livePrompts().find((p) => p.id === id && p.status === 'published')
      if (!target) return '关联的提示词不存在或未发布'
      if (target.type === 'collection' || target.type === 'character') return '专题不能关联提示词专题或角色库'
    }
    return null
  }
  if (data.type === 'character') {
    const payload = data.characterLibrary && typeof data.characterLibrary === 'object' ? data.characterLibrary : {}
    for (const group of CHARACTER_LIBRARY_GROUPS) {
      const images = Array.isArray(payload[group.key]) ? payload[group.key] : []
      if (images.filter((img) => img && img.url).length > IMAGES_PER_GROUP) return `每组最多上传 ${IMAGES_PER_GROUP} 张图片`
    }
    if (requireImage && countInputImages(data) === 0) return '请至少上传一张角色资产图'
    return null
  }
  if (!data.modelName || !String(data.modelName).trim()) return '模型名称不能为空'
  const categoryIds = resolveCategoryIds(data)
  if (!categoryIds.length) return '请选择分类'
  if (categoryIds.length > MAX_CATEGORIES) return `最多选择 ${MAX_CATEGORIES} 个分类`
  if (data.type === 'character-pose') return characterPoseError(data, requireImage)
  if (data.type === 'sequence') {
    const steps = Array.isArray(data.steps) ? data.steps : []
    if (steps.length === 0) return '套组至少需要 1 个步骤'
    if (steps.length > MAX_STEPS) return `套组最多 ${MAX_STEPS} 个步骤`
    for (const [index, step] of steps.entries()) {
      if (!step.name || !String(step.name).trim()) return `第 ${index + 1} 步缺少动作名`
      if (!step.actionPrompt || !String(step.actionPrompt).trim()) return `第 ${index + 1} 步缺少动作提示词`
      for (const group of Array.isArray(step.platformGroups) ? step.platformGroups : []) {
        if (Array.isArray(group.images) && group.images.length > IMAGES_PER_STEP_GROUP) return `每步每个平台最多上传 ${IMAGES_PER_STEP_GROUP} 张效果图`
        if (!db.platforms.some((p) => p.id === Number(group.platformId) && p.status === 1)) return '所选平台不存在或已停用'
      }
    }
    if (requireImage && countInputImages(data) === 0) return '正式发布的套组必须上传至少一张效果图'
    return null
  }
  const groups = inputGroups(data)
  if (requireImage && countInputImages(data) === 0) return '正式发布的提示词必须上传至少一张效果图'
  if (groups.some((group) => Array.isArray(group.images) && group.images.length > IMAGES_PER_GROUP)) return `每个平台最多上传 ${IMAGES_PER_GROUP} 张效果图`
  const invalidPlatform = groups.find((group) => !db.platforms.some((p) => p.id === Number(group.platformId) && p.status === 1))
  if (invalidPlatform) return '所选平台不存在或已停用'
  return null
}

/**
 * 可能重复提醒（非阻断）：正文去空白后前 40 字相同即视为疑似重复。
 * 只针对有正文的普通/序列/角色姿势类型；专题与角色库正文语义不同，跳过。
 * 返回首个匹配项 { id, title }，供前端提示，不影响提交。
 */
function findSimilarPrompt(data, excludeId) {
  if (data.type === 'collection' || data.type === 'character') return null
  const key = String(data.content || '').replace(/\s+/g, '').trim().slice(0, 40)
  if (!key) return null
  return (
    livePrompts().find((p) => {
      if (excludeId != null && p.id === Number(excludeId)) return false
      const other = String(p.content || '').replace(/\s+/g, '').trim().slice(0, 40)
      return other === key
    }) || null
  )
}

/** 给 decorate 结果附加 possibleDuplicate 字段，不阻断提交 */
function withDuplicateHint(decorated, data, id) {
  const similar = findSimilarPrompt(data, id)
  if (similar) decorated.possibleDuplicate = { id: similar.id, title: similar.title }
  return decorated
}

function categoryError(data) {
  for (const id of resolveCategoryIds(data)) {
    const category = db.categories.find((c) => c.id === id)
    if (!category) return '分类不存在'
    if (category.status !== 1) return '分类已停用，请选择其他分类'
  }
  return null
}

function findPrompt(id) {
  return livePrompts().find((p) => p.id === Number(id))
}

function findOwned(id, userId) {
  return livePrompts().find((p) => p.id === Number(id) && p.authorId === userId && p.source === 'user')
}

function trimData(data) {
  const type = ['sequence', 'character-pose', 'collection', 'character'].includes(data.type) ? data.type : 'single'
  // 特殊类型强制归属固定分类（提示词专题→「提示词」，角色库→「角色库」），分类缺失时由启动迁移兜底
  const specialId = type === 'collection' || type === 'character' ? specialCategoryId(type) : null
  const categoryIds = specialId ? [specialId] : resolveCategoryIds(data)
  return {
    title: String(data.title || '').trim(),
    content: String(data.content || '').trim(),
    categoryId: categoryIds[0],
    categoryIds,
    parentId: data.parentId ? Number(data.parentId) : null,
    modelName: String(data.modelName || '').trim() || (specialId ? '通用' : ''),
    type,
    characterAnchor: data.type === 'sequence' && data.characterAnchor ? String(data.characterAnchor).trim() : null,
    ...(type === 'collection' ? { relatedIds: relatedInputIds(data) } : {}),
  }
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`)
  },
})

const allowedExt = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg']
const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase()
    if (!allowedExt.includes(ext)) return cb(new Error('仅支持 png/jpg/gif/webp/bmp/svg 图片'))
    if (file.mimetype && !file.mimetype.startsWith('image/')) return cb(new Error('仅支持图片文件'))
    cb(null, true)
  },
})

// Skills 附件：允许任意文件类型（md/zip/pdf/脚本等），大小上限独立于图片
const attachmentUpload = multer({ storage, limits: { fileSize: SKILL_FILE_MAX_BYTES } })

/**
 * 文件内容去重：按 SHA-256 内容哈希复用已有上传，避免同内容重复落盘。
 * 历史记录没有 hash 字段，不参与去重（其内容本就互不重复，已核验）。
 */
function fileSha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

/** 按内容哈希 + 大小查找可复用的已有上传（要求物理文件仍存在，避免复用裂图） */
function findReusableUpload(hash, size) {
  return (db.uploads || []).find(
    (u) => u.hash === hash && u.size === size && u.filePath && fs.existsSync(path.join(UPLOAD_DIR, u.filePath)),
  )
}

/** multer 上传：文件已落盘，命中复用则删除新文件并返回已有记录，不写 uploads、不 persist */
function registerUpload(file) {
  const buffer = fs.readFileSync(file.path)
  const hash = fileSha256(buffer)
  const existing = findReusableUpload(hash, file.size)
  if (existing) {
    try {
      fs.unlinkSync(file.path)
    } catch (_) {
      /* 删除失败不影响复用结果 */
    }
    return {
      result: { id: existing.id, url: existing.url, name: existing.name, size: existing.size, mimetype: existing.mimetype },
      reused: true,
    }
  }
  const result = {
    id: file.filename,
    url: `/uploads/${file.filename}`,
    name: file.originalname,
    size: file.size,
    mimetype: file.mimetype,
  }
  db.uploads.push({ ...result, hash, filePath: file.filename, createdAt: nowIso() })
  persist()
  return { result, reused: false }
}

function uploadHandler(req, res) {
  if (!req.file) return fail(res, '未收到图片文件', 400)
  const { result } = registerUpload(req.file)
  ok(res, result, 201)
}

// Skills 附件上传记录（复用 uploads 落盘，文案按附件调整）
function skillAttachmentHandler(req, res) {
  if (!req.file) return fail(res, '未收到附件文件', 400)
  const { result } = registerUpload(req.file)
  ok(res, result, 201)
}

const skillAttachmentFields = ['id', 'url', 'name', 'size', 'mimetype']

function normalizeSkillAttachments(value) {
  if (!Array.isArray(value)) return []
  return value
    .slice(0, MAX_SKILL_ATTACHMENTS)
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const out = {}
      for (const key of skillAttachmentFields) out[key] = item[key] ?? null
      out.id = String(out.id || out.url || '')
      out.url = String(out.url || '')
      out.name = String(out.name || out.id)
      out.size = Number(out.size) || 0
      out.mimetype = String(out.mimetype || '')
      return out
    })
    .filter((item) => item.url)
}

function publicSkill(skill) {
  return {
    id: skill.id,
    title: String(skill.title || ''),
    description: String(skill.description || ''),
    attachments: normalizeSkillAttachments(skill.attachments),
    status: skill.status,
    viewCount: Number(skill.viewCount) || 0,
    createdAt: skill.createdAt,
    updatedAt: skill.updatedAt,
  }
}

// ============ AI 推送：图片 URL / base64 归一化 ============
const AI_MIME_EXT = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/bmp': '.bmp',
  'image/svg+xml': '.svg',
}

function aiImageExt(mime, fallbackName) {
  const fromMime = AI_MIME_EXT[String(mime || '').toLowerCase().split(';')[0]]
  if (fromMime) return fromMime
  const fromName = path.extname(String(fallbackName || '')).toLowerCase()
  return ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'].includes(fromName) ? fromName : '.png'
}

function isPublicHttpUrl(value) {
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    return false
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return false
  const host = parsed.hostname.toLowerCase()
  if (host === 'localhost' || host === '::1' || host === '127.0.0.1') return false
  if (/^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false
  return true
}

function decodeAiImageData(value, mimeHint, nameHint) {
  const text = String(value || '')
  const matched = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/i.exec(text)
  const mime = (matched ? matched[1] : mimeHint || 'image/png').toLowerCase()
  const base64 = matched ? matched[2] : text
  if (!/^[A-Za-z0-9+/=\s]+$/.test(base64)) throw new Error('图片 base64 格式不正确')
  const buffer = Buffer.from(base64.replace(/\s+/g, ''), 'base64')
  if (!buffer.length) throw new Error('图片内容为空')
  return { buffer, mime, ext: aiImageExt(mime, nameHint) }
}

async function fetchAiImage(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), AI_FETCH_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'PromptPlaza-AI-Push/1.0' },
    })
    if (!response.ok) throw new Error(`图片下载失败（HTTP ${response.status}）`)
    const mime = String(response.headers.get('content-type') || '').toLowerCase()
    if (!mime.startsWith('image/')) throw new Error('图片地址返回的不是图片内容')
    const declared = Number(response.headers.get('content-length') || 0)
    if (declared > AI_IMAGE_MAX_BYTES) throw new Error('图片大小不能超过 15MB')
    const buffer = Buffer.from(await response.arrayBuffer())
    if (!buffer.length) throw new Error('图片内容为空')
    return { buffer, mime: mime.split(';')[0], ext: aiImageExt(mime, url) }
  } finally {
    clearTimeout(timer)
  }
}

async function ingestAiImage(input) {
  const item = typeof input === 'string' ? { url: input } : input
  if (!item || typeof item !== 'object') return null

  let decoded = null
  let nameHint = String(item.name || item.filename || '')
  let reused = null

  if (item.url) {
    const url = String(item.url).trim()
    if (url.startsWith('data:image/')) {
      decoded = decodeAiImageData(url, item.mimeType, nameHint)
    } else if (url.startsWith('/uploads/')) {
      const file = path.basename(url)
      const full = path.join(UPLOAD_DIR, file)
      if (!file || !fs.existsSync(full)) throw new Error(`图片不存在：${url}`)
      const stat = fs.statSync(full)
      reused = { url, filePath: file, size: stat.size, mimetype: item.mimeType || 'image/png' }
    } else if (isPublicHttpUrl(url)) {
      decoded = await fetchAiImage(url)
      nameHint = nameHint || path.basename(new URL(url).pathname)
    } else {
      throw new Error('图片地址必须是 http(s) 公网地址、data URL 或已上传的 /uploads/ 路径')
    }
  } else if (item.dataUrl) {
    decoded = decodeAiImageData(item.dataUrl, item.mimeType, nameHint)
  } else if (item.base64) {
    decoded = decodeAiImageData(item.base64, item.mimeType, nameHint)
  } else {
    return null
  }

  if (reused) return reused
  if (decoded.buffer.length > AI_IMAGE_MAX_BYTES) throw new Error('图片大小不能超过 15MB')
  const hash = fileSha256(decoded.buffer)
  const dedup = findReusableUpload(hash, decoded.buffer.length)
  if (dedup) return { url: dedup.url, filePath: dedup.filePath, size: dedup.size, mimetype: dedup.mimetype }
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${decoded.ext}`
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), decoded.buffer)
  const result = { url: `/uploads/${filename}`, filePath: filename, size: decoded.buffer.length, mimetype: decoded.mime }
  db.uploads.push({ ...result, hash, name: nameHint || filename, source: 'ai', createdAt: nowIso() })
  return result
}

async function normalizeAiGroups(data) {
  const rawGroups = Array.isArray(data.platformGroups)
    ? data.platformGroups
    : Array.isArray(data.images) || Array.isArray(data.imageUrls)
      ? [{ platformId: data.platformId || DEFAULT_PLATFORM_ID, images: [...(data.images || []), ...(data.imageUrls || [])] }]
      : []

  const groups = []
  for (const raw of rawGroups) {
    const group = raw && typeof raw === 'object' ? raw : { images: [raw] }
    const images = []
    for (const item of Array.isArray(group.images) ? group.images : []) {
      const saved = await ingestAiImage(item)
      if (saved) images.push(saved)
    }
    groups.push({ platformId: Number(group.platformId) || DEFAULT_PLATFORM_ID, images })
  }
  return groups
}

const MENU_TREE = [
  {
    id: 1,
    parentId: 0,
    name: '仪表盘',
    path: '/dashboard',
    component: 'views/Dashboard.vue',
    icon: 'DataBoard',
    type: 'M',
    sort: 0,
    status: 1,
    visible: true,
    children: [],
  },
  {
    id: 2,
    parentId: 0,
    name: '提示词平台',
    path: '/prompt-hub',
    icon: 'Collection',
    type: 'C',
    sort: 90,
    status: 1,
    visible: true,
    children: [
      {
        id: 3,
        parentId: 2,
        name: '分类管理',
        path: '/prompt-categories',
        component: 'views/prompt/PromptCategory.vue',
        icon: 'FolderOpened',
        type: 'M',
        sort: 0,
        status: 1,
        visible: true,
        children: [],
      },
      {
        id: 4,
        parentId: 2,
        name: '提示词管理',
        path: '/prompt-manage',
        component: 'views/prompt/PromptManage.vue',
        icon: 'Document',
        type: 'M',
        sort: 1,
        status: 1,
        visible: true,
        children: [],
      },
      {
        id: 5,
        parentId: 2,
        name: '投稿审核',
        path: '/prompt-reviews',
        component: 'views/prompt/PromptReview.vue',
        icon: 'Stamp',
        type: 'M',
        sort: 2,
        status: 1,
        visible: true,
        children: [],
      },
      {
        id: 6,
        parentId: 2,
        name: '平台字典',
        path: '/prompt-platforms',
        component: 'views/prompt/PromptPlatform.vue',
        icon: 'Grid',
        type: 'M',
        sort: 3,
        status: 1,
        visible: true,
        children: [],
      },
      {
        id: 7,
        parentId: 2,
        name: '姿势管理',
        path: '/pose-manage',
        component: 'views/prompt/PoseManage.vue',
        icon: 'Picture',
        type: 'M',
        sort: 4,
        status: 1,
        visible: true,
        children: [],
      },
      {
        id: 8,
        parentId: 2,
        name: '提示词专题',
        path: '/prompt-collections',
        component: 'views/prompt/CollectionManage.vue',
        icon: 'Files',
        type: 'M',
        sort: 5,
        status: 1,
        visible: true,
        children: [],
      },
      {
        id: 9,
        parentId: 2,
        name: '角色库',
        path: '/character-library',
        component: 'views/prompt/CharacterLibraryManage.vue',
        icon: 'Avatar',
        type: 'M',
        sort: 6,
        status: 1,
        visible: true,
        children: [],
      },
      {
        id: 10,
        parentId: 2,
        name: 'Skills 上传',
        path: '/skill-upload',
        component: 'views/prompt/SkillUpload.vue',
        icon: 'UploadFilled',
        type: 'M',
        sort: 7,
        status: 1,
        visible: true,
        children: [],
      },
    ],
  },
]

function flattenMenus(menus) {
  const out = []
  for (const menu of menus) {
    out.push(menu)
    if (menu.children && menu.children.length) out.push(...flattenMenus(menu.children))
  }
  return out
}

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '5mb' }))
app.use(express.urlencoded({ extended: true }))
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }))

const api = express.Router()

api.get('/health', (_req, res) => ok(res, { status: 'ok', time: nowIso() }))

api.get('/auth/captcha', (_req, res) => ok(res, { enabled: false }))

api.post('/auth/login', (req, res) => {
  const { username, password } = req.body || {}
  const user = db.users.find((u) => u.username === String(username || '').trim())
  if (!user || !user.passwordHash || !bcrypt.compareSync(String(password || ''), user.passwordHash)) return fail(res, '用户名或密码错误', 400)
  const token = setAuthCookie(res, user)
  ok(res, {
    accessToken: token,
    refreshToken: token,
    user: publicUser(user),
    roles: publicUser(user).roles,
    permissions: [],
    passwordResetRequired: false,
  })
})

api.post('/auth/token', (req, res) => {
  const user = currentUser(req)
  if (!user) return fail(res, '登录已失效', 401)
  const token = setAuthCookie(res, user)
  ok(res, { accessToken: token, passwordResetRequired: false })
})

api.delete('/auth/session', (_req, res) => {
  clearAuthCookie(res)
  ok(res, null)
})

api.get('/auth/profile', requireUser, (req, res) => ok(res, publicUser(req.user)))

api.patch('/auth/password', requireUser, (req, res) => {
  const { oldPassword, newPassword } = req.body || {}
  if (!newPassword || String(newPassword).length < 6) return fail(res, '新密码长度需至少 6 位', 400)
  if (oldPassword && !bcrypt.compareSync(String(oldPassword), req.user.passwordHash)) return fail(res, '原密码不正确', 400)
  req.user.passwordHash = bcrypt.hashSync(String(newPassword), 10)
  persist()
  ok(res, null)
})

api.post('/auth/password/forgot', (_req, res) => ok(res, null))
api.post('/auth/password/reset', (_req, res) => ok(res, null))
api.post('/auth/sse-ticket', requireUser, (_req, res) => ok(res, { ticket: crypto.randomBytes(16).toString('hex') }))

api.get('/site/info', (_req, res) =>
  ok(res, {
    title: 'AI 提示词分享平台',
    description: '发现、分享与收藏优质 AI 提示词',
    keywords: 'AI,提示词,Prompt',
    logo: '',
    favicon: '',
  }),
)
api.get('/settings', (_req, res) => ok(res, {}))
api.get('/settings/:key', (_req, res) => ok(res, null))
api.put('/settings', (_req, res) => ok(res, null))
api.get('/dashboard/stats', (_req, res) => {
  const prompts = livePrompts()
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const contributorIds = new Set(prompts.filter((p) => p.source === 'user').map((p) => p.authorId))
  ok(res, {
    promptTotal: prompts.length,
    promptPublished: prompts.filter((p) => p.status === 'published').length,
    promptPending: prompts.filter((p) => p.status === 'pending').length,
    promptSequence: prompts.filter((p) => p.type === 'sequence').length,
    userTotal: db.users.length,
    userTodayNew: db.users.filter((u) => u.createdAt && new Date(u.createdAt) >= todayStart).length,
    userActive: db.users.filter((u) => u.status === 1).length,
    userContributors: contributorIds.size,
  })
})
api.get('/notices/sse', (_req, res) => res.status(204).end())
api.get('/notices/unread/count', (_req, res) => ok(res, { count: 0, total: 0 }))
api.get('/notices', (_req, res) => ok(res, { rows: [], total: 0, items: [], unread: 0, count: 0 }))
api.get('/notices/:id', (_req, res) => ok(res, null))
api.get('/messages', (_req, res) => ok(res, { rows: [], total: 0, count: 0 }))
api.get('/messages/:id', (_req, res) => ok(res, null))
api.get('/search', (_req, res) => ok(res, []))
api.get('/upload', (_req, res) => ok(res, []))
api.get('/users', (_req, res) => ok(res, { rows: db.users.map(publicUser), total: db.users.length }))
api.get('/menus/tree', requireUser, (_req, res) => ok(res, MENU_TREE))
api.get('/menus', requireUser, (_req, res) => ok(res, flattenMenus(MENU_TREE)))

const portal = express.Router()

portal.get('/categories', (req, res) => {
  const poseIds = poseCategoryIds()
  const specialIds = specialCategoryIds()
  const scope = String(req.query.scope || '')
  const rows = db.categories
    .filter((c) => {
      if (scope === 'pose') return poseIds.has(c.id)
      if (scope === 'collection' || scope === 'character') return c.id === specialCategoryId(scope)
      return c.status === 1 && !poseIds.has(c.id) && !specialIds.has(c.id)
    })
    .sort((a, b) => a.sort - b.sort || a.id - b.id)
    .map((c) => ({ ...c, promptCount: livePrompts().filter((p) => hasCategory(p, c.id) && p.status === 'published').length }))
  ok(res, rows)
})

portal.get('/platforms', (_req, res) => {
  ok(res, db.platforms.filter((p) => p.status === 1).sort((a, b) => a.sort - b.sort || a.id - b.id))
})

// Skills 下载中心（公开）：列表只返回上架项
portal.get('/skills', (req, res) => {
  const { page, pageSize } = normalizePage(req.query)
  let rows = db.skills.filter((s) => s.status === 1).slice()
  rows = rows.filter((s) => matchesKeyword(s, req.query.keyword, [s.description]))
  rows.sort((a, b) => b.id - a.id)
  ok(res, paged(rows.map(publicSkill), page, pageSize))
})

portal.get('/skills/:id', (req, res) => {
  const skill = db.skills.find((s) => s.id === Number(req.params.id) && s.status === 1)
  if (!skill) return fail(res, 'Skills 条目不存在或已下架', 404)
  skill.viewCount = (Number(skill.viewCount) || 0) + 1
  persist()
  ok(res, publicSkill(skill))
})

// 附件下载：按记录查 uploads 定位真实文件，Content-Disposition 保留原始文件名
portal.get('/skills/:id/attachments/:attachmentId/download', (req, res) => {
  const skill = db.skills.find((s) => s.id === Number(req.params.id) && s.status === 1)
  if (!skill) return fail(res, 'Skills 条目不存在或已下架', 404)
  const attachment = normalizeSkillAttachments(skill.attachments).find((a) => a.id === String(req.params.attachmentId))
  if (!attachment) return fail(res, '附件不存在', 404)
  const file = path.basename(String(attachment.url || ''))
  const target = path.join(UPLOAD_DIR, file)
  if (!file || !fs.existsSync(target)) return fail(res, '附件文件不存在', 404)
  res.download(target, attachment.name || file)
})

// 投稿表单用：库里已有的模型名（去重排序），与后台 /prompts/model-options 口径一致
portal.get('/model-options', (_req, res) => {
  const names = Array.from(new Set(livePrompts().map((p) => String(p.modelName || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b))
  ok(res, names)
})

// 投稿表单用：可关联的已发布提示词（远程搜索），编辑时排除自身防环
portal.get('/parent-options', (req, res) => {
  const keyword = String(req.query.keyword || '').trim().toLowerCase()
  const excludeId = req.query.excludeId ? Number(req.query.excludeId) : null
  let rows = livePrompts().filter(
    (p) => p.status === 'published' && p.type !== 'collection' && p.type !== 'character' && (!excludeId || p.id !== excludeId),
  )
  rows = rows.filter((p) => matchesKeyword(p, keyword))
  rows.sort((a, b) => b.id - a.id)
  ok(res, rows.slice(0, 20).map((p) => ({ id: p.id, title: p.title })))
})

// 专题发布用：可关联提示词（带封面），排除专题与角色库自身
portal.get('/related-options', (req, res) => {
  const keyword = String(req.query.keyword || '').trim().toLowerCase()
  const excludeId = req.query.excludeId ? Number(req.query.excludeId) : null
  let rows = livePrompts().filter(
    (p) => p.status === 'published' && p.type !== 'collection' && p.type !== 'character' && (!excludeId || p.id !== excludeId),
  )
  rows = rows.filter((p) => matchesKeyword(p, keyword))
  rows.sort((a, b) => b.id - a.id)
  ok(res, rows.slice(0, 20).map((p) => relatedPromptBrief(p.id)))
})

portal.get('/prompts', (req, res) => {
  const { page, pageSize } = normalizePage(req.query)
  const q = req.query
  const poseIds = poseCategoryIds()
  let rows = livePrompts().filter((p) => p.status === 'published' && matchesScope(p, q.scope, poseIds))
  rows = rows.filter((p) => matchesKeyword(p, q.keyword, [p.content, p.modelName]))
  if (q.categoryId !== undefined && q.categoryId !== '') rows = rows.filter((p) => hasCategory(p, q.categoryId))
  if (q.sort === 'popular') rows.sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0) || b.id - a.id)
  else rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || b.id - a.id)
  const uid = currentUser(req) ? currentUser(req).id : undefined
  ok(res, paged(rows.map((p) => withSocial(decorate(p), uid)), page, pageSize))
})

portal.get('/prompts/:id/related', (req, res) => {
  const current = livePrompts().find((p) => p.id === Number(req.params.id) && p.status === 'published')
  if (!current) return ok(res, [])
  const rows = livePrompts()
    .filter((p) => hasCategory(p, current.categoryId) && p.status === 'published' && p.id !== current.id)
    .sort((a, b) => (b.viewCount || 0) - (a.viewCount || 0) || b.id - a.id)
    .slice(0, 4)
  const uid = currentUser(req) ? currentUser(req).id : undefined
  ok(res, rows.map((p) => withSocial(decorate(p), uid)))
})

portal.get('/prompts/:id', (req, res) => {
  const prompt = livePrompts().find((p) => p.id === Number(req.params.id) && p.status === 'published')
  if (!prompt) return fail(res, '提示词不存在或已下架', 404)
  prompt.viewCount = (prompt.viewCount || 0) + 1
  persist()
  const uid = currentUser(req) ? currentUser(req).id : undefined
  ok(res, withSocial(decorate(prompt), uid))
})

portal.post('/auth/register', (req, res) => {
  const data = req.body || {}
  const username = String(data.username || '').trim()
  const password = String(data.password || '')
  const nickname = String(data.nickname || '').trim() || username
  const email = String(data.email || '').trim() || `${username}@portal.local`
  if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) return fail(res, '用户名需为 3-30 位字母、数字或下划线', 400)
  if (password.length < 6 || password.length > 64) return fail(res, '密码长度需为 6-64 位', 400)
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(res, '邮箱格式不正确', 400)
  if (db.users.some((u) => u.username === username || u.email === email)) return fail(res, '用户名或邮箱已被占用', 409)
  const user = {
    id: nextId('user'),
    username,
    nickname,
    email,
    passwordHash: bcrypt.hashSync(password, 10),
    role: 'user',
    status: 1,
    createdAt: nowIso(),
  }
  db.users.push(user)
  persist()
  ok(res, { id: user.id, username: user.username, nickname: user.nickname }, 201)
})

portal.use(requireUser)

portal.post('/upload-image', upload.single('file'), uploadHandler)

portal.get('/mine', (req, res) => {
  const { page, pageSize } = normalizePage(req.query)
  let rows = livePrompts().filter((p) => p.authorId === req.user.id && p.source === 'user')
  if (req.query.status) rows = rows.filter((p) => p.status === req.query.status)
  rows = rows.filter((p) => matchesKeyword(p, req.query.keyword))
  rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || b.id - a.id)
  ok(res, paged(rows.map(decorate), page, pageSize))
})

portal.get('/mine/:id', (req, res) => {
  const prompt = findOwned(req.params.id, req.user.id)
  if (!prompt) return fail(res, '投稿不存在', 404)
  ok(res, decorate(prompt))
})

portal.post('/mine', (req, res) => {
  const data = req.body || {}
  const submitting = data.submit === true
  const skipCategoryCheck = data.type === 'collection' || data.type === 'character'
  const err = validationError(data, submitting) || (skipCategoryCheck ? null : categoryError(data)) || parentError(data)
  if (err) return fail(res, err, 400)
  const fields = trimData(data)
  const prompt = {
    id: nextId('prompt'),
    ...fields,
    status: submitting ? 'pending' : 'draft',
    source: 'user',
    authorId: req.user.id,
    rejectReason: null,
    reviewedBy: null,
    reviewedAt: null,
    viewCount: 0,
    isDeleted: 0,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
  db.prompts.push(prompt)
  writePromptImages(prompt.id, data)
  persist()
  ok(res, withDuplicateHint(decorate(prompt), data, prompt.id), 201)
})

portal.put('/mine/:id', (req, res) => {
  const prompt = findOwned(req.params.id, req.user.id)
  if (!prompt) return fail(res, '投稿不存在', 404)
  if (prompt.status !== 'draft' && prompt.status !== 'rejected') return fail(res, '只有草稿或被驳回的投稿可以修改', 400)
  const data = req.body || {}
  const submitting = data.submit === true
  const existing = imagesOf(prompt.id).length
  const hasImagePayload = data.platformGroups !== undefined || data.images !== undefined || data.steps !== undefined || data.characterLibrary !== undefined
  const willHaveImages = hasImagePayload ? countInputImages(data) > 0 : existing > 0
  if (submitting && !willHaveImages && data.type !== 'collection') return fail(res, '提交审核必须上传至少一张效果图', 400)
  const skipCategoryCheck = data.type === 'collection' || data.type === 'character'
  const err = validationError(data, false) || (skipCategoryCheck ? null : categoryError(data)) || parentError(data, prompt.id)
  if (err) return fail(res, err, 400)
  Object.assign(prompt, trimData(data), {
    status: submitting ? 'pending' : prompt.status,
    rejectReason: submitting ? null : prompt.rejectReason,
    reviewedBy: submitting ? null : prompt.reviewedBy,
    reviewedAt: submitting ? null : prompt.reviewedAt,
    updatedAt: nowIso(),
  })
  writePromptImages(prompt.id, data)
  persist()
  ok(res, withDuplicateHint(decorate(prompt), data, prompt.id))
})

portal.post('/mine/:id/submit', (req, res) => {
  const prompt = findOwned(req.params.id, req.user.id)
  if (!prompt) return fail(res, '投稿不存在', 404)
  if (prompt.status !== 'draft' && prompt.status !== 'rejected') return fail(res, '只有草稿或被驳回的投稿可以提交', 400)
  if (!hasPromptResultImages(prompt)) return fail(res, '没有效果图，无法提交审核', 400)
  Object.assign(prompt, { status: 'pending', rejectReason: null, reviewedBy: null, reviewedAt: null, updatedAt: nowIso() })
  persist()
  ok(res, decorate(prompt))
})

portal.delete('/mine/:id', (req, res) => {
  const prompt = findOwned(req.params.id, req.user.id)
  if (!prompt) return fail(res, '投稿不存在', 404)
  if (prompt.status === 'published') return fail(res, '已发布的投稿请联系管理员下架后再删除', 400)
  prompt.isDeleted = 1
  prompt.status = 'offline'
  prompt.updatedAt = nowIso()
  persist()
  ok(res, null)
})

portal.get('/favorites', (req, res) => {
  const { page, pageSize } = normalizePage(req.query)
  const records = db.favorites
    .filter((f) => f.userId === req.user.id)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || b.id - a.id)
  const rows = records
    .map((f) => livePrompts().find((p) => p.id === f.promptId && p.status === 'published'))
    .filter(Boolean)
    .map((p) => ({ ...decorate(p), isFavorited: true }))
  ok(res, paged(rows, page, pageSize))
})

portal.post('/favorites/:promptId', (req, res) => {
  const prompt = livePrompts().find((p) => p.id === Number(req.params.promptId) && p.status === 'published')
  if (!prompt) return fail(res, '提示词不存在或已下架', 404)
  if (!db.favorites.some((f) => f.userId === req.user.id && f.promptId === prompt.id)) {
    db.favorites.push({ id: nextId('favorite'), userId: req.user.id, promptId: prompt.id, createdAt: nowIso() })
    persist()
  }
  ok(res, { favorited: true }, 201)
})

portal.delete('/favorites/:promptId', (req, res) => {
  const before = db.favorites.length
  db.favorites = db.favorites.filter((f) => !(f.userId === req.user.id && f.promptId === Number(req.params.promptId)))
  if (db.favorites.length !== before) persist()
  ok(res, { favorited: false })
})

api.use('/portal', portal)

const admin = express.Router()
admin.use(requireAdmin)

admin.post('/upload-image', upload.single('file'), uploadHandler)

// ============ Skills 下载中心（后台管理） ============
admin.post('/skills/upload-attachment', attachmentUpload.single('file'), skillAttachmentHandler)

admin.get('/skills', (req, res) => {
  const { page, pageSize } = normalizePage(req.query)
  let rows = db.skills.slice()
  rows = rows.filter((s) => matchesKeyword(s, req.query.keyword, [s.description]))
  rows.sort((a, b) => b.id - a.id)
  ok(res, paged(rows.map(publicSkill), page, pageSize))
})

admin.get('/skills/:id', (req, res) => {
  const skill = db.skills.find((s) => s.id === Number(req.params.id))
  if (!skill) return fail(res, 'Skills 条目不存在', 404)
  ok(res, publicSkill(skill))
})

admin.post('/skills', (req, res) => {
  const data = req.body || {}
  const title = String(data.title || '').trim()
  if (!title) return fail(res, '标题不能为空', 400)
  const attachments = normalizeSkillAttachments(data.attachments)
  if (!attachments.length) return fail(res, '请至少上传一个附件', 400)
  const skill = {
    id: nextId('skill'),
    title,
    description: String(data.description || '').trim(),
    attachments,
    status: data.status === 0 ? 0 : 1,
    viewCount: 0,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
  db.skills.push(skill)
  persist()
  ok(res, publicSkill(skill), 201)
})

admin.put('/skills/:id', (req, res) => {
  const skill = db.skills.find((s) => s.id === Number(req.params.id))
  if (!skill) return fail(res, 'Skills 条目不存在', 404)
  const data = req.body || {}
  const title = String(data.title || '').trim()
  if (!title) return fail(res, '标题不能为空', 400)
  const attachments = normalizeSkillAttachments(data.attachments)
  if (!attachments.length) return fail(res, '请至少上传一个附件', 400)
  skill.title = title
  skill.description = String(data.description || '').trim()
  skill.attachments = attachments
  if (data.status === 0 || data.status === 1) skill.status = data.status
  skill.updatedAt = nowIso()
  persist()
  ok(res, publicSkill(skill))
})

admin.delete('/skills/:id', (req, res) => {
  const index = db.skills.findIndex((s) => s.id === Number(req.params.id))
  if (index < 0) return fail(res, 'Skills 条目不存在', 404)
  db.skills.splice(index, 1)
  persist()
  ok(res, null)
})

admin.get('/categories/options', (req, res) => {
  const poseIds = poseCategoryIds()
  const specialIds = specialCategoryIds()
  const scope = String(req.query.scope || '')
  ok(
    res,
    db.categories
      .filter((c) => {
        if (scope === 'pose') return poseIds.has(c.id)
        if (scope === 'collection' || scope === 'character') return c.id === specialCategoryId(scope)
        return c.status === 1 && !poseIds.has(c.id) && !specialIds.has(c.id)
      })
      .sort((a, b) => a.sort - b.sort || a.id - b.id),
  )
})

admin.get('/categories', (req, res) => {
  const { page, pageSize } = normalizePage(req.query)
  let rows = db.categories.slice()
  if (req.query.keyword) {
    const k = String(req.query.keyword).toLowerCase()
    rows = rows.filter((c) => String(c.name).toLowerCase().includes(k))
  }
  if (req.query.status !== undefined && req.query.status !== '') rows = rows.filter((c) => c.status === Number(req.query.status))
  rows.sort((a, b) => a.sort - b.sort || a.id - b.id)
  const decorated = rows.map((c) => ({ ...c, promptCount: livePrompts().filter((p) => hasCategory(p, c.id)).length }))
  ok(res, paged(decorated, page, pageSize))
})

admin.post('/categories', (req, res) => {
  const data = req.body || {}
  const name = String(data.name || '').trim()
  if (!name) return fail(res, '分类名称不能为空', 400)
  if (db.categories.some((c) => c.name === name)) return fail(res, '分类名称已存在', 400)
  const parent = parentCategoryFor(data)
  if (typeof parent === 'string') return fail(res, parent, 400)
  const category = {
    id: nextId('category'),
    name,
    description: data.description ?? null,
    sort: Number.isFinite(Number(data.sort)) ? Number(data.sort) : 0,
    status: data.status === undefined ? 1 : Number(data.status),
    parentId: parent === null ? null : parent.id,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
  db.categories.push(category)
  persist()
  ok(res, { ...category, promptCount: 0 }, 201)
})

/** 校验并解析分类父节点：返回分类对象、null（顶级）或错误文案 */
function parentCategoryFor(data) {
  if (data.parentId === undefined || data.parentId === null || data.parentId === '') return null
  const id = Number(data.parentId)
  if (!Number.isFinite(id) || id <= 0) return '目标分类无效'
  const parent = db.categories.find((c) => c.id === id)
  if (!parent) return '目标分类不存在'
  if (parent.parentId) return '只能并入一级分类（最多两级）'
  return parent
}

admin.put('/categories/:id', (req, res) => {
  const category = db.categories.find((c) => c.id === Number(req.params.id))
  if (!category) return fail(res, '分类不存在', 404)
  const data = req.body || {}
  if (data.name !== undefined) {
    const name = String(data.name).trim()
    if (!name) return fail(res, '分类名称不能为空', 400)
    if (db.categories.some((c) => c.name === name && c.id !== category.id)) return fail(res, '分类名称已存在', 400)
    category.name = name
  }
  if (data.description !== undefined) category.description = data.description
  if (data.sort !== undefined) category.sort = Number(data.sort)
  if (data.status !== undefined) category.status = Number(data.status)
  if (data.parentId !== undefined) {
    if (data.parentId === null || data.parentId === '') {
      category.parentId = null
    } else {
      const parent = parentCategoryFor(data)
      if (typeof parent === 'string') return fail(res, parent, 400)
      if (!parent) return fail(res, '目标分类无效', 400)
      if (parent.id === category.id) return fail(res, '不能并入自身', 400)
      // 已含子分类的分类不能再并入其他分类，否则会出现三级层级
      if (db.categories.some((c) => c.parentId === category.id)) return fail(res, '该分类包含子分类，不能并入其他分类', 400)
      if (category.parentId === parent.id) return fail(res, '该分类已在此分类下', 400)
      category.parentId = parent.id
    }
  }
  category.updatedAt = nowIso()
  persist()
  ok(res, { ...category, promptCount: livePrompts().filter((p) => hasCategory(p, category.id)).length })
})

admin.delete('/categories/:id', (req, res) => {
  const id = Number(req.params.id)
  const category = db.categories.find((c) => c.id === id)
  if (!category) return fail(res, '分类不存在', 404)
  const referenced = livePrompts().filter((p) => hasCategory(p, id)).length
  if (referenced > 0) return fail(res, `该分类下还有 ${referenced} 条提示词，请先迁移或停用该分类`, 409)
  db.categories = db.categories.filter((c) => c.id !== id)
  persist()
  ok(res, null)
})

admin.get('/platforms/options', (_req, res) =>
  ok(res, db.platforms.filter((p) => p.status === 1).sort((a, b) => a.sort - b.sort || a.id - b.id)),
)

admin.get('/platforms', (req, res) => {
  const { page, pageSize } = normalizePage(req.query)
  let rows = db.platforms.slice()
  if (req.query.keyword) {
    const k = String(req.query.keyword).toLowerCase()
    rows = rows.filter((p) => String(p.name).toLowerCase().includes(k))
  }
  if (req.query.status !== undefined && req.query.status !== '') rows = rows.filter((p) => p.status === Number(req.query.status))
  rows.sort((a, b) => a.sort - b.sort || a.id - b.id)
  const decorated = rows.map((p) => ({
    ...p,
    promptCount: db.prompts.filter((prompt) => !prompt.isDeleted && db.images.some((img) => img.promptId === prompt.id && img.platformId === p.id)).length,
    imageCount: db.images.filter((img) => img.platformId === p.id).length,
  }))
  ok(res, paged(decorated, page, pageSize))
})

admin.post('/platforms', (req, res) => {
  const data = req.body || {}
  const name = String(data.name || '').trim()
  if (!name) return fail(res, '平台名称不能为空', 400)
  if (db.platforms.some((p) => p.name === name)) return fail(res, '平台名称已存在', 400)
  const platform = {
    id: nextId('platform'),
    name,
    sort: Number.isFinite(Number(data.sort)) ? Number(data.sort) : db.platforms.length,
    status: data.status === undefined ? 1 : Number(data.status),
    builtin: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
  db.platforms.push(platform)
  persist()
  ok(res, { ...platform, promptCount: 0, imageCount: 0 }, 201)
})

admin.put('/platforms/:id', (req, res) => {
  const platform = db.platforms.find((p) => p.id === Number(req.params.id))
  if (!platform) return fail(res, '平台不存在', 404)
  const data = req.body || {}
  if (data.name !== undefined) {
    const name = String(data.name).trim()
    if (!name) return fail(res, '平台名称不能为空', 400)
    if (db.platforms.some((p) => p.name === name && p.id !== platform.id)) return fail(res, '平台名称已存在', 400)
    platform.name = name
  }
  if (data.sort !== undefined) platform.sort = Number(data.sort)
  if (data.status !== undefined) {
    if (platform.builtin && Number(data.status) !== 1) return fail(res, '默认平台不能停用', 400)
    platform.status = Number(data.status)
  }
  platform.updatedAt = nowIso()
  persist()
  ok(res, platform)
})

admin.delete('/platforms/:id', (req, res) => {
  const id = Number(req.params.id)
  const platform = db.platforms.find((p) => p.id === id)
  if (!platform) return fail(res, '平台不存在', 404)
  if (platform.builtin) return fail(res, '默认平台不能删除', 400)
  const used = db.images.filter((img) => img.platformId === id).length
  if (used > 0) return fail(res, `该平台下还有 ${used} 张效果图，请先迁移或删除后再删除`, 409)
  db.platforms = db.platforms.filter((p) => p.id !== id)
  persist()
  ok(res, null)
})

admin.get('/prompts', (req, res) => {
  const { page, pageSize } = normalizePage(req.query)
  const poseIds = poseCategoryIds()
  let rows = livePrompts().filter((p) => matchesScope(p, req.query.scope, poseIds))
  rows = rows.filter((p) => matchesKeyword(p, req.query.keyword))
  if (req.query.categoryId !== undefined && req.query.categoryId !== '') rows = rows.filter((p) => hasCategory(p, req.query.categoryId))
  if (req.query.status) rows = rows.filter((p) => p.status === req.query.status)
  if (req.query.source) rows = rows.filter((p) => p.source === req.query.source)
  rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || b.id - a.id)
  ok(res, paged(rows.map(decorate), page, pageSize))
})

admin.get('/prompts/model-options', (_req, res) => {
  const names = Array.from(new Set(livePrompts().map((p) => String(p.modelName || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b))
  ok(res, names)
})

admin.get('/prompts/parent-options', (req, res) => {
  const keyword = String(req.query.keyword || '').trim().toLowerCase()
  const excludeId = req.query.excludeId ? Number(req.query.excludeId) : null
  const poseIds = poseCategoryIds()
  let rows = livePrompts().filter((p) => {
    if (p.status !== 'published' || (excludeId && p.id === excludeId)) return false
    // 专题与角色库不能作为派生来源
    if (p.type === 'collection' || p.type === 'character') return false
    const group = promptGroup(p, poseIds)
    return String(req.query.scope || '') === 'pose' ? group === 'pose' : group === null
  })
  rows = rows.filter((p) => matchesKeyword(p, keyword))
  rows.sort((a, b) => b.id - a.id)
  ok(res, rows.slice(0, 20).map((p) => ({ id: p.id, title: p.title })))
})

// 专题/角色库选择资产用：返回带封面的可关联提示词（排除专题与角色库自身）
admin.get('/prompts/related-options', (req, res) => {
  const keyword = String(req.query.keyword || '').trim().toLowerCase()
  const excludeId = req.query.excludeId ? Number(req.query.excludeId) : null
  let rows = livePrompts().filter(
    (p) => p.status === 'published' && p.type !== 'collection' && p.type !== 'character' && (!excludeId || p.id !== excludeId),
  )
  rows = rows.filter((p) => matchesKeyword(p, keyword))
  rows.sort((a, b) => b.id - a.id)
  ok(res, rows.slice(0, 20).map((p) => relatedPromptBrief(p.id)))
})

admin.get('/prompts/:id', (req, res) => {
  const prompt = findPrompt(req.params.id)
  if (!prompt) return fail(res, '提示词不存在', 404)
  ok(res, decorate(prompt))
})

admin.post('/prompts', (req, res) => {
  const data = req.body || {}
  const publishing = data.action === 'publish'
  // 专题/角色库的分类由服务端强制归属，跳过用户传入分类的校验
  const skipCategoryCheck = data.type === 'collection' || data.type === 'character'
  const err = validationError(data, publishing) || (skipCategoryCheck ? null : categoryError(data)) || parentError(data)
  if (err) return fail(res, err, 400)
  const prompt = {
    id: nextId('prompt'),
    ...trimData(data),
    status: publishing ? 'published' : 'draft',
    source: 'admin',
    authorId: req.user.id,
    rejectReason: null,
    reviewedBy: null,
    reviewedAt: null,
    viewCount: 0,
    isDeleted: 0,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
  db.prompts.push(prompt)
  writePromptImages(prompt.id, data)
  persist()
  ok(res, withDuplicateHint(decorate(prompt), data, prompt.id), 201)
})

admin.put('/prompts/:id', (req, res) => {
  const prompt = findPrompt(req.params.id)
  if (!prompt) return fail(res, '提示词不存在', 404)
  const data = req.body || {}
  const publishing = data.action === 'publish'
  const hasImagePayload = data.platformGroups !== undefined || data.images !== undefined || data.steps !== undefined || data.characterPose !== undefined || data.characterLibrary !== undefined
  const willHaveImages = hasImagePayload ? countInputImages(data) > 0 : hasPromptResultImages(prompt)
  if (publishing && !willHaveImages) return fail(res, '正式发布的提示词必须上传至少一张效果图', 400)
  const skipCategoryCheck = data.type === 'collection' || data.type === 'character'
  const err = validationError(data, false) || (skipCategoryCheck ? null : categoryError(data)) || parentError(data, prompt.id)
  if (err) return fail(res, err, 400)
  Object.assign(prompt, trimData(data), {
    status: publishing ? 'published' : prompt.status,
    rejectReason: publishing ? null : prompt.rejectReason,
    updatedAt: nowIso(),
  })
  writePromptImages(prompt.id, data)
  persist()
  ok(res, withDuplicateHint(decorate(prompt), data, prompt.id))
})

admin.post('/prompts/:id/publish', (req, res) => {
  const prompt = findPrompt(req.params.id)
  if (!prompt) return fail(res, '提示词不存在', 404)
  if (!hasPromptResultImages(prompt)) return fail(res, '没有效果图，无法发布', 400)
  Object.assign(prompt, { status: 'published', rejectReason: null, updatedAt: nowIso() })
  persist()
  ok(res, decorate(prompt))
})

admin.post('/prompts/:id/offline', (req, res) => {
  const prompt = findPrompt(req.params.id)
  if (!prompt) return fail(res, '提示词不存在', 404)
  Object.assign(prompt, { status: 'offline', updatedAt: nowIso() })
  persist()
  ok(res, decorate(prompt))
})

admin.delete('/prompts/:id', (req, res) => {
  const prompt = findPrompt(req.params.id)
  if (!prompt) return fail(res, '提示词不存在', 404)
  prompt.isDeleted = 1
  prompt.status = 'offline'
  prompt.updatedAt = nowIso()
  persist()
  ok(res, null)
})

// 批量删除：与单条删除同为软删除，跳过不存在或已删除的条目
admin.post('/prompts/batch-delete', (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? [...new Set(req.body.ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))] : []
  if (!ids.length) return fail(res, '请提供要删除的提示词 ID', 400)
  let deleted = 0
  for (const prompt of db.prompts) {
    if (ids.includes(prompt.id) && !prompt.isDeleted) {
      prompt.isDeleted = 1
      prompt.status = 'offline'
      prompt.updatedAt = nowIso()
      deleted += 1
    }
  }
  if (deleted) persist()
  ok(res, { deleted })
})

admin.get('/reviews', (req, res) => {
  const { page, pageSize } = normalizePage(req.query)
  const rows = livePrompts()
    .filter((p) => p.status === 'pending' && p.source === 'user')
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || b.id - a.id)
  ok(res, paged(rows.map(decorate), page, pageSize))
})

admin.post('/reviews/:id/approve', (req, res) => {
  const prompt = livePrompts().find((p) => p.id === Number(req.params.id))
  if (!prompt) return fail(res, '投稿不存在', 404)
  if (prompt.status !== 'pending') return fail(res, '该投稿不是待审核状态', 400)
  if (!hasPromptResultImages(prompt)) return fail(res, '投稿缺少效果图，无法通过审核', 400)
  Object.assign(prompt, {
    status: 'published',
    rejectReason: null,
    reviewedBy: req.user.id,
    reviewedAt: nowIso(),
    updatedAt: nowIso(),
  })
  persist()
  ok(res, decorate(prompt))
})

admin.post('/reviews/:id/reject', (req, res) => {
  const prompt = livePrompts().find((p) => p.id === Number(req.params.id))
  if (!prompt) return fail(res, '投稿不存在', 404)
  if (prompt.status !== 'pending') return fail(res, '该投稿不是待审核状态', 400)
  const reason = String((req.body || {}).reason || '').trim()
  if (!reason) return fail(res, '驳回理由不能为空', 400)
  Object.assign(prompt, {
    status: 'rejected',
    rejectReason: reason,
    reviewedBy: req.user.id,
    reviewedAt: nowIso(),
    updatedAt: nowIso(),
  })
  persist()
  ok(res, decorate(prompt))
})

admin.get('/stats', (req, res) => {
  const poseIds = poseCategoryIds()
  const rows = livePrompts().filter((p) => matchesScope(p, req.query.scope, poseIds))
  ok(res, {
    total: rows.length,
    published: rows.filter((p) => p.status === 'published').length,
    pending: rows.filter((p) => p.status === 'pending').length,
    offline: rows.filter((p) => p.status === 'offline').length,
    categories: db.categories.filter((c) => c.status === 1).length,
    favorites: db.favorites.length,
  })
})

// AI 推送密钥：仅管理员可查看/轮换，前端设置页使用
admin.get('/integrations/key', (_req, res) => {
  ensureIntegrationData(db)
  ok(res, publicApiKey(db.apiKeys[0]))
})

admin.post('/integrations/key/rotate', (_req, res) => {
  ensureIntegrationData(db)
  const record = rotateApiKey()
  if (!record) return fail(res, 'AI 推送密钥不存在', 404)
  persist()
  ok(res, publicApiKey(record))
})

admin.put('/integrations/key/status', (req, res) => {
  ensureIntegrationData(db)
  const record = db.apiKeys[0]
  if (!record) return fail(res, 'AI 推送密钥不存在', 404)
  const status = Number(req.body?.status)
  if (status !== 0 && status !== 1) return fail(res, '状态值不合法', 400)
  record.status = status
  persist()
  ok(res, publicApiKey(record))
})

// 数据备份：发布前把线上真实数据导出，避免本地构建产物覆盖线上维护内容
admin.get('/data/export', (_req, res) => {
  persist()
  ok(res, JSON.parse(JSON.stringify(db)))
})

// 数据恢复：仅管理员可调用，严格校验结构后原子写盘
admin.post('/data/import', (req, res) => {
  const incoming = req.body && typeof req.body === 'object' ? req.body.data || req.body : null
  if (!validDbSnapshot(incoming)) {
    return fail(res, '备份数据结构不合法', 400)
  }
  const backupFile = `${DB_FILE}.before-import-${Date.now()}.bak`
  try {
    fs.copyFileSync(DB_FILE, backupFile)
    db = incoming
    db.seq = db.seq || {}
    ensureIntegrationData(db)
    ensureSkills(db)
    persist()
    ok(res, { imported: true, prompts: db.prompts.length })
  } catch (err) {
    return fail(res, '数据恢复失败：' + err.message, 500)
  }
})

// 备份列表：供排查与一键回滚
admin.get('/data/backups', (_req, res) => {
  const rows = listBackups()
  ok(res, { backups: rows, current: { prompts: db.prompts.length, users: db.users.length } })
})

// 从滚动备份恢复指定快照
admin.post('/data/backups/:name/restore', (req, res) => {
  const name = String(req.params.name || '')
  if (!/^db-[\w-]+\.json$/.test(name)) return fail(res, '备份文件名不合法', 400)
  const file = path.join(BACKUP_DIR, name)
  if (!fs.existsSync(file)) return fail(res, '备份不存在', 404)
  try {
    const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (!validDbSnapshot(snapshot)) return fail(res, '备份数据结构不合法', 400)
    fs.copyFileSync(DB_FILE, `${DB_FILE}.before-restore-${Date.now()}.bak`)
    db = snapshot
    db.seq = db.seq || {}
    ensureIntegrationData(db)
    ensureSkills(db)
    persist()
    ok(res, { restored: name, prompts: db.prompts.length })
  } catch (err) {
    return fail(res, '备份恢复失败：' + err.message, 500)
  }
})

// ============ AI 推送接口（X-API-Key 鉴权，仅创建/发布） ============
const integration = express.Router()
integration.use(requireApiKey)

integration.get('/categories', (_req, res) => {
  const poseIds = poseCategoryIds()
  const rows = db.categories
    .filter((c) => c.status === 1 && !poseIds.has(c.id))
    .sort((a, b) => a.sort - b.sort || a.id - b.id)
    .map((c) => ({ id: c.id, name: c.name }))
  ok(res, rows)
})

integration.get('/prompts/:id', (req, res) => {
  const prompt = db.prompts.find((p) => p.id === Number(req.params.id) && p.source === 'ai' && !p.isDeleted)
  if (!prompt) return fail(res, '提示词不存在', 404)
  ok(res, decorate(prompt))
})

integration.post('/prompts', async (req, res) => {
  const data = req.body && typeof req.body === 'object' ? req.body : {}
  if (data.type && data.type !== 'single') return fail(res, 'AI 推送仅支持单条提示词（single）', 400)

  const idempotencyKey = String(data.idempotencyKey || '').trim().slice(0, 128)
  if (idempotencyKey) {
    const existingCall = (db.integrationCalls || []).find((call) => call.apiKeyId === req.apiKey.id && call.idempotencyKey === idempotencyKey)
    if (existingCall) {
      const existing = db.prompts.find((p) => p.id === existingCall.promptId && !p.isDeleted)
      if (existing) return ok(res, { ...decorate(existing), idempotent: true }, 200, 'duplicate')
    }
  }

  try {
    const groups = await normalizeAiGroups(data)
    const payload = { ...data, type: 'single', platformGroups: groups, images: undefined, imageUrls: undefined }
    const status = data.status === 'pending' ? 'pending' : 'published'
    const err = validationError(payload, status === 'published') || categoryError(payload) || parentError(payload)
    if (err) return fail(res, err, 400)

    const admin = (db.users || []).find((u) => u.role === 'admin' && u.status === 1)
    const prompt = {
      id: nextId('prompt'),
      ...trimData(payload),
      type: 'single',
      status,
      source: 'ai',
      authorId: req.apiKey.createdBy || (admin ? admin.id : 1),
      rejectReason: null,
      reviewedBy: null,
      reviewedAt: null,
      viewCount: 0,
      isDeleted: 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }
    db.prompts.push(prompt)
    replaceImages(prompt.id, payload)
    if (idempotencyKey) {
      db.integrationCalls.push({
        id: nextId('integrationCall'),
        apiKeyId: req.apiKey.id,
        idempotencyKey,
        promptId: prompt.id,
        createdAt: nowIso(),
      })
    }
    persist()
    ok(res, { ...decorate(prompt), idempotent: false }, 201)
  } catch (err) {
    fail(res, err.message || 'AI 推送失败', 400)
  }
})

api.use('/integrations', integration)
api.use('/prompt', admin)
api.use((_req, res) => fail(res, '接口不存在', 404))
app.use('/api/v1', api)

app.use(express.static(CLIENT_DIR, { index: false, maxAge: '1h' }))
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return fail(res, '资源不存在', 404)
  res.sendFile(path.join(CLIENT_DIR, 'index.html'))
})

app.use((err, _req, res, _next) => {
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 400 : 500)
  const message = err.code === 'LIMIT_FILE_SIZE' ? '图片大小不能超过 15MB' : err.message || '服务器内部错误'
  fail(res, message, status)
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`prompt-cloud listening on 0.0.0.0:${PORT}`)
})
