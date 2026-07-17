<template>
  <div class="header-search">
    <div ref="wrapperRef" class="search-wrapper">
      <el-input
        ref="searchInputRef"
        v-model="searchKeyword"
        :placeholder="t('search.placeholder')"
        :prefix-icon="Search"
        clearable
        class="search-input"
        @input="handleSearchInput"
        @focus="onFocus"
        @blur="onBlur"
        @keydown="handleKeydown"
        @clear="onClear"
      >
        <template #suffix>
          <span class="search-shortcut">{{ isMac ? '⌘K' : 'Ctrl+K' }}</span>
        </template>
      </el-input>
    </div>
  </div>

  <!-- 搜索下拉：渲染到 body 避免被任何祖先容器裁切 -->
  <Teleport to="body">
    <!-- 搜索历史 -->
    <div v-if="dropdownVisible && !searchKeyword && searchHistory.length > 0" class="search-results-dropdown" :style="dropdownStyle" @mousedown.prevent>
      <div class="search-history-header">
        <span class="search-history-title">{{ t('search.recentSearch') }}</span>
        <el-button text size="small" type="danger" @click="clearHistory">
          {{ t('search.clearHistory') }}
        </el-button>
      </div>
      <div v-for="item in searchHistory" :key="item" class="search-history-item" @click="searchFromHistory(item)">
        <el-icon class="history-icon">
          <Clock />
        </el-icon>
        <span class="history-text">{{ item }}</span>
      </div>
    </div>

    <!-- 搜索结果 -->
    <div
      v-else-if="dropdownVisible && searchKeyword && (searchResults.length > 0 || searched)"
      class="search-results-dropdown"
      :style="dropdownStyle"
      @mousedown.prevent
    >
      <template v-if="searchResults.length > 0">
        <div v-for="(group, groupIndex) in searchResults" :key="group.module" class="search-group">
          <div class="search-group-title">
            <MenuIcon :name="group.icon" :size="14" />
            {{ group.module }}
          </div>
          <div
            v-for="(item, itemIndex) in group.items"
            :key="item.id"
            class="search-item"
            :class="{
              active: searchActiveIndex === getFlatIndex(groupIndex, itemIndex),
            }"
            @click="handleSearchItemClick(item)"
            @mouseenter="searchActiveIndex = getFlatIndex(groupIndex, itemIndex)"
          >
            <div class="search-item-main">
              <!-- eslint-disable vue/no-v-html -->
              <span class="search-item-label" v-html="highlightText(item.label, searchKeyword)" />
              <!-- eslint-enable vue/no-v-html -->
              <el-tag v-if="item.status !== undefined" :type="item.status === 1 ? 'success' : 'danger'" size="small" effect="plain" class="search-item-tag">
                {{ item.status === 1 ? t('common.enable') : t('common.disable') }}
              </el-tag>
            </div>
            <!-- eslint-disable vue/no-v-html -->
            <span class="search-item-desc" v-html="highlightText(item.description, searchKeyword)" />
            <!-- eslint-enable vue/no-v-html -->
          </div>
        </div>
      </template>
      <div v-else class="search-empty">
        <el-icon :size="32">
          <Search />
        </el-icon>
        <p>{{ t('search.noResults') }}</p>
        <span class="search-empty-hint">{{ t('search.tryOtherKeywords') }}</span>
      </div>

      <!-- 搜索结果底部提示 -->
      <div v-if="searchResults.length > 0" class="search-footer-hint">
        <span>
          <kbd>↑↓</kbd>
          {{ t('search.navigate') }}
        </span>
        <span>
          <kbd>Enter</kbd>
          {{ t('search.open') }}
        </span>
        <span>
          <kbd>Esc</kbd>
          {{ t('search.close') }}
        </span>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { Search, Clock } from '@element-plus/icons-vue'
import { searchApi, type SearchGroup, type SearchItem } from '@/api'
import { useI18n } from '@/i18n'

const router = useRouter()
const { t } = useI18n()

const HISTORY_KEY = 'global_search_history'
const HISTORY_MAX = 10

// ==================== 状态 ====================
const searchFocused = ref(false)
const searchKeyword = ref('')
const searchResults = ref<SearchGroup[]>([])
const searched = ref(false)
const searchInputRef = ref<InstanceType<typeof import('element-plus').ElInput> | null>(null)
const wrapperRef = ref<HTMLDivElement | null>(null)
const searchActiveIndex = ref(-1)
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null
let positionRafId: number | null = null

// ==================== 平台检测 ====================
const isMac = computed(() => navigator.platform.toUpperCase().indexOf('MAC') >= 0)

// ==================== 搜索历史 ====================
const searchHistory = ref<string[]>(loadHistory())

function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveHistory(): void {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(searchHistory.value))
}

function addToHistory(keyword: string): void {
  const trimmed = keyword.trim()
  if (!trimmed) return
  const idx = searchHistory.value.indexOf(trimmed)
  if (idx > -1) searchHistory.value.splice(idx, 1)
  searchHistory.value.unshift(trimmed)
  if (searchHistory.value.length > HISTORY_MAX) searchHistory.value.pop()
  saveHistory()
}

function clearHistory(): void {
  searchHistory.value = []
  saveHistory()
}

function searchFromHistory(keyword: string): void {
  searchKeyword.value = keyword
  searchFocused.value = true
  doSearch(keyword)
}

// ==================== 下拉定位 ====================
const dropdownVisible = computed(() => searchFocused.value && searchInputRef.value)

const positionVersion = ref(0)

const dropdownStyle = computed<Record<string, string>>(() => {
  void positionVersion.value
  const wrapper = wrapperRef.value
  if (!wrapper) return { visibility: 'hidden', position: 'fixed', top: '0', left: '0', width: '0', zIndex: '0' }
  const rect = wrapper.getBoundingClientRect()
  return {
    position: 'fixed',
    top: `${rect.bottom + 6}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    zIndex: '9999',
    visibility: 'visible',
  }
})

// 监听窗口滚动/大小变化，更新下拉位置
function updatePosition(): void {
  if (positionRafId) return
  positionRafId = window.requestAnimationFrame(() => {
    positionRafId = null
    positionVersion.value++
  })
}

// ==================== 文本高亮 ====================
function highlightText(text: string, keyword: string): string {
  if (!text || !keyword) return escapeHtml(text || '')
  const escaped = escapeHtml(text)
  const escapedKw = escapeRegex(keyword)
  return escaped.replace(new RegExp(`(${escapedKw})`, 'gi'), '<mark class="search-highlight">$1</mark>')
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// ==================== 搜索 ====================
async function doSearch(keyword: string): Promise<void> {
  const trimmed = keyword.trim()
  if (!trimmed) {
    searchResults.value = []
    searched.value = false
    return
  }

  try {
    const res = await searchApi.search(trimmed)
    searchResults.value = (res.data as SearchGroup[]) || []
    searched.value = true
    searchActiveIndex.value = -1
  } catch {
    searchResults.value = []
    searched.value = true
  }
}

function handleSearchInput(): void {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
  const trimmed = searchKeyword.value.trim()
  if (!trimmed) {
    searchResults.value = []
    searched.value = false
    return
  }
  updatePosition()
  searchDebounceTimer = setTimeout(() => {
    doSearch(trimmed)
  }, 300)
}

// ==================== 键盘导航 ====================
function getFlatIndex(groupIndex: number, itemIndex: number): number {
  let flat = 0
  for (let g = 0; g < groupIndex; g++) {
    flat += searchResults.value[g]?.items?.length || 0
  }
  return flat + itemIndex
}

function getFlatCount(): number {
  return searchResults.value.reduce((sum: number, g: SearchGroup) => sum + (g.items?.length || 0), 0)
}

function handleKeydown(e: Event | KeyboardEvent): void {
  const ke = e as KeyboardEvent
  const total = getFlatCount()

  switch (ke.key) {
    case 'ArrowDown':
      ke.preventDefault()
      if (total === 0) return
      searchActiveIndex.value = searchActiveIndex.value < total - 1 ? searchActiveIndex.value + 1 : 0
      break
    case 'ArrowUp':
      ke.preventDefault()
      if (total === 0) return
      searchActiveIndex.value = searchActiveIndex.value > 0 ? searchActiveIndex.value - 1 : total - 1
      break
    case 'Enter': {
      const item = findItemByFlatIndex(searchActiveIndex.value)
      if (item) {
        handleSearchItemClick(item)
      } else if (total > 0) {
        const firstItem = searchResults.value[0]?.items?.[0]
        if (firstItem) handleSearchItemClick(firstItem)
      }
      break
    }
    case 'Escape':
      searchInputRef.value?.blur()
      searchFocused.value = false
      break
    default:
      break
  }
}

function findItemByFlatIndex(flatIndex: number): SearchItem | null {
  let count = 0
  for (const group of searchResults.value) {
    for (const item of group.items) {
      if (count === flatIndex) return item
      count++
    }
  }
  return null
}

// ==================== 结果操作 ====================
function handleSearchItemClick(item: SearchItem): void {
  addToHistory(searchKeyword.value)
  searchKeyword.value = ''
  searchResults.value = []
  searched.value = false
  searchFocused.value = false
  if (item.url && item.url !== '#') {
    router.push(item.url)
  }
}

// ==================== 聚焦/失焦 ====================
function onFocus(): void {
  searchFocused.value = true
  nextTick(() => {
    updatePosition()
  })
}

function onBlur(): void {
  setTimeout(() => {
    searchFocused.value = false
  }, 200)
}

function onClear(): void {
  searchResults.value = []
  searched.value = false
  searchActiveIndex.value = -1
}

// ==================== 全局快捷键 + 滚动监听 ====================
function handleGlobalKeydown(e: KeyboardEvent): void {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    searchInputRef.value?.focus()
  }
}

function handleWindowClick(e: MouseEvent): void {
  if (!wrapperRef.value) return
  if (!wrapperRef.value.contains(e.target as Node)) {
    searchFocused.value = false
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleGlobalKeydown)
  document.addEventListener('click', handleWindowClick)
  window.addEventListener('scroll', updatePosition, true)
  window.addEventListener('resize', updatePosition)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleGlobalKeydown)
  document.removeEventListener('click', handleWindowClick)
  window.removeEventListener('scroll', updatePosition, true)
  window.removeEventListener('resize', updatePosition)
  if (positionRafId) cancelAnimationFrame(positionRafId)
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer)
})
</script>

<style lang="scss" scoped>
.header-search {
  flex: 0 1 auto;
  display: flex;
  justify-content: flex-end;
  margin-left: auto;
  padding: 0 20px;
  position: relative;
  z-index: 1;
  min-width: 0;
}

.search-wrapper {
  position: relative;
  width: 100%;
  max-width: 320px;
}

.search-input {
  height: 34px;
}

/* ========== 移动端适配 ========== */
@media (max-width: 767px) {
  .header-search {
    display: none;
  }
}

.search-input :deep(.el-input__wrapper) {
  background: none !important;
  border: 1px solid var(--border-light);
  border-radius: 8px;
  box-shadow: none;
  transition: all 0.2s;
}

.search-input :deep(.el-input__wrapper:hover) {
  border-color: var(--mainColor);
  background: transparent;
}

.search-input :deep(.el-input__wrapper.is-focus) {
  border-color: var(--mainColor);
  background: transparent;
  box-shadow: none;
}

.search-input :deep(.el-input__inner) {
  font-size: 13px;
  color: var(--text-regular);
}

.search-input :deep(.el-input__inner::placeholder) {
  color: var(--text-secondary);
}

.search-shortcut {
  padding: 0 6px;
  height: 20px;
  line-height: 20px;
  background: var(--border-lighter);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 11px;
  color: var(--text-secondary);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  margin-right: -4px;
  white-space: nowrap;
}

/* ================== 下拉面板（Teleport 到 body，position: fixed） ================== */
.search-results-dropdown {
  position: fixed !important;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
  box-shadow:
    0 12px 32px rgba(0, 0, 0, 0.12),
    0 4px 8px rgba(0, 0, 0, 0.06),
    0 0 0 1px rgba(0, 0, 0, 0.03);
  padding: 6px;
  max-height: 420px;
  overflow-y: auto;
  z-index: 9999 !important;
  pointer-events: auto;
}

/* ================== 搜索历史 ================== */
.search-history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px 4px;
}

.search-history-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.search-history-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
  font-size: 14px;
  color: var(--text-primary);
}

.search-history-item:hover {
  background: var(--el-color-primary-light-9);
}

.history-icon {
  color: var(--text-placeholder);
  font-size: 14px;
  flex-shrink: 0;
}

.history-text {
  font-size: 14px;
  color: var(--text-primary);
}

/* ================== 搜索结果 ================== */
.search-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 0 32px;
  color: var(--text-secondary);
}

.search-empty p {
  margin: 16px 0 4px;
  font-size: 14px;
  color: var(--text-regular);
}

.search-empty-hint {
  font-size: 12px;
  color: var(--text-placeholder);
}

.search-group {
  margin-top: 2px;
  padding: 0 2px;

  &:first-child {
    margin-top: 0;
  }
}

.search-group-title {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.search-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  margin: 0 -2px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  gap: 12px;
}

.search-item:hover,
.search-item.active {
  background: var(--mainColor);
  color: #fff;
}

.search-item-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.search-item-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.search-item-tag {
  flex-shrink: 0;
}

.search-item-desc {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 50%;
  flex-shrink: 0;
}

/* ================== 高亮 ================== */
:deep(.search-highlight) {
  background: var(--el-color-warning-light-7);
  color: var(--text-primary);
  border-radius: 2px;
  padding: 0 2px;
  font-weight: 600;
}

/* ================== 底部导航提示 ================== */
.search-footer-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 8px 0 6px;
  margin-top: 4px;
  border-top: 1px solid var(--border-light);
  font-size: 11px;
  color: var(--text-placeholder);
}

.search-footer-hint kbd {
  display: inline-block;
  padding: 0 4px;
  height: 18px;
  line-height: 18px;
  background: var(--border-lighter);
  border: 1px solid var(--border-dark);
  border-radius: 3px;
  font-size: 10px;
  font-family: inherit;
  margin-right: 2px;
  color: var(--text-regular);
}
</style>

<!-- Teleport 内容需要非 scoped 样式才能正确应用到 body 下的元素 -->
<style lang="scss">
.search-results-dropdown {
  position: fixed !important;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
  box-shadow:
    0 12px 32px rgba(0, 0, 0, 0.12),
    0 4px 8px rgba(0, 0, 0, 0.06),
    0 0 0 1px rgba(0, 0, 0, 0.03);
  padding: 6px;
  max-height: 420px;
  overflow-y: auto;
  z-index: 9999 !important;
  pointer-events: auto;
}

.search-results-dropdown .search-history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px 4px;
}

.search-results-dropdown .search-history-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.search-results-dropdown .search-history-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
  font-size: 14px;
  color: var(--text-primary);
}

.search-results-dropdown .search-history-item:hover {
  background: var(--mainColor);
  color: #fff;
}

.search-results-dropdown .history-icon {
  color: var(--text-placeholder);
  font-size: 14px;
  flex-shrink: 0;
}

.search-results-dropdown .history-text {
  font-size: 14px;
  color: var(--text-primary);
}

.search-results-dropdown .search-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 0 32px;
  color: var(--text-secondary);
}

.search-results-dropdown .search-empty p {
  margin: 16px 0 4px;
  font-size: 14px;
  color: var(--text-regular);
}

.search-results-dropdown .search-empty-hint {
  font-size: 12px;
  color: var(--text-placeholder);
}

.search-results-dropdown .search-group {
  margin-top: 2px;
  padding: 0 2px;
}

.search-results-dropdown .search-group:first-child {
  margin-top: 0;
}

.search-results-dropdown .search-group-title {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.search-results-dropdown .search-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  margin: 0 -2px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  gap: 12px;
}

.search-results-dropdown .search-item:hover,
.search-results-dropdown .search-item.active {
  background: var(--mainColor);
  color: #fff;
}

.search-results-dropdown .search-item:hover .search-item-desc,
.search-results-dropdown .search-item.active .search-item-desc {
  color: rgba(255, 255, 255, 0.75);
}

.search-results-dropdown .search-item-main {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1;
}

.search-results-dropdown .search-item-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.search-results-dropdown .search-item-tag {
  flex-shrink: 0;
}

.search-results-dropdown .search-item-desc {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 50%;
  flex-shrink: 0;
}

.search-results-dropdown .search-highlight {
  background: var(--el-color-warning-light-7);
  color: var(--text-primary);
  border-radius: 2px;
  padding: 0 2px;
  font-weight: 600;
}

.search-results-dropdown .search-footer-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 8px 0 6px;
  margin-top: 4px;
  border-top: 1px solid var(--border-light);
  font-size: 11px;
  color: var(--text-placeholder);
}

.search-results-dropdown .search-footer-hint kbd {
  display: inline-block;
  padding: 0 4px;
  height: 18px;
  line-height: 18px;
  background: var(--border-lighter);
  border: 1px solid var(--border-dark);
  border-radius: 3px;
  font-size: 10px;
  font-family: inherit;
  margin-right: 2px;
  color: var(--text-regular);
}
</style>
