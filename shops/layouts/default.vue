<script setup lang="ts">
import { useStoreConfig } from '~/composables/useStoreConfig'
import { useLocale } from '~/composables/useLocale'
import { translate } from '@shared/i18n/messages'

// Store Config 初始化（P1-T06）：布局层最先拉取，页面渲染时币种已就绪（SSR 直出正确符号）
const cfg = useStoreConfig()
await useAsyncData('store-config-init', () => cfg.load())

// P5-T01：locale 由 useLocale()（URL 前缀/cookie 驱动），与 currency 完全解耦（P1-T05）
const { locale, lang } = useLocale()
useHead({ htmlAttrs: { lang } })

const t = (key: string) => translate(locale.value, key)
provide('t', t)
</script>

<template>
  <div class="flex min-h-screen flex-col bg-white text-stone-900">
    <a
      href="#main"
      class="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-stone-900 focus:px-3 focus:py-2 focus:text-white"
    >
      Skip to content
    </a>
    <header class="border-b border-stone-200">
      <div class="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <NuxtLink to="/" class="text-lg font-semibold tracking-wide">Aurora Hair Studio</NuxtLink>
        <div class="flex items-center gap-5">
          <nav class="flex items-center gap-5 text-sm text-stone-600">
            <NuxtLink to="/c/lace-wigs" class="hover:text-stone-900">Lace Wigs</NuxtLink>
            <NuxtLink to="/c/apparel" class="hover:text-stone-900">Apparel</NuxtLink>
            <NuxtLink to="/cart" class="hover:text-stone-900">Cart</NuxtLink>
            <NuxtLink to="/track" class="hover:text-stone-900">Track</NuxtLink>
          </nav>
          <LocaleSwitcher />
        </div>
      </div>
    </header>
    <main id="main" class="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <slot />
    </main>
    <CommerceConsentBanner />
    <footer class="border-t border-stone-200 py-8">
      <div class="mx-auto max-w-6xl px-4">
        <CommerceFooterNewsletter class="mx-auto max-w-md" />
        <p class="mt-6 text-center text-xs text-stone-500">
          <NuxtLink to="/policies/privacy" class="hover:underline">Privacy</NuxtLink>
          ·
          <NuxtLink to="/policies/terms" class="hover:underline">Terms</NuxtLink>
          ·
          <NuxtLink to="/policies/shipping" class="hover:underline">Shipping</NuxtLink>
          ·
          <NuxtLink to="/policies/returns" class="hover:underline">Returns</NuxtLink>
        </p>
      </div>
    </footer>
  </div>
</template>
