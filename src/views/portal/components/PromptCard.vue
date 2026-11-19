<template>
  <article class="prompt-card" @click="openDetail">
    <div class="card-cover">
      <img v-if="prompt.coverImage" :src="prompt.coverImage" :alt="prompt.title" class="cover-image" loading="lazy" />
      <div v-else class="cover-placeholder">
        <el-icon :size="34"><Picture /></el-icon>
      </div>
      <div class="cover-shade">
        <span class="cover-stat">
          <el-icon><Star /></el-icon>
          {{ favoriteCount }}
        </span>
        <button
          type="button"
          class="cover-fav"
          :class="{ favorited }"
          :aria-label="favorited ? t('portal.favoriteRemove') : t('portal.favoriteAdd')"
          @click.stop="toggleFavorite"
        >
          <el-icon :size="16">
            <StarFilled v-if="favorited" />
            <Star v-else />
          </el-icon>
        </button>
      </div>
      <span v-if="prompt.categoryName" class="cover-category">{{ prompt.categoryName }}</span>
      <span v-if="isSequence" class="cover-sequence">{{ t('portal.sequenceBadge') }} · {{ stepCount }}</span>
    </div>

    <div class="card-body">
      <h3 class="card-title" :title="prompt.title">{{ prompt.title }}</h3>
      <div class="card-tags">
        <span class="card-model">{{ prompt.modelName }}</span>
      </div>
      <div class="card-author">
        <span class="author-avatar">{{ (prompt.authorName || '?').charAt(0) }}</span>
        <span class="author-name">{{ prompt.authorName || '-' }}</span>
        <span class="author-views">
          <el-icon><View /></el-icon>
          {{ prompt.viewCount ?? 0 }}
        </span>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Picture, View, Star, StarFilled } from '@element-plus/icons-vue'
import type { PortalPrompt } from '@/api/portal'
import { portalApi } from '@/api'
import { useUserStore } from '@/stores'
import { useI18n } from '@/i18n'
import { getErrorMessage } from '@/utils/error'

const props = defineProps<{ prompt: PortalPrompt }>()
const emit = defineEmits<{ (e: 'favorite-changed', id: number, favorited: boolean): void }>()

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

const favorited = ref(Boolean(props.prompt.isFavorited))
const favoriteCount = computed(() => (props.prompt.favoriteCount ?? 0) + (favorited.value === Boolean(props.prompt.isFavorited) ? 0 : favorited.value ? 1 : -1))
const isSequence = computed(() => props.prompt.type === 'sequence')
const stepCount = computed(() => t('portal.stepCount').replace('{n}', String(props.prompt.steps?.length ?? 0)))

watch(
  () => props.prompt.isFavorited,
  (value) => {
    favorited.value = Boolean(value)
  },
)

const openDetail = (): void => {
  void router.push(`/portal/prompts/${props.prompt.id}`)
}

const toggleFavorite = async (): Promise<void> => {
  if (!userStore.isLoggedIn) {
    ElMessage.warning(t('portal.loginRequired'))
    void router.push({ path: '/portal/login', query: { redirect: route.fullPath } })
    return
  }
  try {
    if (favorited.value) await portalApi.removeFavorite(props.prompt.id)
    else await portalApi.addFavorite(props.prompt.id)
    favorited.value = !favorited.value
    emit('favorite-changed', props.prompt.id, favorited.value)
  } catch (err: unknown) {
    ElMessage.error(getErrorMessage(err))
  }
}
</script>

<style scoped>
.prompt-card {
  background: var(--card-bg);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.15s ease;
}

.prompt-card:hover {
  border-color: var(--brand);
}

.card-cover {
  position: relative;
  width: 100%;
  background: linear-gradient(135deg, #e8ecff, #f4eaff);
  overflow: hidden;
}

.cover-image {
  display: block;
  width: 100%;
  height: auto;
  min-height: 150px;
}

.cover-placeholder {
  height: 180px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ink-3);
}

.cover-category {
  position: absolute;
  top: 10px;
  left: 10px;
  background: rgba(24, 26, 34, 0.62);
  color: #fff;
  font-size: 11px;
  padding: 3px 9px;
  border-radius: var(--radius-pill);
  backdrop-filter: blur(4px);
}

.cover-sequence {
  position: absolute;
  top: 10px;
  right: 10px;
  background: var(--brand);
  color: #fff;
  font-size: 11px;
  padding: 3px 9px;
  border-radius: var(--radius-pill);
}

.cover-shade {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding: 10px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.42), transparent 45%);
  opacity: 0;
  transition: opacity 0.18s;
}

.prompt-card:hover .cover-shade {
  opacity: 1;
}

.cover-stat {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #fff;
  font-size: 12px;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
}

.cover-fav {
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.92);
  color: var(--ink-2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
}

.cover-fav:hover,
.cover-fav.favorited {
  color: var(--brand);
}

.card-body {
  padding: 12px 13px 13px;
}

.card-title {
  margin: 0 0 9px;
  font-size: 14px;
  line-height: 1.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.card-tags {
  margin-bottom: 10px;
}

.card-model {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--brand);
  background: var(--brand-soft);
  padding: 3px 9px;
  border-radius: var(--radius-pill);
}

.card-author {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  color: var(--ink-3);
}

.author-avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: linear-gradient(135deg, #9aa4ff, #c59bff);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  flex-shrink: 0;
}

.author-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.author-views {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-left: auto;
  flex-shrink: 0;
}
</style>
