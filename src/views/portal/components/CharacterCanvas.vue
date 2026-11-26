<template>
  <div class="character-archive">
    <div v-if="!hasImage" class="archive-empty">
      <el-icon :size="40"><Picture /></el-icon>
      <p>{{ t('portal.canvasEmptyGroup') }}</p>
    </div>

    <template v-else>
      <div class="archive-body">
        <!-- 主视觉：左侧大图，铺满右侧区块总高度 -->
        <div v-if="heroImage" class="archive-hero">
          <el-image
            :src="heroImage.url"
            fit="contain"
            class="hero-image"
            :preview-src-list="heroPreview"
            :initial-index="heroPreviewIndex"
            preview-teleported
            hide-on-click-modal
          />
          <span class="hero-badge">{{ t('portal.charGroupTurnarounds') }}</span>
        </div>

        <!-- 右侧：三视图 + 服装拆解 -->
        <div class="archive-right">
          <section v-if="turnarounds.length" class="archive-block">
            <div class="block-title">
              <span class="block-mark"></span>
              <span>{{ t('portal.charGroupTurnarounds') }}</span>
              <span class="block-count">{{ turnarounds.length }}</span>
            </div>
            <div class="turnaround-grid">
              <el-image
                v-for="(image, index) in turnarounds"
                :key="'turnaround-' + index"
                :src="image.url"
                fit="contain"
                class="turnaround-image"
                :preview-src-list="turnaroundPreview"
                :initial-index="index"
                preview-teleported
                hide-on-click-modal
              />
            </div>
          </section>

          <section v-if="costumes.length" class="archive-block">
            <div class="block-title">
              <span class="block-mark"></span>
              <span>{{ t('portal.charGroupCostumes') }}</span>
              <span class="block-count">{{ costumes.length }}</span>
            </div>
            <div class="costume-grid">
              <el-image
                v-for="(image, index) in costumes"
                :key="'costume-' + index"
                :src="image.url"
                fit="contain"
                class="costume-image"
                :preview-src-list="costumePreview"
                :initial-index="index"
                preview-teleported
                hide-on-click-modal
              />
            </div>
          </section>

          <div v-if="!turnarounds.length && !costumes.length" class="archive-block-empty">{{ t('portal.canvasEmptyGroup') }}</div>
        </div>
      </div>

      <!-- 底部细节：发型特写 + 道具图 -->
      <div class="archive-details">
        <section v-if="hairstyles.length" class="archive-block">
          <div class="block-title">
            <span class="block-mark"></span>
            <span>{{ t('portal.charGroupHairstyles') }}</span>
            <span class="block-count">{{ hairstyles.length }}</span>
          </div>
          <div class="detail-grid">
            <el-image
              v-for="(image, index) in hairstyles"
              :key="'hairstyle-' + index"
              :src="image.url"
              fit="contain"
              class="detail-image"
              :preview-src-list="hairstylePreview"
              :initial-index="index"
              preview-teleported
              hide-on-click-modal
            />
          </div>
        </section>

        <section v-if="propImages.length" class="archive-block">
          <div class="block-title">
            <span class="block-mark"></span>
            <span>{{ t('portal.charGroupProps') }}</span>
            <span class="block-count">{{ propImages.length }}</span>
          </div>
          <div class="detail-grid">
            <el-image
              v-for="(image, index) in propImages"
              :key="'prop-' + index"
              :src="image.url"
              fit="contain"
              class="detail-image"
              :preview-src-list="propPreview"
              :initial-index="index"
              preview-teleported
              hide-on-click-modal
            />
          </div>
        </section>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Picture } from '@element-plus/icons-vue'
import type { PromptCharacterLibrary } from '@/api/prompt'
import { useI18n } from '@/i18n'

const props = defineProps<{ value: PromptCharacterLibrary }>()

const { t } = useI18n()

const turnarounds = computed(() => props.value?.turnarounds ?? [])
const costumes = computed(() => props.value?.costumes ?? [])
const hairstyles = computed(() => props.value?.hairstyles ?? [])
const propImages = computed(() => props.value?.props ?? [])

const urlsOf = (images: { url: string }[]): string[] => images.map((image) => image.url)

const hasImage = computed(() => [turnarounds.value, costumes.value, hairstyles.value, propImages.value].some((group) => group.length > 0))

/** 主视觉优先取角色三视图第一张，其次取服装三视图第一张 */
const heroImage = computed(() => turnarounds.value[0] ?? costumes.value[0] ?? null)
const heroPreview = computed(() => [...urlsOf(turnarounds.value), ...urlsOf(costumes.value)])
const heroPreviewIndex = computed(() => (heroImage.value ? Math.max(0, heroPreview.value.indexOf(heroImage.value.url)) : 0))

const turnaroundPreview = computed(() => urlsOf(turnarounds.value))
const costumePreview = computed(() => urlsOf(costumes.value))
const hairstylePreview = computed(() => urlsOf(hairstyles.value))
const propPreview = computed(() => urlsOf(propImages.value))
</script>

<style scoped>
.character-archive {
  background: var(--card-bg);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 20px;
}

.archive-empty {
  min-height: 260px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--ink-3);
  font-size: 13px;
}
.archive-empty p {
  margin: 0;
}

.archive-body {
  display: flex;
  align-items: stretch;
  gap: 18px;
}

.archive-hero {
  position: relative;
  flex: 0 0 32%;
  min-width: 240px;
  min-height: 380px;
  border-radius: 10px;
  overflow: hidden;
  background: var(--page-bg);
}
.hero-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.hero-badge {
  position: absolute;
  left: 12px;
  bottom: 12px;
  padding: 4px 12px;
  border-radius: var(--radius-pill);
  background: rgba(255, 255, 255, 0.88);
  color: var(--ink-2);
  font-size: 12px;
  font-weight: 600;
  box-shadow: var(--shadow-sm);
}

.archive-right {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.archive-details {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  margin-top: 18px;
}
.archive-details > .archive-block {
  flex: 1 1 320px;
  min-width: 0;
}

.archive-block {
  min-width: 0;
}
.block-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--line);
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
}
.block-mark {
  width: 4px;
  height: 14px;
  border-radius: 2px;
  background: var(--brand);
}
.block-count {
  margin-left: auto;
  font-size: 11px;
  font-weight: 500;
  color: var(--ink-3);
  background: var(--page-bg);
  border-radius: var(--radius-pill);
  padding: 1px 8px;
}

.turnaround-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 10px;
}
.turnaround-image {
  width: 100%;
  height: 240px;
  display: block;
  border-radius: 8px;
  background: var(--page-bg);
}

.costume-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
}
.costume-image {
  width: 100%;
  height: 220px;
  display: block;
  border-radius: 8px;
  background: var(--page-bg);
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px;
}
.detail-image {
  width: 100%;
  height: 220px;
  display: block;
  border-radius: 8px;
  background: var(--page-bg);
}

.archive-block-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 120px;
  color: var(--ink-3);
  font-size: 12px;
}

@media (max-width: 900px) {
  .archive-body {
    flex-direction: column;
  }
  .archive-hero {
    flex: none;
    width: 100%;
    min-height: 320px;
  }
  .archive-details {
    flex-direction: column;
  }
}
</style>
