<template>
  <div>
    <ul class="image-list">
      <li v-for="(img, i) in form.images" :key="i">{{ img.url }}</li>
    </ul>
    <ProForm v-model="form" :schema="schema" :show-actions="false" />
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import ProForm from '@/components/ProForm/index.vue'

interface TestForm {
  title: string
  images: Array<{ url: string }>
}

const form = reactive<TestForm>({ title: '', images: [] })

defineExpose({ form })

const schema = [{ prop: 'title', label: '标题', type: 'input' }]
</script>
