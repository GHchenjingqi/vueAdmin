<template>
  <el-card shadow="hover">
    <el-result icon="warning" title="404" :sub-title="t('messages.notFound')">
      <template #extra>
        <el-button type="primary" @click="$router.push('/dashboard')">
          {{ t('common.backToHome') }}
        </el-button>
      </template>
    </el-result>
  </el-card>
</template>

<script setup lang="ts">
import { useI18n } from '@/i18n'
const { t } = useI18n()
</script>
