/**
 * Commitlint 配置
 *
 * 提交信息格式：type(scope): subject
 * 示例：
 *   feat(user): add user import feature
 *   fix(auth): handle token refresh race condition
 *   chore(deps): upgrade sequelize to v7
 *
 * types 列表:
 *   feat      新功能
 *   fix       修复 Bug
 *   style     样式/格式调整（非逻辑变更）
 *   refactor  重构（既不修复 Bug 也不增加功能）
 *   perf      性能优化
 *   test      测试相关
 *   docs      文档更新
 *   chore     构建/工具/依赖
 *   ci        CI/CD 配置变更
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', [
      'feat',
      'fix',
      'style',
      'refactor',
      'perf',
      'test',
      'docs',
      'chore',
      'ci',
    ]],
    'subject-case': [0],
    'header-max-length': [2, 'always', 100],
  },
}