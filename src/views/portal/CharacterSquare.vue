<template>
  <div class="character-page">
    <header class="character-hero">
      <div class="character-hero-text">
        <h1>{{ t('portal.characterSquareTitle') }}</h1>
        <p>{{ t('portal.characterSquareSubtitle') }}</p>
      </div>
      <el-button v-if="isLoggedIn" type="primary" :icon="EditPen" @click="goPublish">{{ t('portal.publishCharacter') }}</el-button>
    </header>

    <div v-loading="loading" class="character-grid">
      <router-link v-for="item in rows" :key="item.id" :to="`/portal/prompts/${item.id}`" class="character-card">
        <div class="character-cover-wrap">
          <img v-if="item.coverImage" :src="item.coverImage" :alt="item.title" class="character-cover" />
          <div v-else class="character-cover-empty">
            <el-icon :size="30"><Avatar /></el-icon>
          </div>
        </div>
        <div class="character-body">
          <h3 class="character-title">{{ item.title }}</h3>
          <p class="character-desc">{{ item.content || t('portal.characterNoDesc') }}</p>
          <div class="character-meta">
            <span>{{ item.authorName || '-' }}</span>
            <span class="character-views">
              <el-icon><View /></el-icon>
              {{ item.viewCount ?? 0 }}
            </span>
          </div>
        </div>
      </router-link>
      <el-empty v-if="!loading && !rows.length" :description="t('portal.characterEmpty')" class="character-empty" />
    </div>

    <div v-if="hasMore" class="character-more">
      <el-button :loading="loading" @click="loadMore">{{ t('portal.poseLoadMore') }}</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Avatar, EditPen, View } from '@element-plus/icons-vue'
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

const load = async (): Promise<void> => {
  loading.value = true
  try {
    const res = await portalApi.getPrompts({ page: page.value, pageSize, scope: 'character' })
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
  void router.push('/portal/publish-character')
}

onMounted(() => void load())
</script>

<style scoped>
.character-page {
  width: min(1680px, 100%);
  margin: 0 auto;
}
.character-hero {
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
.character-hero h1 {
  margin: 0 0 6px;
  font-size: 22px;
}
.character-hero p {
  margin: 0;
  font-size: 13px;
  opacity: 0.85;
}
.character-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 16px;
  min-height: 200px;
}
.character-card {
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
.character-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-md, 0 8px 24px rgba(0, 0, 0, 0.1));
}
.character-cover-wrap {
  height: 220px;
  background: var(--page-bg);
}
.character-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.character-cover-empty {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ink-3);
}
.character-body {
  padding: 12px 14px 14px;
}
.character-title {
  margin: 0 0 6px;
  font-size: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.character-desc {
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
.character-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--ink-3);
}
.character-views {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.character-empty {
  grid-column: 1 / -1;
}
.character-more {
  display: flex;
  justify-content: center;
  margin-top: 20px;
}
</style>
