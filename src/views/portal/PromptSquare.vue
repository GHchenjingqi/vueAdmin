<template>
  <div class="square-page">
    <div class="square-hero">
      <div class="square-hero-copy">
        <h1>{{ t('portal.squareTitle') }}</h1>
        <p>{{ t('portal.squareSubtitle') }}</p>
      </div>
      <el-button type="primary" :icon="EditPen" class="square-hero-btn" @click="goPublish">{{ t('portal.navPublish') }}</el-button>
    </div>

    <div class="square-toolbar">
      <div class="category-pills">
        <button type="button" class="pill" :class="{ active: activeCategory === '' }" @click="selectCategory('')">
          {{ t('portal.allCategories') }}
        </button>
        <button
          v-for="category in categories"
          :key="category.id"
          type="button"
          class="pill"
          :class="{ active: activeCategory === category.id }"
          @click="selectCategory(category.id)"
        >
          {{ category.name }}
        </button>
      </div>
      <div class="square-toolbar-right">
        <span class="square-count">{{ total }} {{ t('portal.resultUnit') }}</span>
        <el-select v-model="sort" size="small" class="square-sort" @change="reload">
          <el-option :label="t('portal.sortLatest')" value="latest" />
          <el-option :label="t('portal.sortPopular')" value="popular" />
        </el-select>
      </div>
    </div>

    <div v-loading="loading" class="square-grid-wrap">
      <div v-if="rows.length" class="square-grid">
        <PromptCard v-for="item in rows" :key="item.id" :prompt="item" @favorite-changed="onFavoriteChanged" />
      </div>
      <div v-else-if="!loading" class="square-empty">
        <el-empty :description="keyword ? t('portal.emptySearch') : t('portal.empty')" />
      </div>
    </div>

    <div v-if="total > pageSize" class="square-pagination">
      <el-pagination v-model:current-page="page" :page-size="pageSize" :total="total" layout="prev, pager, next" background @current-change="fetchPrompts" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { EditPen } from '@element-plus/icons-vue'
import { portalApi, type PortalCategory, type PortalPrompt } from '@/api'
import { useI18n } from '@/i18n'
import { getErrorMessage } from '@/utils/error'
import PromptCard from './components/PromptCard.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const categories = ref<PortalCategory[]>([])
const rows = ref<PortalPrompt[]>([])
const keyword = ref(typeof route.query.keyword === 'string' ? route.query.keyword : '')
const activeCategory = ref<number | ''>('')
const sort = ref<'latest' | 'popular'>('latest')
const page = ref(1)
const pageSize = 12
const total = ref(0)
const loading = ref(false)

const fetchCategories = async (): Promise<void> => {
  try {
    const res = await portalApi.getCategories()
    categories.value = res.data
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  }
}

const fetchPrompts = async (): Promise<void> => {
  loading.value = true
  try {
    const res = await portalApi.getPrompts({
      page: page.value,
      pageSize,
      keyword: keyword.value || undefined,
      categoryId: activeCategory.value === '' ? undefined : activeCategory.value,
      sort: sort.value,
    })
    rows.value = res.data.rows
    total.value = res.data.total
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  } finally {
    loading.value = false
  }
}

const reload = (): void => {
  page.value = 1
  void fetchPrompts()
}

const selectCategory = (id: number | ''): void => {
  activeCategory.value = id
  reload()
}

const onFavoriteChanged = (id: number, favorited: boolean): void => {
  const target = rows.value.find((item) => item.id === id)
  if (target) {
    target.isFavorited = favorited
    target.favoriteCount = Math.max(0, (target.favoriteCount ?? 0) + (favorited ? 1 : -1))
  }
}

const goPublish = (): void => {
  void router.push('/portal/publish')
}

watch(
  () => route.query.keyword,
  (value) => {
    keyword.value = typeof value === 'string' ? value : ''
    reload()
  },
)

onMounted(async () => {
  await Promise.all([fetchCategories(), fetchPrompts()])
})
</script>

<style scoped>
.square-page {
  min-height: 60vh;
}

.square-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 6px 0 22px;
}

.square-hero h1 {
  margin: 0 0 6px;
  font-size: 24px;
  letter-spacing: 0.3px;
}

.square-hero p {
  margin: 0;
  font-size: 14px;
  color: var(--ink-3);
}

.square-hero-btn {
  border-radius: var(--radius-pill);
  padding: 0 20px;
  flex-shrink: 0;
}

.square-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  padding: 14px;
  margin-bottom: 18px;
  background: var(--card-bg);
  border-radius: var(--radius);
  box-shadow: var(--shadow-sm);
}

.category-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.pill {
  border: 1px solid transparent;
  background: var(--page-bg);
  color: var(--ink-2);
  border-radius: var(--radius-pill);
  padding: 7px 15px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
  font-family: var(--sans);
}

.pill:hover {
  color: var(--brand);
  background: var(--brand-soft);
}

.pill.active {
  background: var(--brand);
  border-color: var(--brand);
  color: #fff;
  font-weight: 500;
}

.square-toolbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-left: auto;
}

.square-count {
  font-size: 12px;
  color: var(--ink-3);
  white-space: nowrap;
}

.square-sort {
  width: 116px;
}

.square-grid-wrap {
  min-height: 240px;
}

/* 瀑布流：CSS 多列，卡片不被拆断 */
.square-grid {
  column-count: 4;
  column-gap: 16px;
}

.square-grid > * {
  break-inside: avoid;
  margin-bottom: 16px;
}

.square-pagination {
  display: flex;
  justify-content: center;
  margin-top: 22px;
}

@media (max-width: 1400px) {
  .square-grid {
    column-count: 3;
  }
}

@media (max-width: 1000px) {
  .square-grid {
    column-count: 2;
  }
}

@media (max-width: 640px) {
  .square-hero h1 {
    font-size: 20px;
  }

  .square-grid {
    column-count: 1;
  }
}
</style>
