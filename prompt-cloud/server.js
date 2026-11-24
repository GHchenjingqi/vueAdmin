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
const MAX_CHAIN_DEPTH = 20
const DEFAULT_PLATFORM_ID = 1
const DEFAULT_PLATFORM_NAMES = ['通用', '即梦', '可灵', 'GPT', 'Midjourney', 'Stable Diffusion', '通义万相']

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
  if (demoMigrated || platformMigrated || sequenceMigrated || !loaded) {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8')
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
  return groupImagesByPlatform(imagesOf(promptId))
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
      const first = imagesOf(p.id)[0]
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
  const steps = isSequence ? stepsOf(prompt.id) : []
  const coverPool = isSequence && steps.length && steps[0].platformGroups.length ? steps[0].platformGroups[0].images : images
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

function validationError(data, requireImage) {
  if (!data.title || !String(data.title).trim()) return '标题不能为空'
  if (!data.content || !String(data.content).trim()) return '提示词正文不能为空'
  if (!data.modelName || !String(data.modelName).trim()) return '模型名称不能为空'
  const categoryIds = resolveCategoryIds(data)
  if (!categoryIds.length) return '请选择分类'
  if (categoryIds.length > MAX_CATEGORIES) return `最多选择 ${MAX_CATEGORIES} 个分类`
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
  return {
    title: String(data.title || '').trim(),
    content: String(data.content || '').trim(),
    categoryId: resolveCategoryIds(data)[0],
    categoryIds: resolveCategoryIds(data),
    parentId: data.parentId ? Number(data.parentId) : null,
    modelName: String(data.modelName || '').trim(),
    type: data.type === 'sequence' ? 'sequence' : 'single',
    characterAnchor: data.type === 'sequence' && data.characterAnchor ? String(data.characterAnchor).trim() : null,
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

function uploadHandler(req, res) {
  if (!req.file) return fail(res, '未收到图片文件', 400)
  const url = `/uploads/${req.file.filename}`
  const result = {
    id: req.file.filename,
    url,
    name: req.file.originalname,
    size: req.file.size,
    mimetype: req.file.mimetype,
  }
  db.uploads.push({ ...result, filePath: req.file.filename, createdAt: nowIso() })
  persist()
  ok(res, result, 201)
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
  const scope = String(req.query.scope || '')
  const rows = db.categories
    .filter((c) => (scope === 'pose' ? poseIds.has(c.id) : c.status === 1 && !poseIds.has(c.id)))
    .sort((a, b) => a.sort - b.sort || a.id - b.id)
    .map((c) => ({ ...c, promptCount: livePrompts().filter((p) => hasCategory(p, c.id) && p.status === 'published').length }))
  ok(res, rows)
})

portal.get('/platforms', (_req, res) => {
  ok(res, db.platforms.filter((p) => p.status === 1).sort((a, b) => a.sort - b.sort || a.id - b.id))
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
  let rows = livePrompts().filter((p) => p.status === 'published' && (!excludeId || p.id !== excludeId))
  if (keyword) rows = rows.filter((p) => String(p.title).toLowerCase().includes(keyword))
  rows.sort((a, b) => b.id - a.id)
  ok(res, rows.slice(0, 20).map((p) => ({ id: p.id, title: p.title })))
})

portal.get('/prompts', (req, res) => {
  const { page, pageSize } = normalizePage(req.query)
  const q = req.query
  const poseIds = poseCategoryIds()
  let rows = livePrompts().filter((p) => p.status === 'published' && (String(q.scope || '') === 'pose' ? isPosePrompt(p, poseIds) : !isPosePrompt(p, poseIds)))
  if (q.keyword) {
    const k = String(q.keyword).toLowerCase()
    rows = rows.filter((p) => [p.title, p.content, p.modelName].some((v) => String(v).toLowerCase().includes(k)))
  }
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
  if (req.query.keyword) {
    const k = String(req.query.keyword).toLowerCase()
    rows = rows.filter((p) => String(p.title).toLowerCase().includes(k))
  }
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
  const err = validationError(data, submitting) || categoryError(data) || parentError(data)
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
  if (data.type === 'sequence') replaceSteps(prompt.id, data)
  else if (data.platformGroups !== undefined || Array.isArray(data.images)) replaceImages(prompt.id, data)
  persist()
  ok(res, decorate(prompt), 201)
})

portal.put('/mine/:id', (req, res) => {
  const prompt = findOwned(req.params.id, req.user.id)
  if (!prompt) return fail(res, '投稿不存在', 404)
  if (prompt.status !== 'draft' && prompt.status !== 'rejected') return fail(res, '只有草稿或被驳回的投稿可以修改', 400)
  const data = req.body || {}
  const submitting = data.submit === true
  const existing = imagesOf(prompt.id).length
  const hasImagePayload = data.platformGroups !== undefined || data.images !== undefined || data.steps !== undefined
  const willHaveImages = hasImagePayload ? countInputImages(data) > 0 : existing > 0
  if (submitting && !willHaveImages) return fail(res, '提交审核必须上传至少一张效果图', 400)
  const err = validationError(data, false) || categoryError(data) || parentError(data, prompt.id)
  if (err) return fail(res, err, 400)
  Object.assign(prompt, trimData(data), {
    status: submitting ? 'pending' : prompt.status,
    rejectReason: submitting ? null : prompt.rejectReason,
    reviewedBy: submitting ? null : prompt.reviewedBy,
    reviewedAt: submitting ? null : prompt.reviewedAt,
    updatedAt: nowIso(),
  })
  if (data.type === 'sequence') replaceSteps(prompt.id, data)
  else if (data.platformGroups !== undefined || data.images !== undefined) replaceImages(prompt.id, data)
  persist()
  ok(res, decorate(prompt))
})

portal.post('/mine/:id/submit', (req, res) => {
  const prompt = findOwned(req.params.id, req.user.id)
  if (!prompt) return fail(res, '投稿不存在', 404)
  if (prompt.status !== 'draft' && prompt.status !== 'rejected') return fail(res, '只有草稿或被驳回的投稿可以提交', 400)
  if (imagesOf(prompt.id).length === 0) return fail(res, '没有效果图，无法提交审核', 400)
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

admin.get('/categories/options', (req, res) => {
  const poseIds = poseCategoryIds()
  const isPoseScope = String(req.query.scope || '') === 'pose'
  ok(
    res,
    db.categories
      .filter((c) => (isPoseScope ? poseIds.has(c.id) : c.status === 1 && !poseIds.has(c.id)))
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
  const category = {
    id: nextId('category'),
    name,
    description: data.description ?? null,
    sort: Number.isFinite(Number(data.sort)) ? Number(data.sort) : 0,
    status: data.status === undefined ? 1 : Number(data.status),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
  db.categories.push(category)
  persist()
  ok(res, { ...category, promptCount: 0 }, 201)
})

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
  let rows = livePrompts().filter((p) =>
    String(req.query.scope || '') === 'pose' ? isPosePrompt(p, poseIds) : !isPosePrompt(p, poseIds),
  )
  if (req.query.keyword) {
    const k = String(req.query.keyword).toLowerCase()
    rows = rows.filter((p) => String(p.title).toLowerCase().includes(k))
  }
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
  let rows = livePrompts().filter(
    (p) =>
      p.status === 'published' &&
      (!excludeId || p.id !== excludeId) &&
      (String(req.query.scope || '') === 'pose' ? isPosePrompt(p, poseIds) : !isPosePrompt(p, poseIds)),
  )
  if (keyword) rows = rows.filter((p) => String(p.title).toLowerCase().includes(keyword))
  rows.sort((a, b) => b.id - a.id)
  ok(res, rows.slice(0, 20).map((p) => ({ id: p.id, title: p.title })))
})

admin.get('/prompts/:id', (req, res) => {
  const prompt = findPrompt(req.params.id)
  if (!prompt) return fail(res, '提示词不存在', 404)
  ok(res, decorate(prompt))
})

admin.post('/prompts', (req, res) => {
  const data = req.body || {}
  const publishing = data.action === 'publish'
  const err = validationError(data, publishing) || categoryError(data) || parentError(data)
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
  if (data.type === 'sequence') replaceSteps(prompt.id, data)
  else if (data.platformGroups !== undefined || Array.isArray(data.images)) replaceImages(prompt.id, data)
  persist()
  ok(res, decorate(prompt), 201)
})

admin.put('/prompts/:id', (req, res) => {
  const prompt = findPrompt(req.params.id)
  if (!prompt) return fail(res, '提示词不存在', 404)
  const data = req.body || {}
  const publishing = data.action === 'publish'
  const hasImagePayload = data.platformGroups !== undefined || data.images !== undefined || data.steps !== undefined
  const willHaveImages = hasImagePayload ? countInputImages(data) > 0 : imagesOf(prompt.id).length > 0
  if (publishing && !willHaveImages) return fail(res, '正式发布的提示词必须上传至少一张效果图', 400)
  const err = validationError(data, false) || categoryError(data) || parentError(data, prompt.id)
  if (err) return fail(res, err, 400)
  Object.assign(prompt, trimData(data), {
    status: publishing ? 'published' : prompt.status,
    rejectReason: publishing ? null : prompt.rejectReason,
    updatedAt: nowIso(),
  })
  if (data.type === 'sequence') replaceSteps(prompt.id, data)
  else if (data.platformGroups !== undefined || data.images !== undefined) replaceImages(prompt.id, data)
  persist()
  ok(res, decorate(prompt))
})

admin.post('/prompts/:id/publish', (req, res) => {
  const prompt = findPrompt(req.params.id)
  if (!prompt) return fail(res, '提示词不存在', 404)
  if (imagesOf(prompt.id).length === 0) return fail(res, '没有效果图，无法发布', 400)
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
  if (imagesOf(prompt.id).length === 0) return fail(res, '投稿缺少效果图，无法通过审核', 400)
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
  const rows = livePrompts().filter((p) => (String(req.query.scope || '') === 'pose' ? isPosePrompt(p, poseIds) : !isPosePrompt(p, poseIds)))
  ok(res, {
    total: rows.length,
    published: rows.filter((p) => p.status === 'published').length,
    pending: rows.filter((p) => p.status === 'pending').length,
    offline: rows.filter((p) => p.status === 'offline').length,
    categories: db.categories.filter((c) => c.status === 1).length,
    favorites: db.favorites.length,
  })
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
    persist()
    ok(res, { restored: name, prompts: db.prompts.length })
  } catch (err) {
    return fail(res, '备份恢复失败：' + err.message, 500)
  }
})

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
