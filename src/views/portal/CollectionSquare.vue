<template>
  <div class="collection-page">
    <header class="collection-hero">
      <div class="collection-hero-text">
        <h1>{{ t('portal.collectionSquareTitle') }}</h1>
        <p>{{ t('portal.collectionSquareSubtitle') }}</p>
      </div>
      <el-button v-if="isLoggedIn" type="primary" :icon="EditPen" @click="goPublish">{{ t('portal.publishCollection') }}</el-button>
    </header>

    <div v-loading="loading" class="collection-grid">
      <router-link v-for="item in rows" :key="item.id" :to="`/portal/prompts/${item.id}`" class="collection-card">
        <div class="collection-covers">
          <template v-if="coversOf(item).length">
            <img
              v-for="(cover, index) in coversOf(item).slice(0, 3)"
              :key="cover + index"
              :src="cover"
              :alt="item.title"
              class="collection-cover"
              :class="`cover-${index}`"
            />
          </template>
          <div v-else class="collection-cover-empty">
            <el-icon :size="30"><Picture /></el-icon>
          </div>
          <span class="collection-count">{{ item.relatedPrompts?.length ?? 0 }} {{ t('portal.collectionEffects') }}</span>
        </div>
        <div class="collection-body">
          <h3 class="collection-title">{{ item.title }}</h3>
          <p class="collection-desc">{{ item.content || t('portal.collectionNoDesc') }}</p>
          <div class="collection-meta">
            <span class="collection-author">{{ item.authorName || '-' }}</span>
            <span class="collection-views">
              <el-icon><View /></el-icon>
              {{ item.viewCount ?? 0 }}
            </span>
          </div>
        </div>
      </router-link>
      <el-empty v-if="!loading && !rows.length" :description="t('portal.collectionEmpty')" class="collection-empty" />
    </div>

    <div v-if="hasMore" class="collection-more">
      <el-button :loading="loading" @click="loadMore">{{ t('portal.poseLoadMore') }}</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { EditPen, Picture, View } from '@element-plus/icons-vue'
import { portalApi, type PortalPrompt } from '@/api'
import { useUserStore } from '@/stores'
import { useI18n } from '@/i18n'
import { getErrorMessage } from '@/utils/error'

const { t } = useI18n()
const router = useRouter()
const userStore = useUserStore()
const isLoggedIn = computed(() => userStore.isLoggedIn)

const rows = ref<PortalPrompt[]>([])
const loading = ref(false)
const page = ref(1)
const total = ref(0)
const pageSize = 12

const hasMore = computed(() => rows.value.length < total.value)

const coversOf = (item: PortalPrompt): string[] => (item.relatedPrompts ?? []).map((brief) => brief.coverImage).filter(Boolean)

const load = async (): Promise<void> => {
  loading.value = true
  try {
    const res = await portalApi.getPrompts({ page: page.value, pageSize, scope: 'collection' })
    total.value = res.data.total
    rows.value = page.value === 1 ? res.data.rows : [...rows.value, ...res.data.rows]
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  } finally {
    loading.value = false
  }
}

const loadMore = (): void => {
  page.value += 1
  void load()
}

const goPublish = (): void => {
  void router.push('/portal/publish-collection')
}

onMounted(() => void load())
</script>

<style scoped>
.collection-page {
  width: min(1680px, 100%);
  margin: 0 auto;
}
.collection-hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
  padding: 22px 26px;
  border-radius: var(--radius);
  background: var(--brand-gradient);
  color: #fff;
}
.collection-hero h1 {
  margin: 0 0 6px;
  font-size: 22px;
  color: #fff;
}
.collection-hero p {
  margin: 0;
  font-size: 13px;
  opacity: 0.85;
}
.collection-hero :deep(.el-button) {
  border: none;
}
.collection-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  min-height: 200px;
}
.collection-card {
  display: flex;
  flex-direction: column;
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--card-bg);
  border: 1px solid var(--line);
  transition:
    transform 0.18s,
    box-shadow 0.18s;
}
.collection-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-md, 0 8px 24px rgba(0, 0, 0, 0.1));
}
.collection-covers {
  position: relative;
  height: 170px;
  background: var(--page-bg);
}
.collection-cover {
  position: absolute;
  top: 12px;
  width: 45%;
  height: 140px;
  object-fit: cover;
  border-radius: 6px;
  border: 2px solid var(--card-bg);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}
.cover-0 {
  left: 8%;
  z-index: 3;
}
.cover-1 {
  left: 28%;
  z-index: 2;
}
.cover-2 {
  left: 48%;
  z-index: 1;
}
.collection-cover-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ink-3);
}
.collection-count {
  position: absolute;
  right: 10px;
  bottom: 8px;
  z-index: 4;
  padding: 2px 8px;
  font-size: 11px;
  border-radius: var(--radius-pill);
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
}
.collection-body {
  padding: 12px 14px 14px;
}
.collection-title {
  margin: 0 0 6px;
  font-size: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.collection-desc {
  margin: 0 0 10px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--ink-3);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 38px;
}
.collection-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--ink-3);
}
.collection-views {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.collection-empty {
  grid-column: 1 / -1;
}
.collection-more {
  display: flex;
  justify-content: center;
  margin-top: 20px;
}
</style>
