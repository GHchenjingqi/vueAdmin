<template>
  <div v-loading="loading" class="detail-page">
    <el-breadcrumb separator="/" class="detail-breadcrumb">
      <el-breadcrumb-item :to="{ path: '/portal/prompts' }">{{ t('portal.navSquare') }}</el-breadcrumb-item>
      <el-breadcrumb-item>{{ detail?.title || t('portal.detail') }}</el-breadcrumb-item>
    </el-breadcrumb>

    <template v-if="detail">
      <div class="detail-layout">
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
          <div class="gallery-card">
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

        <section class="detail-info">
          <h1>{{ detail.title }}</h1>
          <div class="detail-meta">
            <el-tag effect="plain" type="primary">{{ detail.modelName }}</el-tag>
            <el-tag effect="plain">{{ detail.categoryName }}</el-tag>
            <span class="detail-author">{{ t('portal.author') }}：{{ detail.authorName || '-' }}</span>
          </div>
          <div class="detail-stats">
            <span>
              <el-icon><View /></el-icon>
              {{ detail.viewCount ?? 0 }} {{ t('portal.views') }}
            </span>
            <span>
              <el-icon><Star /></el-icon>
              {{ detail.favoriteCount ?? 0 }} {{ t('portal.favorites') }}
            </span>
          </div>

          <div class="detail-content-head">
            <h3>{{ t('portal.content') }}</h3>
            <el-button type="primary" size="small" :icon="DocumentCopy" @click="copyContent">
              {{ t('portal.copy') }}
            </el-button>
          </div>
          <pre class="detail-content">{{ detail.content }}</pre>

          <div class="detail-actions">
            <el-button :type="favorited ? 'primary' : 'default'" :icon="favorited ? StarFilled : Star" @click="toggleFavorite">
              {{ favorited ? t('portal.favoriteRemove') : t('portal.favoriteAdd') }}
            </el-button>
            <el-button :icon="Back" @click="goBack">{{ t('portal.backToSquare') }}</el-button>
          </div>
        </section>
      </div>

      <section v-if="related.length" class="detail-related">
        <h2 class="related-title">{{ t('portal.related') }}</h2>
        <div class="detail-related-grid">
          <PromptCard v-for="item in related" :key="item.id" :prompt="item" />
        </div>
      </section>
    </template>

    <el-empty v-else-if="!loading" :description="t('portal.detailNotFound')" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Picture, View, Star, StarFilled, DocumentCopy, Back } from '@element-plus/icons-vue'
import { portalApi, type PortalPrompt } from '@/api'
import { useUserStore } from '@/stores'
import { useI18n } from '@/i18n'
import { getErrorMessage } from '@/utils/error'
import PromptCard from './components/PromptCard.vue'

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
.detail-breadcrumb {
  margin-bottom: 18px;
}

.detail-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
  gap: 24px;
  align-items: start;
}

.gallery-card {
  background: var(--card-bg);
  border-radius: var(--radius);
  padding: 12px;
  box-shadow: var(--shadow-sm);
}

.detail-main-image {
  width: 100%;
  min-height: 340px;
  max-height: 560px;
  border-radius: var(--radius-sm);
  background: var(--page-bg);
}

.detail-main-placeholder {
  height: 400px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ink-3);
  background: var(--page-bg);
  border-radius: var(--radius-sm);
}

.gallery-platforms {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--line-strong);
}

.platform-tab {
  padding: 8px 16px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: none;
  color: var(--ink-2);
  font-size: 13px;
  cursor: pointer;
}

.platform-tab:hover {
  color: var(--brand);
}

.platform-tab.active {
  color: var(--brand);
  border-bottom-color: var(--brand);
  font-weight: 600;
}

.tab-count {
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  background: var(--brand-soft);
  color: var(--brand);
  font-size: 11px;
}

.gallery-single-platform {
  margin-bottom: 10px;
  font-size: 12px;
  color: var(--ink-3);
}

.detail-thumbs {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  overflow-x: auto;
}

.detail-thumb {
  width: 66px;
  height: 66px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: var(--radius-sm);
  overflow: hidden;
  cursor: pointer;
  background: none;
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

.detail-info {
  background: var(--card-bg);
  border-radius: var(--radius);
  padding: 24px;
  box-shadow: var(--shadow-sm);
}

.detail-info h1 {
  margin: 0 0 16px;
  font-size: 26px;
  line-height: 1.4;
}

.detail-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--line);
}

.detail-author {
  font-size: 13px;
  color: var(--ink-3);
}

.detail-stats {
  display: flex;
  gap: 20px;
  margin: 16px 0 22px;
  font-size: 13px;
  color: var(--ink-3);
}

.detail-stats span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.detail-content-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.detail-content-head h3 {
  margin: 0;
  font-size: 15px;
}

.detail-content {
  margin: 0;
  padding: 16px;
  border-radius: var(--radius-sm);
  background: var(--page-bg);
  border: 1px solid var(--line);
  font-family: var(--sans);
  font-size: 13px;
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 340px;
  overflow-y: auto;
  color: var(--ink-2);
}

.detail-actions {
  display: flex;
  gap: 10px;
  margin-top: 22px;
}

.detail-related {
  margin-top: 32px;
}

.related-title {
  font-size: 18px;
  margin: 0 0 16px;
  padding-left: 11px;
  border-left: 3px solid var(--brand);
}

.detail-related-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 16px;
}

@media (max-width: 900px) {
  .detail-layout {
    grid-template-columns: 1fr;
    gap: 18px;
  }

  .detail-main-image,
  .detail-main-placeholder {
    min-height: 240px;
    height: 300px;
  }

  .detail-info h1 {
    font-size: 22px;
  }
}
</style>
