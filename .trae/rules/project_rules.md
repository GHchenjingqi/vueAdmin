# 项目开发规范

## TypeScript 类型断言规范

### 核心原则：禁止在行内（使用处）进行 `as` 类型转换，必须在定义处进行类型声明

**错误示例：**
```typescript
// ❌ 模板中行内 as
<el-button @click="handleDelete(row as Department)">

// ❌ 表达式中行内 as
const result = res.data as LoginResult
await request.delete(`/messages/${(row as MessageRecord).id}`)

// ❌ 对象字面量行内 as
await userApi.create({ username, password } as Record<string, unknown>)
```

**正确示例：**
```typescript
// ✅ 在 const 声明处进行类型转换
const result: LoginResult = res.data as LoginResult
const messageId = (row as MessageRecord).id
const payload: Record<string, unknown> = { username, password }
```

### 例外
- `as const` 字面量类型收窄
- 测试文件中的 mock 断言