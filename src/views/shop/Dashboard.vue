<template>
  <div class="page-container shop-dashboard">
    <!-- 欢迎 -->
    <section class="welcome-card">
      <div class="welcome-left">
        <div class="welcome-greeting">{{ t('shop.dashboard.greeting') }}</div>
        <div class="welcome-sub">{{ t('shop.dashboard.subtitle') }}</div>
      </div>
      <div class="welcome-right">
        <div class="welcome-meta">
          <span class="welcome-label">{{ t('shop.dashboard.serviceStatus') }}</span>
          <span v-if="loading" class="welcome-value">
            <el-skeleton style="width: 60px" :rows="0" animated />
          </span>
          <span v-else-if="healthOk" class="welcome-value status-online">
            <span class="dot-online" />
            {{ t('shop.dashboard.statusOnline') }}
          </span>
          <span v-else class="welcome-value status-offline">
            <span class="dot-offline" />
            {{ t('shop.dashboard.statusOffline') }}
          </span>
        </div>
        <div class="welcome-meta">
          <span class="welcome-label">{{ t('shop.dashboard.checkTime') }}</span>
          <span class="welcome-value">{{ checkTimeText || '-' }}</span>
        </div>
      </div>
    </section>

    <!-- 建设中模块 -->
    <section class="modules-card">
      <div class="modules-title">{{ t('shop.dashboard.modulesTitle') }}</div>
      <el-row :gutter="16">
        <el-col v-for="m in modules" :key="m.key" :xs="12" :sm="8" :md="6">
          <div class="module-item">
            <MenuIcon :name="m.icon" :size="20" />
            <span class="module-name">{{ t(m.key) }}</span>
            <el-tag size="small" type="info" disable-transitions>{{ m.ready ? t('shop.dashboard.ready') : t('shop.dashboard.planned') }}</el-tag>
          </div>
        </el-col>
      </el-row>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from '@/i18n'
import { getErrorMessage } from '@/utils/error'
import { shopApi } from '@/api/shop'
import MenuIcon from '@/components/MenuIcon.vue'

const { t } = useI18n()

const loading = ref(true)
const healthOk = ref(false)
const checkTimeText = ref('')

const modules = computed(() => [
  { key: 'shop.modules.product', icon: 'Goods', ready: true },
  { key: 'shop.modules.category', icon: 'Files', ready: true },
  { key: 'shop.modules.channel', icon: 'Connection', ready: true },
  { key: 'shop.modules.inventory', icon: 'Box', ready: true },
  { key: 'shop.modules.order', icon: 'List', ready: true },
  { key: 'shop.modules.marketing', icon: 'Present', ready: true },
  { key: 'shop.modules.analytics', icon: 'TrendCharts', ready: true },
])

onMounted(async () => {
  try {
    const res = await shopApi.health()
    const data = res.data as { ok?: boolean; time?: string } | undefined
    healthOk.value = Boolean(data?.ok)
    checkTimeText.value = data?.time ? new Date(data.time).toLocaleString() : new Date().toLocaleString()
  } catch (err: unknown) {
    healthOk.value = false
    checkTimeText.value = new Date().toLocaleString()
    console.error('[shop] health check failed:', getErrorMessage(err))
  } finally {
    loading.value = false
  }
})
</script>

<style lang="scss" scoped>
.shop-dashboard {
  .welcome-card {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    padding: 20px 24px;
    margin-bottom: 16px;
    border-radius: 8px;
    background: var(--el-bg-color);
    border: 1px solid var(--el-border-color-light);

    .welcome-greeting {
      font-size: 20px;
      font-weight: 600;
      color: var(--el-text-color-primary);
    }

    .welcome-sub {
      margin-top: 6px;
      font-size: 13px;
      color: var(--el-text-color-secondary);
    }

    .welcome-right {
      display: flex;
      flex-direction: column;
      gap: 8px;
      align-items: flex-end;
    }

    .welcome-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;

      .welcome-label {
        color: var(--el-text-color-secondary);
      }

      .welcome-value {
        color: var(--el-text-color-primary);
      }
    }
  }

  .status-online {
    .dot-online {
      display: inline-block;
      width: 8px;
      height: 8px;
      margin-right: 6px;
      border-radius: 50%;
      background: var(--el-color-success);
    }
  }

  .status-offline {
    .dot-offline {
      display: inline-block;
      width: 8px;
      height: 8px;
      margin-right: 6px;
      border-radius: 50%;
      background: var(--el-color-danger);
    }
  }

  .modules-card {
    padding: 16px 24px 20px;
    border-radius: 8px;
    background: var(--el-bg-color);
    border: 1px solid var(--el-border-color-light);

    .modules-title {
      margin-bottom: 12px;
      font-size: 14px;
      font-weight: 600;
      color: var(--el-text-color-primary);
    }

    .module-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      margin-bottom: 12px;
      border-radius: 6px;
      background: var(--el-fill-color-light);
      color: var(--el-text-color-regular);

      .module-name {
        flex: 1;
        font-size: 13px;
      }
    }
  }
}
</style>
