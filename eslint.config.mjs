import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import tseslint from 'typescript-eslint'
import globals from 'globals'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 从 auto-imports.d.ts 中提取全局变量名，注册到 ESLint
// 避免 unplugin-auto-import 隐式导入的 ref/watch 等被 ESLint 报 no-undef
const autoImportsPath = path.join(__dirname, 'auto-imports.d.ts')
let autoImportGlobals = {}
if (fs.existsSync(autoImportsPath)) {
  const content = fs.readFileSync(autoImportsPath, 'utf-8')
  const regex = /const (\w+): /g
  let match
  while ((match = regex.exec(content)) !== null) {
    autoImportGlobals[match[1]] = 'readonly'
  }
}

export default tseslint.config(
  // 引用 ESLint 推荐规则
  js.configs.recommended,
  // 引用 TypeScript ESLint 推荐规则
  ...tseslint.configs.recommended,
  // 引用 Vue 3 推荐规则（flat 格式）
  ...pluginVue.configs['flat/recommended'],
  {
    // 全局忽略
    ignores: [
      'dist/**',
      'server/**',
      'node_modules/**',
      'e2e-report/**',
      '.ai-knowledge/**',
      '**/*.d.ts',
      'auto-imports.d.ts',
      'components.d.ts',
      'run_typecheck.js',
    ],
  },
  {
    // 注册 unplugin-auto-import 的全局变量，避免 no-undef 报错
    languageOptions: {
      globals: {
        ...globals.browser,
        ...autoImportGlobals,
      },
    },
  },
  {
    files: ['*.vue', 'src/**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
  {
    rules: {
      // Vue 组件名允许多单词（关闭强制多单词限制）
      'vue/multi-word-component-names': 'off',
      // 允许使用 any（但给出警告）
      '@typescript-eslint/no-explicit-any': 'warn',
      // 关闭基础 no-unused-vars，使用 ts 版本
      'no-unused-vars': 'off',
      // 未使用变量报错（与 tsconfig 的 noUnusedLocals 保持一致）
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },
  {
    // 测试文件允许使用 any（mock 数据等场景）
    files: ['src/**/__tests__/**/*.ts', 'src/**/__tests__/**/*.vue', '**/*.test.ts', '**/*.spec.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
)