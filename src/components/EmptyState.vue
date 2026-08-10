<template>
  <div class="empty-state" :class="[`empty-state--${type}`, { 'empty-state--compact': compact }]">
    <!-- 插画区 -->
    <div class="empty-state__illustration">
      <!-- 类型一：列表空 -->
      <svg v-if="type === 'list'" class="empty-state__svg" viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect x="24" y="28" width="152" height="16" rx="4" fill="currentColor" opacity="0.08" />
        <rect x="24" y="56" width="120" height="10" rx="4" fill="currentColor" opacity="0.06" />
        <rect x="24" y="76" width="136" height="10" rx="4" fill="currentColor" opacity="0.06" />
        <rect x="24" y="96" width="100" height="10" rx="4" fill="currentColor" opacity="0.06" />
        <rect x="24" y="116" width="80" height="10" rx="4" fill="currentColor" opacity="0.04" />
        <!-- 装饰圆点 -->
        <circle cx="172" cy="28" r="5" fill="currentColor" opacity="0.15" />
        <circle cx="172" cy="48" r="3" fill="currentColor" opacity="0.1" />
        <circle cx="172" cy="64" r="4" fill="currentColor" opacity="0.12" />
        <!-- 搜索图标 -->
        <g transform="translate(148, 90)">
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" opacity="0.3" />
          <line x1="19" y1="19" x2="25" y2="25" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.3" />
        </g>
      </svg>

      <!-- 类型二：搜索无结果 -->
      <svg v-else-if="type === 'search'" class="empty-state__svg" viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="90" cy="74" r="36" stroke="currentColor" stroke-width="2.5" opacity="0.2" />
        <line x1="118" y1="102" x2="142" y2="126" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" opacity="0.2" />
        <!-- 问号 -->
        <text x="90" y="84" text-anchor="middle" font-size="32" font-weight="700" fill="currentColor" opacity="0.25">?</text>
        <!-- 装饰 -->
        <circle cx="40" cy="50" r="6" fill="currentColor" opacity="0.1" />
        <circle cx="160" cy="40" r="4" fill="currentColor" opacity="0.12" />
        <circle cx="56" cy="130" r="5" fill="currentColor" opacity="0.08" />
      </svg>

      <!-- 类型三：权限/禁止 -->
      <svg v-else-if="type === 'forbidden'" class="empty-state__svg" viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <!-- 盾牌 -->
        <path
          d="M100 20 L148 38 L148 80 C148 112 128 138 100 148 C72 138 52 112 52 80 L52 38 Z"
          stroke="currentColor"
          stroke-width="2.5"
          opacity="0.2"
          fill="none"
        />
        <!-- 禁止符号 -->
        <circle cx="100" cy="84" r="22" stroke="currentColor" stroke-width="2.5" opacity="0.3" />
        <line x1="84" y1="84" x2="116" y2="84" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" opacity="0.35" />
        <!-- 装饰 -->
        <circle cx="34" cy="60" r="5" fill="currentColor" opacity="0.1" />
        <circle cx="166" cy="120" r="6" fill="currentColor" opacity="0.08" />
      </svg>

      <!-- 类型四：加载错误 -->
      <svg v-else-if="type === 'error'" class="empty-state__svg" viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="100" cy="76" r="36" stroke="currentColor" stroke-width="2.5" opacity="0.2" />
        <!-- 错误 X -->
        <line x1="84" y1="60" x2="116" y2="92" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" opacity="0.3" />
        <line x1="116" y1="60" x2="84" y2="92" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" opacity="0.3" />
        <!-- 装饰 -->
        <circle cx="36" cy="44" r="5" fill="currentColor" opacity="0.1" />
        <circle cx="164" cy="44" r="5" fill="currentColor" opacity="0.1" />
        <circle cx="36" cy="110" r="4" fill="currentColor" opacity="0.08" />
        <circle cx="164" cy="110" r="4" fill="currentColor" opacity="0.08" />
      </svg>

      <!-- 默认：通用 -->
      <svg v-else class="empty-state__svg" viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect x="40" y="24" width="120" height="80" rx="8" stroke="currentColor" stroke-width="2" opacity="0.15" />
        <rect x="56" y="40" width="88" height="8" rx="3" fill="currentColor" opacity="0.1" />
        <rect x="56" y="56" width="64" height="8" rx="3" fill="currentColor" opacity="0.08" />
        <rect x="56" y="72" width="76" height="8" rx="3" fill="currentColor" opacity="0.08" />
        <rect x="56" y="88" width="52" height="8" rx="3" fill="currentColor" opacity="0.06" />
        <!-- 装饰 -->
        <circle cx="40" cy="130" r="6" fill="currentColor" opacity="0.1" />
        <circle cx="160" cy="130" r="6" fill="currentColor" opacity="0.1" />
        <circle cx="40" cy="24" r="4" fill="currentColor" opacity="0.12" />
        <circle cx="160" cy="24" r="4" fill="currentColor" opacity="0.12" />
      </svg>
    </div>

    <!-- 文字区 -->
    <div class="empty-state__content">
      <h3 v-if="title" class="empty-state__title">
        {{ title }}
      </h3>
      <p class="empty-state__description">
        {{ description }}
      </p>
    </div>

    <!-- 操作区 -->
    <div v-if="$slots.default || actionText" class="empty-state__footer">
      <slot />
      <el-button v-if="actionText" :type="actionType" :icon="actionIcon" @click="$emit('action')">
        {{ actionText }}
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * EmptyState — 统一空状态组件
 *
 * 支持 4 种空状态类型，每种配有专属 SVG 插画 + 语义化文案：
 * - list     : 列表为空（默认）
 * - search   : 搜索无结果
 * - forbidden: 无权限访问
 * - error    : 加载失败
 *
 * Props:
 *   type         空状态类型
 *   title        标题（可选，默认由 i18n 补全）
 *   description  描述文字（支持 i18n key）
 *   actionText   操作按钮文字
 *   actionType   按钮类型
 *   actionIcon   按钮图标
 *   compact      紧凑模式（减少垂直间距）
 */
withDefaults(
  defineProps<{
    /** 空状态类型 */
    type?: 'list' | 'search' | 'forbidden' | 'error'
    /** 主标题 */
    title?: string
    /** 描述文字 */
    description?: string
    /** 操作按钮文字 */
    actionText?: string
    /** 操作按钮类型 */
    actionType?: 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'default'
    /** 操作按钮图标 */
    actionIcon?: Record<string, unknown>
    /** 紧凑模式 */
    compact?: boolean
  }>(),
  {
    type: 'list',
    title: '',
    description: '',
    actionText: '',
    actionIcon: undefined,
    actionType: 'primary',
    compact: false,
  },
)

defineEmits<{
  action: []
}>()
</script>

<style lang="scss" scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 56px 24px;
  text-align: center;

  &--compact {
    padding: 32px 16px;

    .empty-state__illustration {
      margin-bottom: 16px;

      .empty-state__svg {
        width: 120px;
        height: 96px;
      }
    }

    .empty-state__title {
      font-size: 14px;
      margin-bottom: 6px;
    }

    .empty-state__description {
      font-size: 13px;
    }
  }

  // 视觉层次：SVG 颜色跟随主题主色
  --es-color: var(--text-secondary, #909399);

  color: var(--es-color);
}

/* ── 插画 ── */
.empty-state__illustration {
  margin-bottom: 24px;
  color: var(--text-secondary);
  transition: color 0.2s;

  // 搜索类型用主色
  .empty-state--search & {
    color: var(--mainColor);
  }

  // 禁止类型用警告色
  .empty-state--forbidden & {
    color: var(--color-warning);
  }

  // 错误类型用危险色
  .empty-state--error & {
    color: var(--color-danger);
  }
}

.empty-state__svg {
  width: 160px;
  height: 128px;
}

/* ── 文字 ── */
.empty-state__content {
  max-width: 360px;
  margin-bottom: 20px;
}

.empty-state__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 8px;
  line-height: 1.5;
}

.empty-state__description {
  font-size: 14px;
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.6;
}

/* ── 操作按钮 ── */
.empty-state__footer {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: center;
}
</style>
