<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<style>
/* P4-T14：键盘可见焦点（WCAG 2.4.7） */
:focus-visible {
  outline: 2px solid #1c1917;
  outline-offset: 2px;
  border-radius: 4px;
}
</style>
