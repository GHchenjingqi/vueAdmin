<template>
  <div v-loading="loading" class="detail-page">
    <div class="detail-container">
      <el-breadcrumb separator="/" class="detail-breadcrumb">
        <el-breadcrumb-item :to="{ path: '/portal/prompts' }">{{ t('portal.navSquare') }}</el-breadcrumb-item>
        <el-breadcrumb-item>{{ detail?.title || t('portal.detail') }}</el-breadcrumb-item>
      </el-breadcrumb>

      <template v-if="detail">
        <!-- 标题区：作为整页视觉焦点，聚合标题 / 作者 / 标签 / 统计 -->
        <header class="detail-header">
          <div class="detail-header-top">
            <h1 class="detail-title">{{ detail.title }}</h1>
            <div class="detail-tag-row">
              <span v-if="detail.modelName" class="detail-tag detail-tag-model">{{ detail.modelName }}</span>
              <span v-if="detail.categoryName" class="detail-tag">{{ detail.categoryName }}</span>
            </div>
          </div>
          <div class="detail-header-meta">
            <router-link v-if="detail.parentId && detail.parentTitle" :to="`/portal/prompts/${detail.parentId}`" class="detail-parent-link">
              <el-icon><Link /></el-icon>
              {{ t('portal.derivedFrom') }}：{{ detail.parentTitle }}
            </router-link>
            <span class="detail-author">
              <span class="author-avatar">{{ (detail.authorName || '?').charAt(0) }}</span>
              {{ detail.authorName || '-' }}
            </span>
            <span class="detail-stats">
              <span>
                <el-icon><View /></el-icon>
                {{ detail.viewCount ?? 0 }} {{ t('portal.views') }}
              </span>
              <span>
                <el-icon><Star /></el-icon>
                {{ detail.favoriteCount ?? 0 }} {{ t('portal.favorites') }}
              </span>
            </span>
          </div>
        </header>

        <!-- 套组：有序步骤时间轴 -->
        <SequenceTimeline v-if="isSequence && detail" :detail="detail" />

        <div v-else class="detail-layout">
          <!-- 左：作品图集 -->
          <section class="detail-gallery">
            <div v-if="platformGroups.length > 1" class="gallery-platforms">
              <button
                v-for="(group, index) in platformGroups"
                :key="group.platformId"
                type="button"
                class="platform-tab"
                :class="{ active: index === activePlatformIndex }"
                @click="selectPlatform(index)"
              >
                {{ group.platformName }}
                <span class="tab-count">{{ group.images.length }}</span>
              </button>
            </div>
            <div v-else-if="platformGroups.length === 1" class="gallery-single-platform">{{ platformGroups[0].platformName }}</div>

            <div class="gallery-frame">
              <el-image
                v-if="gallery.length"
                :src="activeImage"
                fit="contain"
                class="detail-main-image"
                :preview-src-list="gallery"
                :initial-index="activeIndex"
              />
              <div v-else class="detail-main-placeholder">
                <el-icon :size="40"><Picture /></el-icon>
              </div>
            </div>

            <div v-if="gallery.length > 1" class="detail-thumbs">
              <button
                v-for="(url, index) in gallery"
                :key="url"
                type="button"
                class="detail-thumb"
                :class="{ active: index === activeIndex }"
                @click="activeIndex = index"
              >
                <img :src="url" :alt="`${detail.title} ${index + 1}`" />
              </button>
            </div>
          </section>

          <!-- 右：提示词面板（Header / Content / Footer 三段式） -->
          <section class="prompt-panel">
            <div class="prompt-panel-head">
              <span class="prompt-panel-title">
                <el-icon><Document /></el-icon>
                {{ t('portal.content') }}
              </span>
              <span class="prompt-panel-actions">
                <el-button v-if="chain.length > 1" size="small" text :icon="DocumentCopy" @click="copyChain">
                  {{ t('portal.copyFullChain') }}
                </el-button>
                <el-button size="small" text :icon="DocumentCopy" @click="copyContent">{{ t('portal.copy') }}</el-button>
              </span>
            </div>
            <div class="prompt-panel-body">
              <template v-if="chain.length > 1">
                <div v-for="(node, index) in chain" :key="node.id" class="chain-node" :class="{ 'chain-node-current': node.id === detail.id }">
                  <div class="chain-node-head">
                    <span class="chain-node-index">{{ index + 1 }}</span>
                    <span class="chain-node-title">{{ node.title }}</span>
                    <span v-if="node.id === detail.id" class="chain-node-current-tag">{{ t('portal.currentStep') }}</span>
                  </div>
                  <pre class="detail-content chain-content">{{ node.content }}</pre>
                </div>
              </template>
              <pre v-else class="detail-content">{{ detail.content }}</pre>
            </div>
            <div class="prompt-panel-foot">
              <el-button :type="favorited ? 'primary' : 'default'" :icon="favorited ? StarFilled : Star" @click="toggleFavorite">
                {{ favorited ? t('portal.favoriteRemove') : t('portal.favoriteAdd') }}
              </el-button>
              <el-button :icon="Back" @click="goBack">{{ t('portal.backToSquare') }}</el-button>
            </div>
          </section>
        </div>

        <section v-if="followUps.length" class="detail-related">
          <h2 class="related-title">{{ t('portal.followUps') }}</h2>
          <div class="followup-list">
            <router-link v-for="child in followUps" :key="child.id" :to="`/portal/prompts/${child.id}`" class="followup-item">
              <img v-if="child.coverImage" :src="child.coverImage" :alt="child.title" class="followup-cover" />
              <span class="followup-title">{{ child.title }}</span>
              <el-icon><ArrowRight /></el-icon>
            </router-link>
          </div>
        </section>

        <section v-if="related.length" class="detail-related">
          <h2 class="related-title">{{ t('portal.related') }}</h2>
          <div class="detail-related-grid">
            <PromptCard v-for="item in related" :key="item.id" :prompt="item" />
          </div>
        </section>
      </template>

      <el-empty v-else-if="!loading" :description="t('portal.detailNotFound')" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Picture, View, Star, StarFilled, DocumentCopy, Document, Back, Link, ArrowRight } from '@element-plus/icons-vue'
import { portalApi, type PortalPrompt } from '@/api'
import { useUserStore } from '@/stores'
import { useI18n } from '@/i18n'
import { getErrorMessage } from '@/utils/error'
import { copyText } from '@/utils/clipboard'
import PromptCard from './components/PromptCard.vue'
import SequenceTimeline from './components/SequenceTimeline.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const detail = ref<PortalPrompt | null>(null)
const related = ref<PortalPrompt[]>([])
const loading = ref(false)
const favorited = ref(false)
const activeIndex = ref(0)
const activePlatformIndex = ref(0)

const isSequence = computed(() => detail.value?.type === 'sequence')
const chain = computed(() => detail.value?.chain ?? [])
const followUps = computed(() => (detail.value?.children ?? []).filter((child) => child.status === 'published'))
const fullChainText = computed(() => chain.value.map((node, index) => `${index + 1}. ${node.title}\n${node.content}`).join('\n\n'))

const platformGroups = computed(() => {
  if (detail.value?.platformGroups?.length) return detail.value.platformGroups
  if (detail.value?.images?.length) {
    return [{ platformId: detail.value.images[0].platformId || 1, platformName: '通用', images: detail.value.images, coverImage: '' }]
  }
  return []
})
const gallery = computed(() => platformGroups.value[activePlatformIndex.value]?.images.map((image) => image.url) ?? [])
const activeImage = computed(() => gallery.value[activeIndex.value] ?? gallery.value[0] ?? '')

const selectPlatform = (index: number): void => {
  activePlatformIndex.value = index
  activeIndex.value = 0
}

const promptId = computed(() => Number(route.params.id))

const load = async (): Promise<void> => {
  if (!promptId.value) return
  loading.value = true
  activeIndex.value = 0
  activePlatformIndex.value = 0
  try {
    const [detailRes, relatedRes] = await Promise.all([portalApi.getPrompt(promptId.value), portalApi.getRelated(promptId.value)])
    detail.value = detailRes.data
    favorited.value = Boolean(detailRes.data.isFavorited)
    related.value = relatedRes.data
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
    detail.value = null
  } finally {
    loading.value = false
  }
}

const copyContent = async (): Promise<void> => {
  const text = detail.value?.content ?? ''
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(t('portal.copySuccess'))
  } catch {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    if (ok) ElMessage.success(t('portal.copySuccess'))
    else ElMessage.error(t('portal.copyFailed'))
  }
}

const copyChain = async (): Promise<void> => {
  try {
    await copyText(fullChainText.value)
    ElMessage.success(t('portal.copySuccess'))
  } catch {
    ElMessage.error(t('portal.copyFailed'))
  }
}

const toggleFavorite = async (): Promise<void> => {
  if (!userStore.isLoggedIn) {
    ElMessage.warning(t('portal.loginRequired'))
    void router.push({ path: '/portal/login', query: { redirect: route.fullPath } })
    return
  }
  if (!detail.value) return
  try {
    if (favorited.value) await portalApi.removeFavorite(detail.value.id)
    else await portalApi.addFavorite(detail.value.id)
    favorited.value = !favorited.value
    detail.value.favoriteCount = Math.max(0, (detail.value.favoriteCount ?? 0) + (favorited.value ? 1 : -1))
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  }
}

const goBack = (): void => {
  void router.push('/portal/prompts')
}

watch(promptId, () => void load())
onMounted(() => void load())
</script>

<style scoped>
/* 语义 token 本地别名：全部继承 portal.css 的设计变量，不写死色值 */
.detail-page {
  --gap-1: 4px;
  --gap-2: 8px;
  --gap-3: 12px;
  --gap-4: 16px;
  --gap-5: 20px;
  --gap-6: 24px;
  --gap-8: 32px;
  /* 详情页卡片圆角：8px 为本页局部值，不改动全局 --radius，避免影响其他页面 */
  --detail-radius: 8px;
}

/* 内容容器：最大宽度约束，避免宽屏上图片被拉满 */
.detail-container {
  max-width: 1200px;
  margin: 0 auto;
}

.detail-breadcrumb {
  margin-bottom: var(--gap-3);
  font-size: var(--gap-3);
}

/* ---- 标题卡片 ---- */
.detail-header {
  padding: var(--gap-5) var(--gap-6);
  margin-bottom: var(--gap-3);
  background: var(--card-bg);
  border: 1px solid var(--line);
  border-radius: var(--detail-radius);
}

.detail-header-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--gap-4);
  flex-wrap: wrap;
}

.detail-title {
  margin: 0;
  font-size: 28px;
  line-height: 1.3;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.detail-tag-row {
  display: flex;
  align-items: center;
  gap: var(--gap-2);
  flex-wrap: wrap;
}

.detail-tag {
  padding: var(--gap-1) var(--gap-2);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--page-bg);
  color: var(--ink-2);
  font-size: 12px;
  line-height: 1.5;
}

.detail-tag-model {
  border-color: transparent;
  background: var(--brand-soft);
  color: var(--brand);
}

.detail-header-meta {
  display: flex;
  align-items: center;
  gap: var(--gap-6);
  margin-top: var(--gap-5);
  padding-top: var(--gap-4);
  border-top: 1px solid var(--line);
  font-size: 13px;
  color: var(--ink-3);
}

.detail-parent-link {
  display: inline-flex;
  align-items: center;
  gap: var(--gap-1);
  color: var(--brand);
  text-decoration: none;
}

.detail-parent-link:hover {
  text-decoration: underline;
}

.detail-author {
  display: inline-flex;
  align-items: center;
  gap: var(--gap-2);
}

.author-avatar {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--brand-soft);
  color: var(--brand);
  font-size: 12px;
  font-weight: 600;
}

.detail-stats {
  display: inline-flex;
  align-items: center;
  gap: var(--gap-4);
}

.detail-stats span {
  display: inline-flex;
  align-items: center;
  gap: var(--gap-1);
}

/* ---- 主体两栏 ---- */
.detail-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--gap-3);
  align-items: start;
}

/* 图片卡片：白底 + 1px 边框 + 8px 圆角，无投影 */
.detail-gallery {
  min-width: 0;
  padding: var(--gap-4);
  background: var(--card-bg);
  border: 1px solid var(--line);
  border-radius: var(--detail-radius);
}

/* 平台切换：segmented 控件，浅底容器 + 选中态 */
.gallery-platforms {
  display: inline-flex;
  flex-wrap: wrap;
  gap: var(--gap-1);
  padding: var(--gap-1);
  margin-bottom: var(--gap-3);
  background: var(--page-bg);
  border: 1px solid var(--line);
  border-radius: var(--radius);
}

.platform-tab {
  display: inline-flex;
  align-items: center;
  gap: var(--gap-1);
  padding: var(--gap-2) var(--gap-3);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--ink-2);
  font-size: 13px;
  font-family: var(--sans);
  line-height: 1.4;
  cursor: pointer;
  transition:
    color 0.15s,
    background 0.15s;
}

.platform-tab:hover {
  color: var(--brand);
}

.platform-tab.active {
  background: var(--card-bg);
  border-color: var(--line);
  color: var(--brand);
  font-weight: 600;
}

.tab-count {
  padding: 0 var(--gap-1);
  border-radius: var(--radius-sm);
  background: var(--brand-soft);
  color: var(--brand);
  font-size: 11px;
}

.gallery-single-platform {
  margin-bottom: var(--gap-3);
  font-size: 12px;
  color: var(--ink-3);
}

/* 固定矮画框：图片高度受控，不再随栏宽被拉高；中性灰底 contain */
.gallery-frame {
  height: 280px;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: var(--page-bg);
  border-radius: var(--radius-sm);
}

.detail-main-image {
  width: 100%;
  height: 100%;
}

.detail-main-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ink-3);
}

.detail-thumbs {
  display: flex;
  gap: var(--gap-2);
  margin-top: var(--gap-3);
  overflow-x: auto;
}

.detail-thumb {
  width: 56px;
  height: 56px;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  overflow: hidden;
  cursor: pointer;
  background: var(--page-bg);
  flex-shrink: 0;
}

.detail-thumb.active {
  border-color: var(--brand);
}

.detail-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* ---- 提示词面板：Header / Content / Footer ---- */
.prompt-panel {
  display: flex;
  flex-direction: column;
  background: var(--card-bg);
  border: 1px solid var(--line);
  border-radius: var(--detail-radius);
  overflow: hidden;
}

.prompt-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--gap-3) var(--gap-4);
  border-bottom: 1px solid var(--line);
}

.prompt-panel-title {
  display: inline-flex;
  align-items: center;
  gap: var(--gap-2);
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
}

.prompt-panel-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--gap-1);
}

.prompt-panel-body {
  flex: 1;
  padding: var(--gap-4);
  background: var(--page-bg);
}

.chain-node {
  padding: var(--gap-3);
  border: 1px solid var(--line);
  border-radius: var(--detail-radius);
  background: var(--card-bg);
}

.chain-node + .chain-node {
  margin-top: var(--gap-3);
}

.chain-node-current {
  border-color: var(--brand);
}

.chain-node-head {
  display: flex;
  align-items: center;
  gap: var(--gap-2);
  margin-bottom: var(--gap-2);
  font-size: 13px;
}

.chain-node-index {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--brand-soft);
  color: var(--brand);
  font-size: 11px;
}

.chain-node-title {
  font-weight: 600;
  color: var(--ink);
}

.chain-node-current-tag {
  margin-left: auto;
  font-size: 11px;
  color: var(--brand);
}

.chain-content {
  max-height: 220px;
}

.detail-content {
  margin: 0;
  font-family: var(--font-mono, 'SF Mono', Consolas, 'Liberation Mono', monospace);
  font-size: 13px;
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--ink-2);
  max-height: 360px;
  overflow-y: auto;
}

.prompt-panel-foot {
  display: flex;
  gap: var(--gap-2);
  padding: var(--gap-3) var(--gap-4);
  border-top: 1px solid var(--line);
}

/* ---- 追问衍生 ---- */
.followup-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--gap-3);
}

.followup-item {
  display: flex;
  align-items: center;
  gap: var(--gap-3);
  padding: var(--gap-3);
  border: 1px solid var(--line);
  border-radius: var(--detail-radius);
  background: var(--card-bg);
  color: var(--ink);
  text-decoration: none;
  transition: border-color 0.15s ease;
}

.followup-item:hover {
  border-color: var(--brand);
}

.followup-cover {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-sm);
  object-fit: cover;
  flex-shrink: 0;
}

.followup-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

/* ---- 相关推荐 ---- */
.detail-related {
  margin-top: var(--gap-3);
}

.related-title {
  font-size: 18px;
  margin: 0 0 var(--gap-4);
  padding-left: var(--gap-3);
  border-left: 3px solid var(--brand);
}

.detail-related-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: var(--gap-3);
}

/* 相关推荐是整齐网格，封面统一裁切高度，避免竖图把某一行撑得过高 */
.detail-related-grid :deep(.prompt-card) {
  border-radius: var(--detail-radius);
}

.detail-related-grid :deep(.cover-image) {
  height: 160px;
  object-fit: cover;
}

.detail-related-grid :deep(.cover-placeholder) {
  height: 160px;
}

@media (max-width: 900px) {
  .detail-title {
    font-size: 22px;
  }

  .detail-header-top {
    flex-direction: column;
  }

  .detail-layout {
    grid-template-columns: 1fr;
    gap: var(--gap-3);
  }

  .gallery-frame {
    height: 220px;
  }
}
</style>
