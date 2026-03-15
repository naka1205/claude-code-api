
# Gemini API 功能说明与配置指南

本文档介绍 Gemini API 的核心功能及其在项目中的配置。详细 API 使用示例请参见 [Gemini.md](Gemini.md)。

**官方文档**: https://ai.google.dev/gemini-api/docs

---

## 目录

- [基本配置](#基本配置)
- [Gemini API 核心功能](#gemini-api-核心功能)
- [思考深度配置](#思考深度配置)
- [UsageMetadata 对象详解](#usagemetadata-对象详解)
- [Claude 流式输出场景](#claude-流式输出场景)

---

## 基本配置

### 1. 获取多个API密钥

访问 [Google AI Studio](https://aistudio.google.com/app/apikey) 创建多个API密钥。

**重要提示**：根据 [Gemini API 速率限制文档](https://ai.google.dev/gemini-api/docs/rate-limits)，不同模型和层级有不同的限制：

### 免费层限制（每个API密钥）
- **Gemini 3.1 Pro**：5 RPM, 250K TPM, 100 RPD
- **Gemini 3 Flash**：10 RPM, 250K TPM, 250 RPD
- **Gemini 3.1 Flash-Lite**：15 RPM, 250K TPM, 1K RPD
- **Gemini 2.0 Flash**：15 RPM, 1M TPM, 200 RPD

使用多个API密钥可以有效提升总体请求限制。例如，3个免费密钥可以将Gemini 3 Flash的限制提升到30 RPM。

---

## Gemini API 核心功能

### 1. 文本生成 (Text Generation)

**功能**: 从文本、图像等多种输入生成文本输出

**核心特性**:
- 多模态输入（文本+图像组合）
- 流式/非流式模式切换
- 多轮对话上下文维护
- 系统指令引导模型行为
- temperature、top_p、max_tokens 等参数配置

**提示工程技术**:
- Zero-shot prompting（无示例提问）
- Few-shot prompting（少量示例引导）
- 结构化输出（JSON Schema 约束）

详细示例请参见 [Gemini.md](Gemini.md#文本生成)

### 2. 思考功能 (Thinking)

**功能**: 深度推理和思考，提升复杂任务处理能力

**支持模型**: Gemini 3.1 Pro、3 Flash、3.1 Flash-Lite

**核心能力**:
- **思维预算配置**: 设置具体 token 预算（如 1024）精确控制，或设为 -1 启用动态思维
- **思维摘要**: 设置 `includeThoughts: true` 查看模型推理过程
- **思维签名**: 在多轮对话中维护推理上下文（仅在使用 function calling 时可用）

**重要限制**:
- 思维签名**必须与 function calling 一起使用**
- 签名附加在包含 `functionCall` 的 part 对象内部
- 纯文本对话（无工具）不会生成思维签名
- 必须按原始顺序返回所有包含签名的 parts

**响应结构识别**:
```json
{
  "parts": [
    { "text": "推理过程...", "thought": true },    // ← 推理部分
    { "text": "最终答案" }                         // ← 答案部分（无 thought 字段）
  ]
}
```

详细示例请参见 [Gemini.md](Gemini.md#思考功能-thinking)

### 3. 多模态理解

#### 文档理解 (Document Understanding)
支持 PDF、Word、PPT、HTML、Markdown 等格式的解析和信息提取

#### 图像理解 (Image Understanding)
物体识别、场景分析、OCR 文字提取

#### 视频理解 (Video Understanding)
视频摘要、动作识别、场景分析

#### 音频理解 (Audio Understanding)
语音识别、情感分析、音乐理解

详细示例请参见 [Gemini.md](Gemini.md#多模态理解)

### 4. 工具与集成

#### 函数调用 (Function Calling)

**三大用例**:
1. **增强知识**: 连接数据库、知识库等外部数据源
2. **扩展能力**: 调用计算、翻译、图表生成等服务
3. **执行操作**: 发送邮件、创建订单、控制设备等

**高级能力**:
- 并行函数调用（同时执行多个独立函数）
- 组合函数调用（链式调用，前一个输出作为后一个输入）
- **Computer Use 工具支持**: 允许模型直接通过原生计算机使用工具控制计算机（模拟鼠标/键盘、屏幕读取等自动化任务）（2026年3月新特性）。

**调用模式**:
- AUTO（默认）: 模型自主决定是否调用
- ANY: 强制模型必须调用至少一个函数
- NONE: 禁止函数调用

#### Google 搜索集成 (Google Search)

**核心价值**:
- 减少幻觉，提高事实准确性
- 获取实时事件和话题信息
- 提供可验证的引用来源

**响应包含**:
- `webSearchQueries`: 执行的搜索查询列表
- `groundingChunks`: 搜索结果片段
- `groundingSupports`: 每个回答片段对应的来源 URI

#### 代码执行 (Code Execution)
在内置沙箱中执行 Python、JavaScript、SQL 等代码片段

详细示例请参见 [Gemini.md](Gemini.md#函数调用-function-calling)

### 5. 高级功能

#### 结构化输出 (Structured Output)
使用 JSON Schema 约束输出格式，确保类型安全

#### 长上下文处理 (Long Context)
- 支持百万级 token 处理
- 上下文缓存优化
- 适合处理超长文档

#### 批处理模式 (Batch Mode)
异步批量处理大量请求，提高效率并优化成本

#### 上下文缓存 (Context Caching)
缓存重复的上下文内容，减少 token 消耗和成本

详细示例请参见 [Gemini.md](Gemini.md#其他功能)

### 6. Gemini 模型系列对比

#### Gemini 3.1 Pro vs Flash 核心差异

| 特性 | Pro | Flash |
|------|-----|-------|
| **推理能力** | 最强 | 强 |
| **响应速度** | 中等 | 极快 (274 token/s) |
| **成本** | 较高 | 经济（1/15 价格） |
| **Thinking 控制** | ❌ 无法关闭 | ✅ 可设为 0 关闭 |
| **定位** | 深度推理模型 | 混合推理模型 |

**Thinking 模式关键差异**:
- **Pro**: 始终启用 thinking，无法完全关闭，适合需要最高智能的场景
- **Flash**: thinking 可完全开关，提供成本弹性（关闭时 $0.60/M，启用时 $3.50/M）

**选择建议**:
- **Pro**: 复杂编程、算法任务、Agent 系统、高准确性要求
- **Flash**: 实时应用、高并发、成本敏感、中等复杂度任务

#### 工具调用时的推理差异
- **Pro**: 深度规划、详细分析依赖关系、错误率最低、适合复杂工具链
- **Flash (thinking)**: 适度规划、简要分析、中等复杂度
- **Flash (no thinking)**: 直接调用、无推理过程、最快速度、适合简单场景

---

## 思考深度配置

### 支持的模型与映射

| Claude模型 | Gemini模型 | 功能特性 | 上下文窗口 | 免费层RPM |
|------------|------------|----------|------------|-----------|
| claude-opus-4-6-20260205 | gemini-3.1-pro | 视觉、工具、高级性能 | 2M tokens | 5 |
| claude-opus-4-6-20260205 | gemini-3.1-pro | 视觉、工具、高级性能 | 2M tokens | 5 |
| claude-sonnet-4-6-20260217 | gemini-3-flash | 视觉、工具、高性能 | 1M tokens | 10 |
| claude-sonnet-4-6-20260217 | gemini-3-flash | 视觉、工具、高性能 | 1M tokens | 10 |
| claude-sonnet-4-6-20260217 | gemini-3.1-flash-lite | 视觉、工具、快速高效 | 1M tokens | 15 |
| claude-haiku-4-5 | gemini-3-flash | 视觉、工具、快速 | 1M tokens | 30 |

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

依据官方文档关于函数调用（Function Calling）的说明，当前支持情况如下（最后更新：2026-03）：

| 模型 | 函数调用 | 并行函数调用 | 组合式函数调用 |
|------|----------|--------------|----------------|
| Gemini 3.1 Pro | ✔️ | ✔️ | ✔️ |
| Gemini 3 Flash | ✔️ | ✔️ | ✔️ |
| Gemini 3.1 Flash-Lite | ✔️ | ✔️ | ✔️ |
| Gemini 3 Deep Think | ✔️ | ❌ | ❌ |
| Gemini Embedding 2 | ❌ | ❌ | ❌ |

参考来源：[`Function calling with the Gemini API`](https://ai.google.dev/gemini-api/docs/function-calling)

### URL上下文（URL Context）支持的模型

根据官方“URL context”文档（最后更新：2026-03）当前支持以下模型：

- gemini-3.1-pro
- gemini-3-flash
- gemini-3.1-flash-lite

参考来源：[`URL context`](https://ai.google.dev/gemini-api/docs/url-context)

### 思考/推理（Thinking）支持的模型

基于官方“Thinking”文档，支持思考推理能力的主要模型包括：

- gemini-3.1-pro
- gemini-3-flash
- gemini-3.1-flash-lite

注：具体能力、定价与限制以官方文档为准，后续可能更新。

参考来源：[`Thinking`](https://ai.google.dev/gemini-api/docs/thinking)


## 思考深度（Thinking Level）

### 模型与深度控制（官方要点）

- 3.1 Pro：支持 `high`、`medium`、`low`，默认为 `medium`。
- 3 Flash：支持 `high`、`medium`、`low`，默认为 `medium`；可以关闭思考过程。
- 3.1 Flash-Lite：默认不思考，可通过设置 `thinking_level` 启用。

参考：[`Thinking`](https://ai.google.dev/gemini-api/docs/thinking)

> 实际推理深度可能因提示而异，请以官方文档为准。

### Claude 启用思考

```json
{
  "model": "claude-sonnet-4-6-20260217",
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
      "thinking_level": "medium"
    }
  }
}
```

不指定 `budget_tokens`：将采用默认思维级别（`thinking_level = "medium"`）。

禁用（若模型允许禁用）：

```json
{
  "thinking": { "type": "disabled" }
}
```

### 使用建议

1. **多 API 密钥策略**: 使用多个密钥可有效提升总体请求限制
2. **模型选择**: 根据任务复杂度选择合适的模型（Pro vs Flash）
3. **成本优化**: 利用上下文缓存和批处理模式降低成本
4. **Thinking 控制**: Flash 模型可根据任务动态调整思维预算
5. **错误处理**: 实现完善的错误处理和重试机制

---

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
  /** 思维推理过程的令牌数量 (2026年新增，仅支持Gemini 3.1系列) */
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

### 2026年新特性

#### 思维令牌计数 (`thoughtsTokenCount`)
- **支持模型**：Gemini 3.1 Pro, 3.1 Flash, 3.1 Flash-Lite
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

---

## Claude 流式输出场景

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