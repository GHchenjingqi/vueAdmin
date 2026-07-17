<template>
  <el-result v-if="hasError" status="error" :title="errorMessage || '页面发生错误'" :sub-title="errorDetail">
    <template #extra>
      <el-button type="primary" @click="reset">重试</el-button>
      <el-button v-if="showHome" @click="goHome">返回首页</el-button>
    </template>
  </el-result>
  <slot v-else />
</template>

<script setup lang="ts">
defineProps({
  showHome: {
    type: Boolean,
    default: true,
  },
})

const router = useRouter()

const hasError = ref(false)
const errorMessage = ref('')
const errorDetail = ref('')

onErrorCaptured((err: Error, _instance, _info) => {
  hasError.value = true
  errorMessage.value = err.message || '页面发生未知错误'
  errorDetail.value = err.stack?.split('\n').slice(0, 3).join(' → ') || ''
  console.error('[ErrorBoundary]', err)
  return false
})

function reset(): void {
  hasError.value = false
  errorMessage.value = ''
  errorDetail.value = ''
}

function goHome(): void {
  reset()
  router.push('/')
}
</script>
