<template>
  <el-card shadow="hover">
    <template #header>
      <span>{{ t('login.title') }}</span>
    </template>
    <el-result icon="success" :title="t('login.alreadyLoggedIn')" :sub-title="t('login.welcomeBack', { username })">
      <template #extra>
        <el-button type="primary" @click="switchAccount">
          {{ t('login.switchAccount') }}
        </el-button>
      </template>
    </el-result>
  </el-card>
</template>

<script setup lang="ts">
import { authApi } from '@/api'
import { useUserStore } from '@/stores'
import { useI18n } from '@/i18n'

const router = useRouter()
const userStore = useUserStore()
const { t } = useI18n()
const username = ref(userStore.username || t('common.default'))

const switchAccount = async () => {
  try {
    await authApi.logout()
  } catch {
    // 退出接口调用失败，仍继续清理本地状态
  }
  userStore.logout()
  router.push('/login')
}
</script>
