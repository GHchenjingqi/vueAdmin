<template>
  <div class="costume-page">
    <section class="costume-hero">
      <div class="costume-hero-copy">
        <div class="costume-kicker">CHINESE COSTUME · 历代服饰考据</div>
        <h1>{{ t('portal.costumeTitle') }}</h1>
        <p class="costume-lead">{{ t('portal.costumeSubtitle') }}</p>
        <p class="costume-desc">{{ t('portal.costumeDesc') }}</p>
      </div>
      <div class="costume-stats">
        <div class="costume-stat">
          <strong>{{ costumeData.eras.length }}</strong>
          <span>{{ t('portal.costumeEras') }}</span>
        </div>
        <div class="costume-stat">
          <strong>{{ costumeData.forms.length }}</strong>
          <span>{{ t('portal.costumeForms') }}</span>
        </div>
        <div class="costume-stat">
          <strong>{{ costumeData.prompts.length }}</strong>
          <span>{{ t('portal.costumePrompts') }}</span>
        </div>
      </div>
    </section>

    <div class="costume-panel">
      <div class="segmented costume-tabs">
        <button type="button" :class="{ active: tab === 'table' }" @click="tab = 'table'">{{ t('portal.costumeTabTable') }}</button>
        <button type="button" :class="{ active: tab === 'prompts' }" @click="tab = 'prompts'">{{ t('portal.costumeTabPrompts') }}</button>
      </div>

      <div class="costume-filters">
        <div class="filter-block">
          <label>{{ t('portal.costumeEra') }}</label>
          <el-select v-model="era" style="width: 160px">
            <el-option :label="t('portal.allCategories')" value="" />
            <el-option v-for="name in costumeData.eras" :key="name" :label="name" :value="name" />
          </el-select>
        </div>
        <div class="filter-block">
          <label>{{ t('portal.costumeGender') }}</label>
          <el-select v-model="gender" style="width: 120px">
            <el-option :label="t('portal.allCategories')" value="" />
            <el-option v-for="name in genderOptions" :key="name" :label="name" :value="name" />
          </el-select>
        </div>
        <div class="filter-block">
          <label>{{ t('portal.costumeScene') }}</label>
          <el-select v-model="scene" style="width: 120px">
            <el-option :label="t('portal.allCategories')" value="" />
            <el-option v-for="name in costumeData.scenes" :key="name" :label="name" :value="name" />
          </el-select>
        </div>
        <div class="filter-block filter-search">
          <label>{{ t('portal.costumeSearch') }}</label>
          <el-input v-model="keyword" clearable :placeholder="t('portal.costumeSearchPlaceholder')" />
        </div>
        <button type="button" class="reset-btn" @click="resetFilters">{{ t('portal.costumeReset') }}</button>
      </div>
    </div>

    <div class="result-head">
      <div class="result-title">
        <strong>{{ filteredForms.length }}</strong>
        {{ t('portal.costumeForms') }} · {{ filteredPrompts.length }} {{ t('portal.costumePrompts') }}
      </div>
      <div class="result-tip">{{ t('portal.costumeShown', { n: visibleCount, total: filteredForms.length + filteredPrompts.length }) }}</div>
    </div>

    <div v-if="tab === 'table'" class="costume-table-wrap">
      <el-table :data="visibleForms" border stripe style="width: 100%">
        <el-table-column prop="era" :label="t('portal.costumeEra')" width="100" />
        <el-table-column prop="years" :label="t('portal.costumeYears')" width="140" />
        <el-table-column prop="gender" :label="t('portal.costumeGender')" width="68" />
        <el-table-column prop="scene" :label="t('portal.costumeScene')" width="76" />
        <el-table-column prop="form" :label="t('portal.costumeForm')" min-width="150" />
        <el-table-column prop="detail" :label="t('portal.costumeDetail')" min-width="280" />
        <el-table-column prop="accessories" :label="t('portal.costumeAccessories')" min-width="220" />
        <el-table-column prop="makeup" :label="t('portal.costumeMakeup')" min-width="200" />
      </el-table>
      <div v-if="!visibleForms.length" class="costume-empty">
        <el-empty :description="t('portal.costumeEmpty')" />
      </div>
    </div>

    <div v-else class="costume-prompt-grid">
      <article v-for="item in visiblePrompts" :key="item.id" class="costume-card">
        <div class="costume-card-head">
          <span class="tag era">{{ item.era }}</span>
          <span class="tag scene">{{ item.gender }} · {{ item.scene }}</span>
          <span class="tag years">{{ item.years }}</span>
        </div>
        <div class="costume-form">{{ item.form }}</div>
        <div class="costume-block">
          <div class="costume-label">{{ t('portal.costumePositive') }}</div>
          <div class="costume-prompt">{{ isEn ? item.promptEn : item.promptZh }}</div>
        </div>
        <div class="costume-anchors">
          <span v-for="anchor in item.anchors" :key="anchor" class="anchor">{{ anchor }}</span>
        </div>
        <div class="costume-avoid">{{ t('portal.costumeAvoid') }}：{{ item.avoid.join('、') }}</div>
        <div class="costume-negatives">
          <div v-for="(neg, index) in isEn ? item.negativeEn : item.negativeZh" :key="index" class="negative">{{ neg }}</div>
        </div>
        <div class="costume-actions">
          <el-button size="small" @click="copyPrompt(item, 'current')">{{ t('portal.costumeCopy') }}</el-button>
          <el-button size="small" @click="copyPrompt(item, 'zh')">{{ t('portal.costumeCopyZh') }}</el-button>
          <el-button size="small" @click="copyPrompt(item, 'en')">{{ t('portal.costumeCopyEn') }}</el-button>
        </div>
      </article>
      <div v-if="!visiblePrompts.length" class="costume-empty">
        <el-empty :description="t('portal.costumeEmpty')" />
      </div>
    </div>

    <div v-if="visibleCount < filteredForms.length + filteredPrompts.length" class="load-more">
      <el-button @click="visibleCount += 20">{{ t('portal.poseLoadMore') }}</el-button>
    </div>

    <el-drawer v-model="methodOpen" :title="t('portal.costumeMethodTitle')" size="460px">
      <div class="method-body">
        <div class="costume-label">{{ t('portal.costumeFormula') }}</div>
        <div class="method-formula">{{ costumeData.methodology.formula }}</div>
        <div class="costume-label method-label">{{ t('portal.costumePrinciples') }}</div>
        <ol>
          <li v-for="principle in costumeData.methodology.principles" :key="principle">{{ principle }}</li>
        </ol>
        <div class="costume-label method-label">{{ t('portal.costumeTermMap') }}</div>
        <div v-for="(en, zh) in costumeData.methodology.termMap" :key="zh" class="method-term">
          <span>{{ zh }}</span>
          <span>{{ en }}</span>
        </div>
        <div class="costume-label method-label">{{ t('portal.costumeReferences') }}</div>
        <div v-for="book in costumeData.methodology.references" :key="book.title" class="method-ref">
          <strong>《{{ book.title }}》</strong>
          <span>{{ book.author }}</span>
          <p>{{ book.note }}</p>
        </div>
      </div>
    </el-drawer>

    <button type="button" class="method-trigger" @click="methodOpen = true">{{ t('portal.costumeMethod') }}</button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { costumeData, type CostumePromptEntry } from '@/data/costumes'
import { useI18n } from '@/i18n'

const { t, locale } = useI18n()
const isEn = computed(() => locale.value === 'en-US')

const tab = ref<'table' | 'prompts'>('prompts')
const era = ref('')
const gender = ref('')
const scene = ref('')
const keyword = ref('')
const visibleCount = ref(20)
const methodOpen = ref(false)

const genderOptions = computed(() =>
  era.value ? [...new Set(costumeData.forms.filter((row) => row.era === era.value).map((row) => row.gender))] : costumeData.genders,
)

const matches = (item: { era: string; gender: string; scene: string }, text: string): boolean => {
  if (era.value && item.era !== era.value) return false
  if (gender.value && item.gender !== gender.value) return false
  if (scene.value && item.scene !== scene.value) return false
  if (!keyword.value) return true
  const key = keyword.value.trim().toLowerCase()
  return text.toLowerCase().includes(key)
}

const filteredForms = computed(() =>
  costumeData.forms.filter((row) => matches(row, [row.era, row.years, row.gender, row.scene, row.form, row.detail, row.accessories, row.makeup].join(' '))),
)
const filteredPrompts = computed(() =>
  costumeData.prompts.filter((item) =>
    matches(item, [item.era, item.years, item.gender, item.scene, item.form, item.promptZh, item.promptEn, ...item.anchors].join(' ')),
  ),
)

const visibleForms = computed(() => (tab.value === 'table' ? filteredForms.value.slice(0, visibleCount.value) : []))
const visiblePrompts = computed(() => (tab.value === 'prompts' ? filteredPrompts.value.slice(0, visibleCount.value) : []))

const resetFilters = (): void => {
  era.value = ''
  gender.value = ''
  scene.value = ''
  keyword.value = ''
  visibleCount.value = 20
}

const promptText = (item: CostumePromptEntry, mode: 'current' | 'zh' | 'en'): string => {
  if (mode === 'zh') return item.promptZh
  if (mode === 'en') return item.promptEn
  return isEn.value ? item.promptEn : item.promptZh
}

const copyPrompt = async (item: CostumePromptEntry, mode: 'current' | 'zh' | 'en'): Promise<void> => {
  try {
    await navigator.clipboard.writeText(promptText(item, mode))
    ElMessage.success(t('portal.costumeCopied'))
  } catch {
    ElMessage.error(t('portal.costumeCopyFailed'))
  }
}
</script>

<style scoped>
.costume-page {
  padding-bottom: 40px;
}
.costume-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 32px;
  padding: 30px 32px;
  background: var(--card-bg);
  border: 1px solid var(--line);
  border-radius: var(--radius);
}
.costume-kicker {
  color: var(--brand);
  font-size: 12px;
  letter-spacing: 1px;
  margin-bottom: 8px;
}
.costume-hero h1 {
  margin: 0;
  font-size: 26px;
  font-weight: 600;
  color: var(--ink);
}
.costume-lead {
  margin: 10px 0 0;
  font-size: 14px;
  color: var(--ink-2);
}
.costume-desc {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--ink-3);
}
.costume-stats {
  display: flex;
  gap: 28px;
  flex-shrink: 0;
}
.costume-stat {
  text-align: center;
}
.costume-stat strong {
  display: block;
  font-size: 24px;
  color: var(--brand);
}
.costume-stat span {
  font-size: 12px;
  color: var(--ink-3);
}
.costume-panel {
  margin-top: 16px;
  padding: 18px 20px;
  background: var(--card-bg);
  border: 1px solid var(--line);
  border-radius: var(--radius);
}
.segmented {
  display: inline-flex;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.segmented button {
  border: 0;
  background: var(--card-bg);
  color: var(--ink-2);
  font-size: 13px;
  padding: 7px 18px;
  cursor: pointer;
}
.segmented button.active {
  background: var(--brand);
  color: #fff;
}
.costume-filters {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  margin-top: 16px;
  flex-wrap: wrap;
}
.filter-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.filter-block label {
  font-size: 12px;
  color: var(--ink-3);
}
.filter-search {
  flex: 1;
  min-width: 200px;
}
.reset-btn {
  border: 1px solid var(--line-strong);
  background: var(--card-bg);
  color: var(--ink-2);
  font-size: 13px;
  padding: 7px 16px;
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.result-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 20px 0 12px;
}
.result-title {
  font-size: 13px;
  color: var(--ink-2);
}
.result-title strong {
  color: var(--brand);
}
.result-tip {
  font-size: 12px;
  color: var(--ink-3);
}
.costume-table-wrap {
  background: var(--card-bg);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 12px;
}
.costume-prompt-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 16px;
}
.costume-card {
  background: var(--card-bg);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 18px;
}
.costume-card-head {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.tag {
  font-size: 11px;
  padding: 2px 9px;
  border-radius: var(--radius-pill);
  line-height: 1.6;
}
.tag.era {
  background: var(--brand-soft);
  color: var(--brand);
}
.tag.scene {
  background: var(--page-bg);
  color: var(--ink-2);
  border: 1px solid var(--line);
}
.tag.years {
  background: var(--page-bg);
  color: var(--ink-3);
}
.costume-form {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
  margin-bottom: 12px;
}
.costume-label {
  font-size: 11px;
  color: var(--ink-3);
  margin-bottom: 4px;
}
.costume-block {
  margin-bottom: 10px;
}
.costume-prompt {
  background: var(--page-bg);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--ink-2);
}
.costume-anchors {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin: 8px 0;
}
.anchor {
  font-size: 11px;
  background: var(--page-bg);
  color: var(--ink-2);
  border: 1px solid var(--line);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
}
.costume-avoid {
  font-size: 11px;
  color: #b4543b;
  margin-top: 6px;
}
.costume-negatives {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
  margin-top: 8px;
}
.negative {
  font-size: 11px;
  color: var(--ink-3);
  background: var(--page-bg);
  padding: 2px 7px;
  border-radius: var(--radius-sm);
}
.costume-actions {
  display: flex;
  gap: 8px;
  margin-top: 14px;
}
.costume-empty {
  grid-column: 1 / -1;
}
.load-more {
  display: flex;
  justify-content: center;
  margin-top: 24px;
}
.method-trigger {
  position: fixed;
  right: 24px;
  bottom: 24px;
  border: 1px solid var(--line-strong);
  background: var(--card-bg);
  color: var(--brand);
  font-size: 12px;
  padding: 8px 16px;
  border-radius: var(--radius-pill);
  cursor: pointer;
  box-shadow: var(--shadow-md);
}
.method-body {
  font-size: 13px;
  color: var(--ink-2);
  line-height: 1.7;
}
.method-formula {
  background: var(--brand-soft);
  color: var(--brand);
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  margin-bottom: 18px;
}
.method-label {
  margin-top: 18px;
}
.method-body ol {
  padding-left: 20px;
  margin: 8px 0 0;
}
.method-body li {
  margin-bottom: 8px;
}
.method-term {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--line);
  padding: 5px 0;
  font-size: 12px;
}
.method-ref {
  padding: 8px 0;
  border-bottom: 1px solid var(--line);
}
.method-ref strong {
  color: var(--ink);
  font-weight: 500;
}
.method-ref span {
  color: var(--ink-3);
  font-size: 12px;
  margin-left: 8px;
}
.method-ref p {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--ink-2);
}
</style>
