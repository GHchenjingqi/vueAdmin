import type { Router } from 'vue-router'
import type { App } from 'vue'

export function register(_app: App, router: Router) {
  router.addRoute('Layout', {
    path: '/knowledge/categories',
    name: 'knowledge-categories',
    component: () => import('./views/CategoryManager.vue'),
    meta: { title: 'knowledge.categoryManage' },
  })
  router.addRoute('Layout', {
    path: '/knowledge/tags',
    name: 'knowledge-tags',
    component: () => import('./views/TagManager.vue'),
    meta: { title: 'knowledge.tag' },
  })
  router.addRoute('Layout', {
    path: '/knowledge/contents',
    name: 'knowledge-contents',
    component: () => import('./views/ContentManager.vue'),
    meta: { title: 'knowledge.content' },
  })
}
