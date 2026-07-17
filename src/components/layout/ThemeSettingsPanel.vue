<template>
  <!-- 抽屉面板（由外部 v-model 控制） -->
  <el-drawer v-model="visible" :title="t('themeSettings.title')" direction="rtl" size="340px" destroy-on-close>
    <div class="panel-content">
      <!-- 界面主题 -->
      <div class="section">
        <!-- 深色/浅色切换 -->
        <div class="option-row">
          <span class="option-label">{{ t('themeSettings.darkMode') }}</span>
          <el-switch v-model="isDark" inline-prompt @change="handleThemeChange" />
        </div>

        <!-- 语言切换 -->
        <div class="option-row">
          <span class="option-label">{{ t('themeSettings.language') }}</span>
          <el-select v-model="currentLocale" style="width: 140px" @change="handleLocaleChange">
            <el-option v-for="(label, key) in localeLabels" :key="key" :label="label" :value="key" />
          </el-select>
        </div>

        <!-- 主色 -->
        <div class="option-block">
          <span class="option-label">{{ t('themeSettings.themeColor') }}</span>
          <div class="color-grid">
            <div
              v-for="color in presetPrimaryColors"
              :key="color.value"
              class="color-circle"
              :class="{ active: primaryColor === color.value }"
              :style="{ backgroundColor: color.value }"
              :title="color.name"
              @click="handlePrimaryColorChange(color.value)"
            >
              <el-icon v-if="primaryColor === color.value" class="check-icon">
                <Check />
              </el-icon>
            </div>
            <!-- 自定义颜色 -->
            <div class="color-circle custom-color" :style="{ borderColor: primaryColor }" :title="t('themeSettings.customColor')">
              <el-icon class="edit-icon">
                <Edit />
              </el-icon>
              <input v-model="customColor" type="color" class="color-picker" @change="handleCustomColorChange" />
            </div>
          </div>
        </div>

        <!-- 字体大小 -->
        <div class="option-block">
          <span class="option-label">{{ t('themeSettings.fontSize') }}</span>
          <el-radio-group v-model="fontSize" @change="handleFontSizeChange">
            <el-radio-button value="small">
              {{ t('themeSettings.fontSizeSmall') }}
            </el-radio-button>
            <el-radio-button value="medium">
              {{ t('themeSettings.fontSizeMedium') }}
            </el-radio-button>
            <el-radio-button value="large">
              {{ t('themeSettings.fontSizeLarge') }}
            </el-radio-button>
            <el-radio-button value="xlarge">
              {{ t('themeSettings.fontSizeXlarge') }}
            </el-radio-button>
          </el-radio-group>
        </div>

        <!-- 菜单宽度 -->
        <div class="option-block">
          <span class="option-label">{{ t('themeSettings.sidebarWidth') }}：{{ sidebarWidth }}px</span>
          <el-slider
            v-model="sidebarWidth"
            :min="SIDEBAR_WIDTH_MIN"
            :max="SIDEBAR_WIDTH_MAX"
            :step="10"
            show-stops
            :marks="sliderMarks"
            @change="handleSidebarWidthChange"
          />
        </div>
      </div>

      <!-- 重置按钮 -->
      <div class="reset-row">
        <el-button type="danger" plain @click="handleReset">
          <el-icon><RefreshRight /></el-icon>
          <span>{{ t('themeSettings.resetToDefault') }}</span>
        </el-button>
      </div>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { Check, Edit, RefreshRight } from '@element-plus/icons-vue'
import { useI18n } from '@/i18n'
import {
  useAppStore,
  presetPrimaryColors,
  SIDEBAR_WIDTH_MIN,
  SIDEBAR_WIDTH_MAX,
  SIDEBAR_WIDTH_DEFAULT,
  type LayoutMode,
  type FontSizeScale,
  type LocaleKey,
} from '@/stores/appStore'

const { t, localeLabels } = useI18n()
const appStore = useAppStore()

// 由外部 v-model 控制显示
const props = defineProps<{
  modelValue: boolean
}>()
const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
}>()
const visible = computed({
  get: () => props.modelValue,
  set: (val: boolean) => emit('update:modelValue', val),
})

// 响应式状态（从 store 同步）
const isDark = ref(appStore.theme === 'dark')
const primaryColor = ref(appStore.primaryColor)
const customColor = ref(appStore.primaryColor)
const currentLocale = ref<LocaleKey>(appStore.locale)
const fontSize = ref<FontSizeScale>(appStore.fontSize)
const layoutMode = ref<LayoutMode>(appStore.layoutMode)
const sidebarWidth = ref(appStore.sidebarWidth)

// 滑块刻度标记
const sliderMarks = computed(() => ({
  [SIDEBAR_WIDTH_MIN]: `${SIDEBAR_WIDTH_MIN}`,
  [SIDEBAR_WIDTH_MAX]: `${SIDEBAR_WIDTH_MAX}`,
}))

// 面板打开时同步最新状态
watch(
  () => props.modelValue,
  (val) => {
    if (val) {
      isDark.value = appStore.theme === 'dark'
      primaryColor.value = appStore.primaryColor
      customColor.value = appStore.primaryColor
      currentLocale.value = appStore.locale
      fontSize.value = appStore.fontSize
      layoutMode.value = appStore.layoutMode
      sidebarWidth.value = appStore.sidebarWidth
    }
  },
)

// ==================== 事件处理 ====================
function handleThemeChange(dark: string | number | boolean): void {
  appStore.setTheme(dark ? 'dark' : 'light')
}

function handlePrimaryColorChange(color: string): void {
  primaryColor.value = color
  customColor.value = color
  appStore.setPrimaryColor(color)
}

function handleCustomColorChange(): void {
  handlePrimaryColorChange(customColor.value)
}

function handleLocaleChange(locale: LocaleKey): void {
  appStore.setLocale(locale)
}

function handleFontSizeChange(size: string | number | boolean | undefined): void {
  appStore.setFontSize(size as FontSizeScale)
}

function handleSidebarWidthChange(val: number | number[]): void {
  appStore.setSidebarWidth(Array.isArray(val) ? val[0] : val)
}

function handleReset(): void {
  appStore.resetPersonalization()
  // 重新同步本地状态
  isDark.value = false
  primaryColor.value = '#1890ff'
  customColor.value = '#1890ff'
  currentLocale.value = 'zh-CN'
  fontSize.value = 'medium'
  layoutMode.value = 'classic'
  sidebarWidth.value = SIDEBAR_WIDTH_DEFAULT
}
</script>

<style lang="scss" scoped>
.theme-trigger {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  cursor: pointer;
  color: var(--text-regular);
  transition: all 0.2s;

  &:hover {
    background-color: var(--hover-bg);
    color: var(--mainColor);
  }
}

.panel-content {
  margin-top: -50px;
  padding: 8px 4px;
}

.section {
  padding: 16px 8px;
  border-bottom: 1px solid var(--border-light);

  &:last-of-type {
    border-bottom: none;
  }
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 16px;
}

.option-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 32px;
}

.option-block {
  margin-bottom: 32px;
}

.option-label {
  font-size: 13px;
  color: var(--text-regular);
  display: block;
  margin-bottom: 10px;
}

.option-row .option-label {
  margin-bottom: 0;
}

.option-value {
  font-size: 13px;
  color: var(--mainColor);
  font-weight: 500;
}

/* 颜色选择器 */
.color-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.color-circle {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  cursor: pointer;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);

  &:hover {
    transform: scale(1.12);
  }

  &.active {
    box-shadow:
      0 0 0 2px #fff,
      0 0 0 4px var(--mainColor);
  }

  .check-icon {
    color: #fff;
    font-size: 14px;
  }
}

.custom-color {
  background-color: var(--card-bg);
  border: 2px dashed var(--border-color);
  box-shadow: none;

  .edit-icon {
    font-size: 14px;
    color: var(--text-secondary);
  }

  &:hover {
    border-color: var(--mainColor);

    .edit-icon {
      color: var(--mainColor);
    }
  }

  .color-picker {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
    width: 100%;
    height: 100%;
    border: none;
    background: transparent;
  }
}

/* 布局选择卡片 */
.layout-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.layout-card {
  cursor: pointer;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 8px 6px;
  transition: all 0.15s;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;

  &:hover {
    border-color: var(--mainColor);
  }

  &.active {
    border-color: var(--mainColor);
    background-color: var(--mainColor-bg);
  }
}

.layout-preview {
  width: 60px;
  height: 40px;
  display: flex;
  background-color: var(--content-bg);
  border-radius: 3px;
  overflow: hidden;
  border: 1px solid var(--border-light);

  .lp-sidebar {
    width: 16px;
    background-color: var(--mainColor);
    flex-shrink: 0;
  }

  .lp-sidebar-sm {
    width: 12px;
    background-color: var(--text-secondary);
    height: 100%;
  }

  .lp-content {
    flex: 1;
    display: flex;
    flex-direction: column;

    &.full {
      width: 100%;
    }
  }

  .lp-header {
    height: 8px;
    background-color: var(--mainColor);

    &.wide {
      width: 100%;
    }
  }

  .lp-body {
    flex: 1;
    background-color: var(--content-bg);

    &.with-sidebar {
      display: flex;
    }
  }
}

.layout-name {
  font-size: 12px;
  color: var(--text-regular);
}

/* 重置按钮 */
.reset-row {
  padding: 20px 8px 8px;
  display: flex;
  justify-content: center;
}
</style>
