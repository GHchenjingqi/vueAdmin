<template>
  <div class="skill-page">
    <header class="skill-hero">
      <div class="skill-hero-text">
        <h1>{{ t('portal.skillSquareTitle') }}</h1>
        <p>{{ t('portal.skillSquareSubtitle') }}</p>
      </div>
    </header>

    <div v-loading="loading" class="skill-grid">
      <article v-for="item in rows" :key="item.id" class="skill-card">
        <div class="skill-card-head">
          <div class="skill-card-icon">
            <el-icon :size="22"><Document /></el-icon>
          </div>
          <div class="skill-card-heading">
            <h3 class="skill-card-title">{{ item.title }}</h3>
            <span class="skill-card-date">{{ formatDate(item.createdAt) }} · {{ t('portal.viewCount') }} {{ item.viewCount ?? 0 }}</span>
          </div>
        </div>
        <p class="skill-card-desc">{{ item.description || t('portal.skillNoDesc') }}</p>
        <div class="skill-downloads">
          <div class="skill-downloads-label">{{ t('portal.skillDownloadList') }}（{{ item.attachments?.length ?? 0 }}）</div>
          <a v-for="file in item.attachments" :key="file.id" class="skill-download-item" :href="downloadUrl(item.id, file.id)" :download="file.name">
            <el-icon class="skill-file-icon"><Files /></el-icon>
            <span class="skill-file-name">{{ file.name }}</span>
            <span class="skill-file-size">{{ formatSize(file.size) }}</span>
            <el-icon class="skill-download-icon"><Download /></el-icon>
          </a>
          <div v-if="!item.attachments?.length" class="skill-no-files">{{ t('portal.skillNoFiles') }}</div>
        </div>
      </article>
      <el-empty v-if="!loading && !rows.length" :description="t('portal.skillEmpty')" class="skill-empty" />
    </div>

    <div v-if="hasMore" class="skill-more">
      <el-button :loading="loading" @click="loadMore">{{ t('portal.poseLoadMore') }}</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Document, Files, Download } from '@element-plus/icons-vue'
import { skillApi, type SkillItem } from '@/api'
import { useI18n } from '@/i18n'
import { getErrorMessage } from '@/utils/error'

const { t } = useI18n()

const rows = ref<SkillItem[]>([])
const loading = ref(false)
const page = ref(1)
const total = ref(0)
const pageSize = 12

const hasMore = computed(() => rows.value.length < total.value)

const formatDate = (value: unknown): string => (value ? new Date(String(value)).toLocaleDateString() : '-')
const formatSize = (bytes: number): string => {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
const downloadUrl = (skillId: number, attachmentId: string): string => skillApi.attachmentDownloadUrl(skillId, attachmentId)

const load = async (): Promise<void> => {
  loading.value = true
  try {
    const res = await skillApi.getPortalSkills({ page: page.value, pageSize })
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

onMounted(() => void load())
</script>

<style scoped>
.skill-page {
  width: min(1680px, 100%);
  margin: 0 auto;
}
.skill-hero {
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
.skill-hero h1 {
  margin: 0 0 6px;
  font-size: 22px;
  color: #fff;
}
.skill-hero p {
  margin: 0;
  font-size: 13px;
  opacity: 0.85;
}
.skill-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 16px;
  min-height: 200px;
}
.skill-card {
  display: flex;
  flex-direction: column;
  padding: 18px;
  border-radius: var(--radius);
  background: var(--card-bg);
  border: 1px solid var(--line);
  transition:
    transform 0.18s,
    box-shadow 0.18s;
}
.skill-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-md, 0 8px 24px rgba(0, 0, 0, 0.1));
}
.skill-card-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}
.skill-card-icon {
  flex: 0 0 42px;
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background: var(--brand-soft);
  color: var(--brand);
}
.skill-card-heading {
  min-width: 0;
  flex: 1;
}
.skill-card-title {
  margin: 0 0 3px;
  font-size: 16px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.skill-card-date {
  font-size: 11px;
  color: var(--ink-3);
}
.skill-card-desc {
  margin: 0 0 14px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--ink-2);
  white-space: pre-wrap;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 44px;
}
.skill-downloads {
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}
.skill-downloads-label {
  margin-bottom: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-3);
}
.skill-download-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  margin-bottom: 6px;
  border-radius: 8px;
  background: var(--page-bg);
  color: var(--ink);
  text-decoration: none;
  font-size: 13px;
  transition: background 0.15s;
}
.skill-download-item:hover {
  background: var(--brand-soft);
  color: var(--brand);
}
.skill-file-icon {
  flex: 0 0 auto;
  color: var(--brand);
}
.skill-file-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.skill-file-size {
  flex: 0 0 auto;
  font-size: 11px;
  color: var(--ink-3);
}
.skill-download-icon {
  flex: 0 0 auto;
  color: var(--brand);
}
.skill-no-files {
  font-size: 12px;
  color: var(--ink-3);
}
.skill-empty {
  grid-column: 1 / -1;
}
.skill-more {
  display: flex;
  justify-content: center;
  margin-top: 20px;
}
</style>
