<template>
  <div v-if="enabled && text" class="watermark-overlay" :style="{ backgroundImage: `url(${bgImage})` }" />
</template>

<script setup lang="ts">
const props = defineProps({
  text: { type: String, default: '' },
  enabled: { type: Boolean, default: false },
})

const bgImage = ref('')

function generateWatermark(text: string): void {
  if (!text) {
    bgImage.value = ''
    return
  }

  // 创建一个离屏canvas
  const canvas = document.createElement('canvas')
  const angle = -25
  const fontSize = 16
  const gap = 200 // 水印间距
  const rad = (angle * Math.PI) / 180

  // 根据角度计算 canvas 大小
  canvas.width = gap
  canvas.height = gap
  const ctx = canvas.getContext('2d')!

  // 清除画布
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // 设置水印样式
  ctx.font = `${fontSize}px Microsoft YaHei, sans-serif`
  ctx.fillStyle = 'rgba(0, 0, 0, 0.08)'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  // 旋转并绘?
  ctx.translate(canvas.width / 2, canvas.height / 2)
  ctx.rotate(rad)
  ctx.fillText(text, 0, 0)

  bgImage.value = canvas.toDataURL('image/png')
}

watch(
  () => [props.text, props.enabled],
  () => {
    if (props.enabled && props.text) {
      generateWatermark(props.text)
    } else {
      bgImage.value = ''
    }
  },
  { immediate: true },
)

onMounted(() => {
  if (props.enabled && props.text) {
    generateWatermark(props.text)
  }
})
</script>

<style lang="scss" scoped>
.watermark-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
  z-index: 100;
  background-repeat: repeat;
  background-position: 0 0;
}
</style>
