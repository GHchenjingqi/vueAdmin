<template>
  <div class="favorites-page">
    <div class="favorites-head">
      <h1>{{ t('portal.favoritesTitle') }}</h1>
      <p>{{ t('portal.favoritesSubtitle') }}</p>
    </div>

    <div v-loading="loading" class="favorites-grid-wrap">
      <div v-if="rows.length" class="square-grid">
        <PromptCard v-for="item in rows" :key="item.id" :prompt="item" @favorite-changed="onFavoriteChanged" />
      </div>
      <el-empty v-else-if="!loading" :description="t('portal.favoritesEmpty')">
        <el-button type="primary" @click="goSquare">{{ t('portal.backToSquare') }}</el-button>
      </el-empty>
    </div>

    <div v-if="total > pageSize" class="favorites-pagination">
      <el-pagination v-model:current-page="page" :page-size="pageSize" :total="total" layout="prev, pager, next" background @current-change="fetchList" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { portalApi, type PortalPrompt } from '@/api'
import { useUserStore } from '@/stores'
import { useI18n } from '@/i18n'
import { getErrorMessage } from '@/utils/error'
import PromptCard from './components/PromptCard.vue'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const rows = ref<PortalPrompt[]>([])
const page = ref(1)
const pageSize = 12
const total = ref(0)
const loading = ref(false)

const fetchList = async (): Promise<void> => {
  loading.value = true
  try {
    const res = await portalApi.getFavorites({ page: page.value, pageSize })
    rows.value = res.data.rows
    total.value = res.data.total
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  } finally {
    loading.value = false
  }
}

const onFavoriteChanged = (): void => {
  void fetchList()
}

const goSquare = (): void => {
  void router.push('/portal/prompts')
}

onMounted(() => {
  if (!userStore.isLoggedIn) {
    ElMessage.warning(t('portal.loginRequired'))
    void router.push({ path: '/portal/login', query: { redirect: route.fullPath } })
    return
  }
  void fetchList()
})
</script>

<style scoped>
.favorites-head {
  margin-bottom: 22px;
}

.favorites-head h1 {
  margin: 0 0 6px;
  font-size: 24px;
}

.favorites-head p {
  margin: 0;
  font-size: 13px;
  color: var(--ink-3);
}

.square-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 16px;
}

.favorites-grid-wrap {
  min-height: 220px;
}

.favorites-pagination {
  display: flex;
  justify-content: center;
  margin-top: 28px;
}
</style>
