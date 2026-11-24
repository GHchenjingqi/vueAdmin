<template>
  <div class="pose-page">
    <section class="pose-hero">
      <div class="pose-hero-copy">
        <div class="pose-kicker">AI POSE REFERENCE · 中文姿势库</div>
        <h1>{{ t('portal.poseTitle') }}</h1>
        <p class="pose-lead">{{ t('portal.poseSubtitle') }}</p>
        <p class="pose-desc">{{ t('portal.poseDesc') }}</p>
      </div>
      <div class="pose-stats">
        <div class="pose-stat">
          <strong>{{ stats.groups }}</strong>
          <span>{{ t('portal.poseGroups') }}</span>
        </div>
        <div class="pose-stat">
          <strong>{{ stats.images }}</strong>
          <span>{{ t('portal.poseImages') }}</span>
        </div>
        <div class="pose-stat">
          <strong>{{ stats.angles }}</strong>
          <span>{{ t('portal.poseAngles') }}</span>
        </div>
      </div>
    </section>

    <div class="pose-panel">
      <div class="system-cards">
        <button type="button" class="system-card" :class="{ active: system === '' }" @click="selectSystem('')">
          <strong>{{ t('portal.poseAll') }}</strong>
          <span>{{ stats.images }}{{ t('portal.poseImagesUnit') }} · {{ stats.groups }}{{ t('portal.poseGroupsUnit') }}</span>
        </button>
        <button
          v-for="item in systemStats"
          :key="item.name"
          type="button"
          class="system-card"
          :class="{ active: system === item.name }"
          @click="selectSystem(item.name)"
        >
          <strong>{{ item.name }}</strong>
          <span>{{ item.images }}{{ t('portal.poseImagesUnit') }} · {{ item.groups }}{{ t('portal.poseGroupsUnit') }}</span>
        </button>
      </div>

      <el-input v-model="keyword" class="pose-search" clearable :placeholder="t('portal.poseSearchPlaceholder')">
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>

      <div class="pose-filters">
        <div class="filter-block">
          <label>aPose分类</label>
          <el-select v-model="poseCategory" style="width: 190px" size="default">
            <el-option :label="t('portal.allCategories')" value="" />
            <el-option v-for="name in poseCategories" :key="name" :label="name" :value="name" />
          </el-select>
        </div>
        <div class="filter-block">
          <label>{{ t('portal.poseView') }}</label>
          <div class="segmented">
            <button
              v-for="angle in ANGLE_OPTIONS"
              :key="angle"
              type="button"
              :class="{ active: viewAngle === angle }"
              @click="viewAngle = angle"
            >
              {{ angle === '' ? t('portal.poseAllViews') : angle }}
            </button>
          </div>
        </div>
        <div class="filter-block">
          <label>{{ t('portal.poseDisplay') }}</label>
          <div class="segmented">
            <button type="button" :class="{ active: mode === 'group' }" @click="mode = 'group'">{{ t('portal.poseGroupByPose') }}</button>
            <button type="button" :class="{ active: mode === 'masonry' }" @click="mode = 'masonry'">{{ t('portal.poseMasonry') }}</button>
            <button type="button" class="reset" @click="resetFilters">{{ t('portal.poseReset') }}</button>
          </div>
        </div>
      </div>
    </div>

    <div class="result-head">
      <div class="result-title">
        <strong>{{ filtered.length }}</strong> {{ t('portal.poseGroups') }} · {{ filteredImages }} {{ t('portal.poseImages') }}
      </div>
      <div class="result-tip">
        {{ t('portal.poseShown', { n: visible.length, total: filtered.length }) }} · {{ t('portal.poseHoverTip') }}
      </div>
    </div>

    <div v-if="mode === 'group'" v-loading="loading" class="pose-grid">
      <article v-for="item in visible" :key="item.id" class="pose-card" @click="openDetail(item.id)">
        <div class="pose-image-wrap">
          <img :src="imageFor(item)" :alt="item.title" loading="lazy" />
          <span class="pose-code">{{ item.code }}</span>
          <span class="pose-angle">{{ currentAngle(item) }}</span>
          <div class="angle-strip" @click.stop>
            <button
              v-for="img in item.images"
              :key="img.url"
              type="button"
              :title="img.angle"
              :class="{ active: currentAngle(item) === img.angle }"
              @click="activeAngle[item.id] = img.angle"
            >
              <img :src="img.url" :alt="img.angle" loading="lazy" />
            </button>
          </div>
        </div>
      </article>
    </div>

    <div v-else v-loading="loading" class="pose-masonry">
      <article v-for="(img, index) in masonryImages" :key="`${img.url}-${index}`" class="masonry-card" @click="openDetail(img.promptId)">
        <img :src="img.url" :alt="img.angle" loading="lazy" />
        <span class="masonry-label">{{ img.code }} · {{ img.angle }}</span>
      </article>
    </div>

    <div v-if="!loading && !filtered.length" class="pose-empty">
      <el-empty :description="ready ? t('portal.poseEmpty') : t('portal.poseNoData')" />
    </div>

    <div v-if="visible.length < filtered.length" class="load-more">
      <el-button @click="visibleCount += 60">{{ t('portal.poseLoadMore') }}</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Search } from '@element-plus/icons-vue'
import { portalApi, type PortalPrompt } from '@/api'
import { useI18n } from '@/i18n'
import { getErrorMessage } from '@/utils/error'

const { t } = useI18n()
const router = useRouter()

const ANGLE_OPTIONS = ['', '正面', '俯视', '仰视', '侧面', '斜侧'] as const
const ANGLE_SUFFIX: Record<string, string> = {
  front: '正面',
  high: '俯视',
  low: '仰视',
  side: '侧面',
  diag: '斜侧',
}
const ANGLE_ORDER = ['正面', '俯视', '仰视', '侧面', '斜侧']
const SYSTEM_ORDER = ['全身单人-性感系', '全身单人-标准系', '上半身单人', '双人缠绵']

interface PoseImage {
  url: string
  angle: string
}
interface PoseItem {
  id: number
  title: string
  code: string
  system: string
  poseCategory: string
  poseName: string
  images: PoseImage[]
}

const rows = ref<PoseItem[]>([])
const loading = ref(false)
const ready = ref(false)
const system = ref('')
const poseCategory = ref('')
const viewAngle = ref('')
const mode = ref<'group' | 'masonry'>('group')
const keyword = ref('')
const visibleCount = ref(60)
const activeAngle = reactive<Record<number, string>>({})

const field = (content: string, key: string): string => {
  const matched = String(content || '').match(new RegExp(`^${key}：(.+)$`, 'm'))
  return matched ? matched[1].trim() : ''
}

const angleFromFile = (filePath: string): string => {
  for (const [suffix, label] of Object.entries(ANGLE_SUFFIX)) {
    if (filePath.endsWith(`_${suffix}.jpg`) || filePath.endsWith(`_${suffix}.png`)) return label
  }
  return '正面'
}

const parsePrompt = (prompt: PortalPrompt): PoseItem => {
  const images = (prompt.images || [])
    .map((img) => ({
      url: img.url,
      angle: angleFromFile(String(img.filePath || img.url || '')),
    }))
    .sort((a, b) => ANGLE_ORDER.indexOf(a.angle) - ANGLE_ORDER.indexOf(b.angle))
  return {
    id: prompt.id,
    title: prompt.title,
    code: field(prompt.content, '姿势编号') || prompt.title.match(/P\d+/)?.[0] || String(prompt.id),
    system: field(prompt.content, '体系') || prompt.categoryName || '',
    poseCategory: field(prompt.content, '分类'),
    poseName: field(prompt.content, '姿势名称'),
    images,
  }
}

const stats = computed(() => {
  const groups = rows.value.length
  const images = rows.value.reduce((sum, item) => sum + item.images.length, 0)
  const angles = new Set(rows.value.flatMap((item) => item.images.map((img) => img.angle))).size
  return { groups, images, angles }
})

const systemStats = computed(() => {
  const result = new Map<string, { name: string; groups: number; images: number }>()
  for (const item of rows.value) {
    if (!result.has(item.system)) result.set(item.system, { name: item.system, groups: 0, images: 0 })
    const stat = result.get(item.system)!
    stat.groups += 1
    stat.images += item.images.length
  }
  return [...result.values()].sort((a, b) => {
    const left = SYSTEM_ORDER.indexOf(a.name)
    const right = SYSTEM_ORDER.indexOf(b.name)
    return (left < 0 ? 99 : left) - (right < 0 ? 99 : right)
  })
})

const poseCategories = computed(() => [...new Set(rows.value.map((item) => item.poseCategory).filter(Boolean))].sort())

const filtered = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  return rows.value.filter((item) => {
    if (system.value && item.system !== system.value) return false
    if (poseCategory.value && item.poseCategory !== poseCategory.value) return false
    if (viewAngle.value && !item.images.some((img) => img.angle === viewAngle.value)) return false
    if (k && ![item.code, item.poseName, item.poseCategory, item.system, item.images.length.toString()].join(' ').toLowerCase().includes(k)) return false
    return true
  })
})

const filteredImages = computed(() => filtered.value.reduce((sum, item) => sum + item.images.length, 0))

const visible = computed(() => filtered.value.slice(0, visibleCount.value))

const masonryImages = computed(() =>
  filtered.value.flatMap((item) =>
    item.images
      .filter((img) => !viewAngle.value || img.angle === viewAngle.value)
      .map((img) => ({ ...img, promptId: item.id, code: item.code })),
  ),
)

const currentAngle = (item: PoseItem): string => {
  if (viewAngle.value && item.images.some((img) => img.angle === viewAngle.value)) return viewAngle.value
  const selected = activeAngle[item.id]
  if (selected && item.images.some((img) => img.angle === selected)) return selected
  return item.images[0]?.angle || ''
}

const imageFor = (item: PoseItem): string => {
  const angle = currentAngle(item)
  return item.images.find((img) => img.angle === angle)?.url || item.images[0]?.url || ''
}

const selectSystem = (name: string): void => {
  system.value = name
  visibleCount.value = 60
}

const resetFilters = (): void => {
  system.value = ''
  poseCategory.value = ''
  viewAngle.value = ''
  keyword.value = ''
  mode.value = 'group'
  visibleCount.value = 60
  Object.keys(activeAngle).forEach((key) => delete activeAngle[Number(key)])
}

const openDetail = (id: number): void => {
  void router.push(`/portal/prompts/${id}`)
}

const fetchAll = async (): Promise<void> => {
  loading.value = true
  try {
    const categoriesRes = await portalApi.getCategories()
    const parent = categoriesRes.data.find((item) => item.name === '姿势')
    if (!parent) return
    const first = await portalApi.getPrompts({ page: 1, pageSize: 100, categoryId: parent.id })
    const pageCount = Math.ceil(first.data.total / 100)
    const rest = await Promise.all(
      Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) =>
        portalApi.getPrompts({ page: index + 2, pageSize: 100, categoryId: parent.id }),
      ),
    )
    rows.value = [first, ...rest]
      .flatMap((res) => res.data.rows)
      .map(parsePrompt)
      .sort((a, b) => {
        const left = SYSTEM_ORDER.indexOf(a.system)
        const right = SYSTEM_ORDER.indexOf(b.system)
        if (left !== right) return (left < 0 ? 99 : left) - (right < 0 ? 99 : right)
        return a.code.localeCompare(b.code, undefined, { numeric: true })
      })
    ready.value = true
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  } finally {
    loading.value = false
  }
}

onMounted(fetchAll)
</script>

<style scoped>
.pose-page {
  min-height: 60vh;
}

.pose-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 28px;
  padding: 4px 0 22px;
}

.pose-kicker {
  font-size: 11px;
  letter-spacing: 1.4px;
  color: var(--brand);
  font-weight: 700;
  margin-bottom: 8px;
}

.pose-hero h1 {
  margin: 0 0 6px;
  font-size: 30px;
  letter-spacing: 0.4px;
}

.pose-lead {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--ink-2);
}

.pose-desc {
  margin: 0;
  font-size: 12px;
  color: var(--ink-3);
}

.pose-stats {
  display: flex;
  align-items: stretch;
  gap: 0;
  flex-shrink: 0;
}

.pose-stat {
  min-width: 92px;
  padding: 2px 18px;
  text-align: center;
  border-left: 1px solid var(--line);
}

.pose-stat:first-child {
  border-left: none;
}

.pose-stat strong {
  display: block;
  font-size: 22px;
  line-height: 1.2;
}

.pose-stat span {
  display: block;
  font-size: 12px;
  color: var(--ink-3);
  margin-top: 4px;
}

.pose-panel {
  padding: 18px;
  background: var(--card-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
}

.system-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 10px;
  margin-bottom: 16px;
}

.system-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--page-bg);
  color: var(--ink-2);
  cursor: pointer;
  text-align: left;
  font-family: var(--sans);
  transition: all 0.15s;
}

.system-card strong {
  font-size: 13px;
}

.system-card span {
  font-size: 11px;
  color: var(--ink-3);
}

.system-card:hover {
  border-color: var(--brand);
}

.system-card.active {
  background: #1f2430;
  border-color: #1f2430;
  color: #fff;
}

.system-card.active span {
  color: #c9cedb;
}

.pose-search {
  width: 100%;
  margin-bottom: 16px;
}

.pose-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 22px;
  align-items: flex-end;
}

.filter-block {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.filter-block label {
  font-size: 12px;
  color: var(--ink-3);
}

.segmented {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  background: var(--page-bg);
  border-radius: var(--radius);
}

.segmented button {
  border: 1px solid transparent;
  background: transparent;
  color: var(--ink-2);
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  font-family: var(--sans);
}

.segmented button:hover {
  color: var(--brand);
}

.segmented button.active {
  background: var(--card-bg);
  border-color: var(--line);
  color: var(--brand);
  font-weight: 600;
}

.segmented button.reset {
  color: var(--ink-3);
  border-left: 1px solid var(--line);
  border-radius: 0;
  margin-left: 4px;
}

.result-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 20px 0 12px;
}

.result-title {
  font-size: 14px;
}

.result-title strong {
  font-size: 16px;
}

.result-tip {
  font-size: 11px;
  color: var(--ink-3);
}

.pose-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 14px;
}

.pose-card {
  background: var(--card-bg);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
}

.pose-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-sm);
}

.pose-image-wrap {
  position: relative;
  aspect-ratio: 3 / 4;
  background: #f8f9fb;
  overflow: hidden;
}

.pose-image-wrap > img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.pose-code,
.pose-angle {
  position: absolute;
  top: 8px;
  padding: 3px 7px;
  border-radius: 4px;
  font-size: 11px;
  background: #1f2430;
  color: #fff;
}

.pose-code {
  left: 8px;
}

.pose-angle {
  right: 8px;
  background: rgba(255, 255, 255, 0.9);
  color: var(--ink-2);
  border: 1px solid var(--line);
}

.angle-strip {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}

.pose-card:hover .angle-strip {
  opacity: 1;
}

.angle-strip button {
  width: 30px;
  height: 40px;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 4px;
  overflow: hidden;
  background: #fff;
  cursor: pointer;
}

.angle-strip button.active {
  border-color: var(--brand);
  box-shadow: 0 0 0 1px var(--brand);
}

.angle-strip img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.pose-masonry {
  column-count: 5;
  column-gap: 12px;
}

.masonry-card {
  position: relative;
  break-inside: avoid;
  margin-bottom: 12px;
  background: #f8f9fb;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  overflow: hidden;
  cursor: pointer;
}

.masonry-card img {
  width: 100%;
  display: block;
}

.masonry-label {
  position: absolute;
  left: 6px;
  top: 6px;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(31, 36, 48, 0.85);
  color: #fff;
}

.pose-empty {
  padding: 60px 0;
}

.load-more {
  display: flex;
  justify-content: center;
  margin-top: 20px;
}

@media (max-width: 1200px) {
  .pose-masonry {
    column-count: 4;
  }
}

@media (max-width: 900px) {
  .pose-hero {
    flex-direction: column;
  }

  .pose-stats {
    width: 100%;
  }

  .pose-masonry {
    column-count: 3;
  }
}

@media (max-width: 640px) {
  .pose-filters {
    gap: 14px;
  }

  .pose-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  }

  .pose-masonry {
    column-count: 2;
  }
}
</style>
