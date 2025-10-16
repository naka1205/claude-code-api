
## 基本配置

### 1. 获取多个API密钥

访问 [Google AI Studio](https://aistudio.google.com/app/apikey) 创建多个API密钥。

**重要提示**：根据 [Gemini API 速率限制文档](https://ai.google.dev/gemini-api/docs/rate-limits)，不同模型和层级有不同的限制：

### 免费层限制（每个API密钥）
- **Gemini 2.5 Pro**：5 RPM, 250K TPM, 100 RPD
- **Gemini 2.5 Flash**：10 RPM, 250K TPM, 250 RPD  
- **Gemini 2.5 Flash-Lite**：15 RPM, 250K TPM, 1K RPD
- **Gemini 2.0 Flash**：15 RPM, 1M TPM, 200 RPD

使用多个API密钥可以有效提升总体请求限制。例如，3个免费密钥可以将Gemini 2.5 Flash的限制提升到30 RPM。


### 支持的模型与映射

以下Claude模型会自动映射到最新的Gemini模型：

| Claude模型 | Gemini模型 | 功能特性 | 上下文窗口 | 免费层RPM |
|------------|------------|----------|------------|-----------|
| claude-opus-4-1-20250805 | gemini-2.5-pro | 视觉、工具、高级性能 | 2M tokens | 5 |
| claude-opus-4-20250514 | gemini-2.5-pro | 视觉、工具、高级性能 | 2M tokens | 5 |
| claude-sonnet-4-20250514 | gemini-2.5-flash | 视觉、工具、高性能 | 1M tokens | 10 |
| claude-3-7-sonnet-20250219 | gemini-2.5-flash | 视觉、工具、高性能 | 1M tokens | 10 |
| claude-3-5-sonnet-20241022 | gemini-2.5-flash-lite | 视觉、工具、快速高效 | 1M tokens | 15 |
| claude-3-5-haiku-20241022 | gemini-2.0-flash | 视觉、工具、快速 | 1M tokens | 30 |

### 模型能力

| 功能 | 支持状态 | 说明 |
|------|----------|------|
| 文本生成 | ✅ | 支持所有参数 |
| 视觉（图像） | ✅ | 支持JPEG、PNG、WebP、HEIC格式 |
| 工具调用 | ✅ | 函数声明和执行 |
| 流式响应 | ✅ | Server-Sent Events (SSE) 格式 |
| 系统消息 | ✅ | 转换为用户消息前缀 |
| 多轮对话 | ✅ | 完整对话历史 |
| 智能工具转换 | ✅ | 自动处理WebSearch和WebFetch |

### 函数调用支持的模型

依据官方文档关于函数调用（Function Calling）的说明，当前支持情况如下（最后更新：2025-08-21）：

| 模型 | 函数调用 | 并行函数调用 | 组合式函数调用 |
|------|----------|--------------|----------------|
| Gemini 2.5 Pro | ✔️ | ✔️ | ✔️ |
| Gemini 2.5 Flash | ✔️ | ✔️ | ✔️ |
| Gemini 2.5 Flash-Lite | ✔️ | ✔️ | ✔️ |
| Gemini 2.0 Flash | ✔️ | ✔️ | ✔️ |
| Gemini 2.0 Flash-Lite | ❌ | ❌ | ❌ |

参考来源：[`Function calling with the Gemini API`](https://ai.google.dev/gemini-api/docs/function-calling)

### URL上下文（URL Context）支持的模型

根据官方“URL context”文档（最后更新：2025-08-21）当前支持以下模型：

- gemini-2.5-pro
- gemini-2.5-flash
- gemini-2.5-flash-lite

参考来源：[`URL context`](https://ai.google.dev/gemini-api/docs/url-context)

### 思考/推理（Thinking）支持的模型

基于官方“Thinking”文档，支持思考推理能力的主要模型包括：

- gemini-2.5-pro
- gemini-2.5-flash
- gemini-2.5-flash-lite

注：具体能力、定价与限制以官方文档为准，后续可能更新。

参考来源：[`Thinking`](https://ai.google.dev/gemini-api/docs/thinking)


## 思考预算（Thinking）

### 模型与预算范围（官方要点）

- 2.5 Pro：默认动态思考；范围 128–32768；无法禁用；动态 `-1`
- 2.5 Flash：默认动态思考；范围 0–24576；禁用 `0`；动态 `-1`
- 2.5 Flash-Lite：默认不思考；范围 512–24576；禁用 `0`；动态 `-1`

参考：[`Thinking`](https://ai.google.dev/gemini-api/docs/thinking)

> 实际可用范围可能因提示而溢出/欠用，请以官方文档为准。

### Claude 启用思考

```json
{
  "model": "claude-3-5-sonnet-20241022",
  "max_tokens": 1024,
  "thinking": { "type": "enabled", "budget_tokens": 2048 },
  "messages": [
    { "role": "user", "content": "解释奥卡姆剃刀并举例" }
  ]
}
```

内部映射（示意）：

```json
{
  "config": {
    "thinkingConfig": {
      "includeThoughts": true,
      "thinkingBudget": 2048
    }
  }
}
```

不指定 `budget_tokens`：将采用动态预算（`thinkingBudget = -1`）。

禁用（若模型允许禁用）：

```json
{
  "thinking": { "type": "disabled" }
}
```

### 使用建议

- 简单任务：可关闭或使用较低预算以降低延迟。
- 中等任务：使用默认或中等预算。
- 复杂任务（数学/编程/多步规划）：使用较高预算或动态预算。

### 计费与用量

- 思考开启时，价格为"输出 tokens + 思考 tokens"之和。
- 可通过响应的 `usageMetadata.thoughtsTokenCount` 获取思考 token 数。

参考：[`Thinking`](https://ai.google.dev/gemini-api/docs/thinking)

## 📊 UsageMetadata 对象详解

### 概述

`usageMetadata` 对象是 Gemini API 响应中包含的令牌使用统计信息，用于跟踪请求的计费和配额消耗情况。

### 完整属性说明

```typescript
interface GeminiUsageMetadata {
  /** 输入提示词的令牌数量 */
  promptTokenCount?: number;
  /** 生成候选响应的令牌数量 */
  candidatesTokenCount?: number;
  /** 总令牌数量 (prompt + candidates + thoughts) */
  totalTokenCount?: number;
  /** 从缓存中检索的内容令牌数量 */
  cachedContentTokenCount?: number;
  /** 思维推理过程的令牌数量 (2025年新增，仅支持Gemini 2.5系列) */
  thoughtsTokenCount?: number;
}
```

### 属性详细说明

| 属性名 | 类型 | 描述 | 何时存在 | 计费影响 |
|-------|------|------|---------|---------|
| `promptTokenCount` | `number` | 输入提示词的令牌数量 | ✅ 始终存在 | 按输入令牌计费 |
| `candidatesTokenCount` | `number` | 模型生成的候选响应令牌数量 | ✅ 始终存在 | 按输出令牌计费 |
| `totalTokenCount` | `number` | 总令牌数 = prompt + candidates + thoughts | ✅ 始终存在 | 总计费基准 |
| `cachedContentTokenCount` | `number` | 从缓存中检索的内容令牌数量 | 🟡 使用缓存时 | 缓存令牌通常免费或优惠 |
| `thoughtsTokenCount` | `number` | 思维推理过程中的令牌数量 | 🟡 使用thinking功能时 | 按输出令牌计费 |

### 2025年新特性

#### 思维令牌计数 (`thoughtsTokenCount`)
- **支持模型**：Gemini 2.5 Pro, 2.5 Flash, 2.5 Flash-Lite
- **功能说明**：追踪模型内部推理过程的令牌使用
- **计费规则**：思维令牌计入总费用，但只输出摘要内容
- **注意事项**：在某些实现中，`candidatesTokenCount` 可能包含或不包含思维令牌

### 使用示例

#### 基础响应示例
```json
{
  "usageMetadata": {
    "promptTokenCount": 25,
    "candidatesTokenCount": 73,
    "totalTokenCount": 98
  }
}
```

#### 包含思维推理的响应示例
```json
{
  "usageMetadata": {
    "promptTokenCount": 2152,
    "candidatesTokenCount": 710,
    "thoughtsTokenCount": 702,
    "cachedContentTokenCount": 2027,
    "totalTokenCount": 3564
  }
}
```

### 不同场景下的令牌统计

#### 1. 标准文本生成
- `promptTokenCount`: 输入文本的令牌数
- `candidatesTokenCount`: 生成文本的令牌数
- `totalTokenCount`: 二者之和

#### 2. 启用思维推理
- `promptTokenCount`: 输入文本的令牌数
- `candidatesTokenCount`: 最终输出文本的令牌数
- `thoughtsTokenCount`: 内部推理过程的令牌数
- `totalTokenCount`: 三者之和

#### 3. 使用缓存内容
- `promptTokenCount`: 新输入部分的令牌数
- `cachedContentTokenCount`: 从缓存检索的令牌数
- `candidatesTokenCount`: 生成响应的令牌数
- `totalTokenCount`: 包含所有部分的总计

#### 4. 流式响应
- **流式过程中**：各块的 `usageMetadata` 通常为空 `{}`
- **最后一块**：包含完整的令牌统计信息
- **行为一致性**：与 OpenAI 等其他 API 的行为类似

### 成本优化建议

1. **监控思维令牌**：启用thinking功能时，注意 `thoughtsTokenCount` 的消耗
2. **利用缓存**：重复使用相同内容时，`cachedContentTokenCount` 可节省成本
3. **流式优化**：流式响应中只有最后一块包含令牌统计，避免重复计算
4. **模型选择**：根据任务复杂度选择合适的模型，平衡性能和成本

### 在项目中的使用

在本项目中，`usageMetadata` 信息会被转换为 Claude API 兼容的 `usage` 格式：

```typescript
// Gemini API 响应中的 usageMetadata
const geminiUsage = response.usageMetadata;

// 转换为 Claude API 格式
const claudeUsage = {
  input_tokens: geminiUsage.promptTokenCount || 0,
  output_tokens: geminiUsage.candidatesTokenCount || 0,
  cache_read_input_tokens: geminiUsage.cachedContentTokenCount || 0,
  thoughts_output_tokens: geminiUsage.thoughtsTokenCount || undefined
};
```

## Claude流式输出

### ✅ 场景1: 纯文本响应
- **描述**: 无thinking,无工具调用,纯文本对话
- **示例**: 用户问"你好",模型回答"你好!"

### ✅ 场景2: Thinking(暴露) + 文本
- **描述**: 有thinking过程,暴露给客户端,然后输出文本
- **配置**: exposeThinkingToClient=true

### ⚠️ 场景3: Thinking(隐藏) + 文本
- **描述**: 有thinking过程,但不暴露给客户端,只输出文本
- **配置**: exposeThinkingToClient=false

### ✅ 场景4: Thinking(暴露|隐藏) + 文本 + 工具
- **描述**: thinking后输出文本,再调用工具
- **应用**: 复杂任务需要工具辅助

### ⭐ 场景5: 多个Thinking块(暴露|隐藏) + 文本 + 工具
- **描述**: 8个thinking parts合并为1个thinking块,然后文本和工具

### ⭐ 场景6: Thinking + 工具调用(无文本)
- **描述**: thinking后直接调用工具,无对话文本
- **应用**: 搜索、API调用等直接工具场景
- **关键**: thoughtSignature和functionCall可能同时出现

### ✅ 场景7: 仅工具调用
- **描述**: 无thinking,无文本,直接工具调用
- **应用**: 简单的工具调用场景(较少见)

### ⚠️ 场景8: 仅Thinking
- **描述**: 只生成了thinking,没有实际输出
- **行为**: 触发error事件
- **原因**: max_tokens不足或其他限制

---

### 相关链接

- [Gemini API Token 计数文档](https://ai.google.dev/gemini-api/docs/tokens)
- [Gemini API Thinking 功能文档](https://ai.google.dev/gemini-api/docs/thinking)
- [Gemini API 计费信息](https://ai.google.dev/pricing)