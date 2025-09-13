
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

- 思考开启时，价格为“输出 tokens + 思考 tokens”之和。
- 可通过响应的 `usageMetadata.thoughtsTokenCount` 获取思考 token 数。

参考：[`Thinking`](https://ai.google.dev/gemini-api/docs/thinking)