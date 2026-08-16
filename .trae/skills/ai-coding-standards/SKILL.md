---
name: "ai-coding-standards"
description: AI coding standards for this project. Invoke when writing or modifying any code to ensure compliance with project conventions. IMPORTANT: Also read AI_DEVELOPMENT_GUIDE.md for comprehensive project standards.
---

# AI Coding Standards

> **重要提示**：本文件是项目规范的快速参考。对于完整的项目架构、编码规范、目录结构等内容，请查阅 `AI_DEVELOPMENT_GUIDE.md`。在进行任何代码修改前，务必先阅读该文档。

## 1. TypeScript 类型断言规范 (Type Assertion Rules)

### 核心原则：禁止在行内（使用处）进行 `as` 类型转换，必须在定义处进行类型声明

**错误示例（行内 as）：**
```typescript
// ❌ 模板中行内 as
<el-button @click="handleDelete(row as Department)">

// ❌ 表达式中行内 as
const result = res.data as LoginResult
await request.delete(`/messages/${(row as MessageRecord).id}`)

// ❌ 对象字面量行内 as
await userApi.create({ username, password } as Record<string, unknown>)

// ❌ 行内 as 在条件判断中
if ((row.status as string) === 'draft') { }
```

**正确示例（定义处类型声明）：**
```typescript
// ✅ 在函数参数处定义类型
function handleDelete(row: Department) { }

// ✅ 在变量声明处定义类型
const result: LoginResult = res.data as LoginResult

// ✅ 在变量声明处进行类型转换
const messageId = (row as MessageRecord).id
await request.delete(`/messages/${messageId}`)

// ✅ 使用类型注解声明变量类型
const payload: Record<string, unknown> = { username, password }
await userApi.create(payload)

// ✅ 在 const 声明处进行类型转换
const status = row.status as string
if (status === 'draft') { }
```

### 例外情况
- `as const` 用于字面量类型收窄是允许的（这是 TypeScript 的标准特性）
- 测试文件中的 `as never`、`as any` 等 mock 相关断言允许在定义处使用
- 第三方库类型不完善时的 `as unknown as Xxx` 双断言，必须在 const 变量声明处进行

### 模板中的类型处理
- 模板中的 `row` 通常来自表格组件的 slot scope，类型为 `Record<string, unknown>`
- 不要使用 `row as SomeType`，而是让事件处理函数接受 `Record<string, unknown>` 参数
- 在函数体内的第一行，将 `row` 转换为需要的类型：
  ```typescript
  function handleEdit(row: Record<string, unknown>): void {
    const task = row as unknown as TaskRecord
    // ...
  }
  ```

## 2. 组件 Props 定义规范

- 使用 `<script setup>` 的泛型语法定义 props，避免使用 `as PropType`
  ```typescript
  // ✅ 推荐
  defineProps<{
    menus: MenuItem[]
  }>()

  // ❌ 避免
  defineProps({
    menus: {
      type: Array as PropType<MenuItem[]>,
    },
  })
  ```

## 3. 错误处理规范

- catch 块中的错误类型转换应在 const 声明处进行：
  ```typescript
  } catch (err: unknown) {
    const axiosErr = err as { response?: { data?: { message?: string } } }
    ElMessage.error(axiosErr?.response?.data?.message || '操作失败')
  }
  ```

## 4. API 响应数据处理

- 使用类型注解声明变量，在声明处进行类型转换：
  ```typescript
  const rows = res.data.rows as LogEntryDisplay[]
  logs.value = rows
  ```