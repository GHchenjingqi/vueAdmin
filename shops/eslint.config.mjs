// ESLint flat config（P1-T01）：骨架阶段仅做语法级检查（解析错误即失败），
// 类型正确性由 `npm run typecheck`（vue-tsc strict）保障；规则集随 Phase 4 收紧。
export default [{ ignores: ['.nuxt/**', '.output/**', 'node_modules/**', 'dist/**', '.data/**'] }]
