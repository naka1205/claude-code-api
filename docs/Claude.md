# Claude API 官方功能与工具完整列表

## Messages接口详细说明

### 接口概述
Claude的Messages API允许开发者通过发送结构化的输入消息列表（包含文本和/或图像内容），让模型生成对话中的下一条消息。该接口可用于单轮查询或无状态的多轮对话。

**官方文档**: https://docs.anthropic.com/en/api/messages

### 请求格式

#### 端点
```
POST /v1/messages
```

#### 请求头
| 字段 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `x-api-key` | string | 是 | 您的API密钥，用于身份验证 |
| `anthropic-version` | string | 是 | API版本，例如 `2023-06-01` |
| `content-type` | string | 是 | 内容类型，必须为 `application/json` |
| `anthropic-beta` | string[] | 否 | 指定要使用的beta版本 |

#### 请求体参数

| 字段 | 类型 | 必需 | 描述 |
|------|------|------|------|
| `model` | string | 是 | 要使用的模型名称 |
| `max_tokens` | integer | 是 | 生成的最大token数 (≥1) |
| `messages` | object[] | 是 | 输入消息列表，最多100,000条 |
| `system` | string/object[] | 否 | 系统提示词 |
| `stream` | boolean | 否 | 是否启用流式响应 |
| `stop_sequences` | string[] | 否 | 自定义停止序列 |
| `temperature` | number | 否 | 控制随机性 (0-1) |
| `top_p` | number | 否 | 核采样参数 (0-1) |
| `top_k` | integer | 否 | 只从top K选项采样 (≥0) |
| `tools` | object[] | 否 | 可用工具列表 |
| `tool_choice` | string/object | 否 | 工具选择策略 |
| `metadata` | object | 否 | 请求元数据 |
| `service_tier` | string | 否 | 服务层级 (`auto`, `standard_only`) |

#### 更多参数说明补充（基于官方文档）
- `container` (string | null): 跨请求复用的容器标识，用于工具/容器相关能力。
- `mcp_servers` (object[]): 指定要在本次请求中可用的 MCP 服务器。
  - `name` (string): 服务器名。
  - `type` ("url"): 服务器类型，目前为 `url`。
  - `url` (string): 服务器地址。
  - `authorization_token` (string | null): 访问令牌。
  - `tool_configuration` (object | null): 工具启用与白名单设置。
    - `enabled` (boolean | null): 是否启用。
    - `allowed_tools` (string[] | null): 允许调用的工具名列表。
- `metadata` (object): 请求的元信息。
  - `user_id` (string | null): 外部用户标识（UUID/哈希等），用于滥用检测，不得包含个人身份信息（PII）。
- `tools` (object[]): 函数/工具定义，供模型选择性调用（Tool Use）。
  - `name` (string): 工具名。
  - `description` (string): 工具用途说明。
  - `input_schema` (JSON Schema): 工具参数结构与校验规则。
  - 可选 `cache_control`（beta）：配置工具调用缓存 TTL（如 `5m`, `1h`）。
- `tool_choice` (string | object): 工具选择策略。
  - `"auto"`: 模型自行决定是否以及调用哪个工具。
  - `{"type": "tool", "name": "..."}`: 强制使用某个工具。
  - `"none"`: 禁止工具调用。
- 采样参数：
  - `temperature` (number 0-1): 越高越随机；与 `top_p` 二选一调优。
  - `top_p` (number 0-1): 核采样；与 `temperature` 二选一调优。
  - `top_k` (integer ≥ 0): 仅从 Top-K 候选采样，进阶用法。
- `stop_sequences` (string[]): 命中任一自定义停止串即停止，响应 `stop_reason` 为 `stop_sequence`。
- `stream` (boolean): 是否使用 SSE 流式增量输出。
- `system` (string | object[]): 系统提示词（对模型角色与风格的上游约束）。

响应中的 `usage` 与 `stop_reason` 等字段含义，详见官方文档页面说明与示例。

参考：`https://docs.anthropic.com/en/api/messages`

#### 消息格式
```json
{
  "role": "user" | "assistant",
  "content": "string" | [
    {
      "type": "text",
      "text": "string"
    },
    {
      "type": "image",
      "source": {
        "type": "base64",
        "media_type": "image/jpeg",
        "data": "base64_encoded_data"
      }
    }
  ]
}
```

### 响应格式

#### 成功响应 (200)
```json
{
  "id": "msg_013Zva2CMHLNnXjNJJKqJ2EF",
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "Hi! My name is Claude."
    }
  ],
  "model": "claude-sonnet-4-20250514",
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "usage": {
    "input_tokens": 2095,
    "output_tokens": 503
  }
}
```

#### 响应字段说明
| 字段 | 类型 | 描述 |
|------|------|------|
| `id` | string | 消息的唯一标识符 |
| `type` | string | 对象类型，始终为 "message" |
| `role` | string | 响应角色，始终为 "assistant" |
| `content` | object[] | 模型生成的内容块数组 |
| `model` | string | 处理请求的模型名称 |
| `stop_reason` | string | 停止生成的原因 |
| `stop_sequence` | string/null | 匹配的自定义停止序列 |
| `usage` | object | 计费和速率限制使用情况 |

#### 停止原因 (stop_reason)
- `end_turn`: 模型达到自然停止点
- `max_tokens`: 超过请求的max_tokens或模型最大值
- `stop_sequence`: 生成了提供的自定义stop_sequences之一
- `tool_use`: 模型调用了一个或多个工具
- `pause_turn`: 暂停了长时间运行的轮次
- `refusal`: 流式分类器干预处理潜在的政策违规

## 示例代码

### 1. 基本文本对话

#### cURL
```bash
curl https://api.anthropic.com/v1/messages \
     --header "x-api-key: $ANTHROPIC_API_KEY" \
     --header "anthropic-version: 2023-06-01" \
     --header "content-type: application/json" \
     --data '{
       "model": "claude-sonnet-4-20250514",
       "max_tokens": 1024,
       "messages": [
         {"role": "user", "content": "Hello, world"}
       ]
     }'
```

<!-- Python 示例已移除 -->

#### JavaScript
```javascript
async function callClaudeAPI() {
  const apiKey = "your-api-key-here";
  const url = "https://api.anthropic.com/v1/messages";
  
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [
        { role: "user", content: "Hello, world" }
      ]
    })
  });
  
  const data = await response.json();
  return data;
}

callClaudeAPI().then(result => {
  console.log(result.content[0].text);
});
```

#### 进一步示例（基础请求与响应，带注释）
```bash
#!/bin/sh
curl https://api.anthropic.com/v1/messages \
     --header "x-api-key: $ANTHROPIC_API_KEY" \  # 必填：API Key
     --header "anthropic-version: 2023-06-01" \  # 必填：API 版本
     --header "content-type: application/json" \  # 必填：JSON 请求
     --data \
'{
  "model": "claude-opus-4-1-20250805",           // 模型
  "max_tokens": 1024,                              // 生成上限
  "messages": [
    {"role": "user", "content": "Hello, Claude"}  // 单轮 user 输入
  ]
}'
```

```json
{
  "id": "msg_01XFDUDYJgAACzvnptvVoYEL",
  "type": "message",
  "role": "assistant",
  "content": [
    { "type": "text", "text": "Hello!" }
  ],
  "model": "claude-opus-4-1-20250805",
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "usage": { "input_tokens": 12, "output_tokens": 6 }
}
```

参考：`https://docs.anthropic.com/en/api/messages-examples`

### 2. 多轮对话

<!-- Python 示例已移除 -->

#### cURL（带注释）
```bash
#!/bin/sh
curl https://api.anthropic.com/v1/messages \
     --header "x-api-key: $ANTHROPIC_API_KEY" \
     --header "anthropic-version: 2023-06-01" \
     --header "content-type: application/json" \
     --data \
'{
  "model": "claude-opus-4-1-20250805",
        "max_tokens": 1024,
        "messages": [
    {"role": "user", "content": "Hello, Claude"},         // 第1轮 user
    {"role": "assistant", "content": "Hello!"},            // 合成 assistant 轮
    {"role": "user", "content": "Can you describe LLMs to me?"} // 第2轮 user
  ]
}'
```

```json
{
  "id": "msg_018gCsTGsXkYJVqYPxTgDHBU",
  "type": "message",
  "role": "assistant",
  "content": [
    { "type": "text", "text": "Sure, I'd be happy to provide..." }
  ],
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "usage": { "input_tokens": 30, "output_tokens": 309 }
}
```

#### 预填充助手回复（Putting words in Claude’s mouth）
```bash
#!/bin/sh
curl https://api.anthropic.com/v1/messages \
     --header "x-api-key: $ANTHROPIC_API_KEY" \
     --header "anthropic-version: 2023-06-01" \
     --header "content-type: application/json" \
     --data \
'{
  "model": "claude-opus-4-1-20250805",
  "max_tokens": 1,                                  // 仅需一个字符/标记
  "messages": [
    {"role": "user", "content": "What is latin for Ant? (A) Apoidea, (B) Rhopalocera, (C) Formicidae"},
    {"role": "assistant", "content": "The answer is ("}   // 预填起始
  ]
}'
```

```json
{
  "id": "msg_01Q8Faay6S7QPTvEUUQARt7h",
  "type": "message",
  "role": "assistant",
  "content": [ { "type": "text", "text": "C" } ],
  "model": "claude-opus-4-1-20250805",
  "stop_reason": "max_tokens",
  "stop_sequence": null,
  "usage": { "input_tokens": 42, "output_tokens": 1 }
}
```

参考：`https://docs.anthropic.com/en/api/messages-examples`

### 3. 流式响应

<!-- Python 示例已移除 -->

#### JavaScript流式处理
```javascript
async function streamClaudeResponse() {
  const apiKey = "your-api-key-here";
  const url = "https://api.anthropic.com/v1/messages";
  
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      stream: true,
      messages: [
        { role: "user", content: "Write a short story about AI." }
      ]
    })
  });
  
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        
        try {
          const event = JSON.parse(data);
          if (event.type === 'content_block_delta') {
            console.log(event.delta.text);
          }
        } catch (e) {
          // 忽略解析错误
        }
      }
    }
  }
}

streamClaudeResponse();
```

#### 3.1 SSE 事件（带注释）
```bash
#!/bin/sh
curl https://api.anthropic.com/v1/messages \
     --header "x-api-key: $ANTHROPIC_API_KEY" \
     --header "anthropic-version: 2023-06-01" \
     --header "content-type: application/json" \
     --data \
'{
  "model": "claude-opus-4-1-20250805",
  "max_tokens": 1024,
  "stream": true,                                 // 启用流式
  "messages": [
    {"role": "user", "content": "Stream a story about AI."}
  ]
}'
```

- 服务端会按事件发送：`message_start`、`content_block_start`、`content_block_delta`、`message_delta`、`message_stop` 等。
- 渲染时重点处理 `content_block_delta.delta.text` 的增量文本。

参考：`https://docs.anthropic.com/zh-CN/docs/build-with-claude/streaming`

### 4. 多模态内容（文本+图像）

<!-- Python 示例已移除 -->

#### cURL（URL 图片源，带注释）
```bash
#!/bin/sh
curl https://api.anthropic.com/v1/messages \
     --header "x-api-key: $ANTHROPIC_API_KEY" \
     --header "anthropic-version": "2023-06-01" \
     --header "content-type: application/json" \
     --data \
'{
  "model": "claude-opus-4-1-20250805",
        "max_tokens": 1024,
        "messages": [
    {"role": "user", "content": [
      {"type": "image", "source": {"type": "url", "url": "https://upload.wikimedia.org/wikipedia/commons/a/a7/Camponotus_flavomarginatus_ant.jpg"}},
      {"type": "text", "text": "What is in the above image?"}
    ]}
  ]
}'
```

```json
{
  "id": "msg_01EcyWo6m4hyW8KHs2y2pei5",
  "type": "message",
  "role": "assistant",
  "content": [ { "type": "text", "text": "This image shows an ant..." } ],
  "model": "claude-opus-4-1-20250805",
  "stop_reason": "end_turn",
  "stop_sequence": null,
  "usage": { "input_tokens": 1551, "output_tokens": 71 }
}
```

参考：`https://docs.anthropic.com/en/api/messages-examples`

### 5. 工具调用示例

<!-- Python 示例已移除 -->

#### cURL（带注释）
```bash
#!/bin/sh
curl https://api.anthropic.com/v1/messages \
     --header "x-api-key: $ANTHROPIC_API_KEY" \
     --header "anthropic-version: 2023-06-01" \
     --header "content-type: application/json" \
     --data \
'{
  "model": "claude-opus-4-1-20250805",
  "max_tokens": 256,
        "tools": [
            {
                "name": "get_weather",
                "description": "Get the current weather in a given location",
                "input_schema": {
                    "type": "object",
                    "properties": {
          "location": {"type": "string"},
          "unit": {"type": "string", "enum": ["celsius", "fahrenheit"]}
                    },
                    "required": ["location"]
                }
            }
        ],
  "tool_choice": "auto",                      // 模型自动决定是否调用工具
        "messages": [
            {"role": "user", "content": "What's the weather like in Tokyo?"}
        ]
}'
```

示例响应（节选）：
```json
{
  "content": [
    {
      "id": "toolu_...",
      "name": "get_weather",
      "input": {"location": "Tokyo", "unit": "celsius"},
      "type": "tool_use"
    }
  ],
  "stop_reason": "tool_use"
}
```

处理方式：后端接收到 `tool_use` 后执行实际函数，并将工具结果以追加消息继续对话。

参考：`https://docs.anthropic.com/en/api/messages-examples`

### 6. 系统提示词示例

<!-- Python 示例已移除 -->

#### 说明
- 系统提示词用于规定助手角色/边界/风格，适合在多轮会话中稳定行为。

参考：`https://docs.anthropic.com/en/api/messages-examples`

---

## Prompt Caching（提示缓存）

### 概述
- 目的：对高复用的上游上下文（如长系统提示、工具定义）进行缓存，降低后续请求的输入 token 成本与延迟。
- 粒度：通常缓存固定前缀（系统提示、工具定义）；带 `messages` 的变化部分不一定命中。

### 使用要点
- 首次请求创建缓存条目，后续请求读取缓存；可通过 `usage.cache_creation_input_tokens` 与 `usage.cache_read_input_tokens` 对比观察。
- 修改思维预算或关键参数可能导致前缀缓存失效（见扩展思维章节）。

### 示例（cURL，带注释）
```bash
#!/bin/sh
curl https://api.anthropic.com/v1/messages \
     --header "x-api-key: $ANTHROPIC_API_KEY" \
     --header "anthropic-version: 2023-06-01" \
     --header "content-type: application/json" \
     --data \
'{
  "model": "claude-opus-4-1-20250805",
  "max_tokens": 128,
  "system": "Long reusable system prompt ...",   // 建议缓存的长前缀
  "messages": [
    {"role": "user", "content": "Question A"}
  ]
}'
```

参考：`https://docs.anthropic.com/zh-CN/docs/build-with-claude/prompt-caching`

---

## Streaming（流式消息）

### 概述
- 通过 SSE 按事件推送，降低首字延迟，便于前端/终端实时渲染。

### 事件类型要点
- `message_start` / `message_delta` / `message_stop`
- `content_block_start` / `content_block_delta` / `content_block_stop`
- 工具相关：`tool_use_delta` 等（如适用）

### 示例（Node/JS 简化读取）
```javascript
const resp = await fetch("https://api.anthropic.com/v1/messages", {
  method: "POST",
  headers: {
    "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
  },
  body: JSON.stringify({
    model: "claude-opus-4-1-20250805",
    max_tokens: 512,
    stream: true,
    messages: [{ role: "user", content: "Stream please" }]
  })
});
const reader = resp.body.getReader();
const decoder = new TextDecoder();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const lines = decoder.decode(value).split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6);
      if (data === '[DONE]') continue;
      try {
        const evt = JSON.parse(data);
        if (evt.type === 'content_block_delta') process.stdout.write(evt.delta.text);
      } catch {}
    }
  }
}
```

参考：`https://docs.anthropic.com/zh-CN/docs/build-with-claude/streaming`

---

## Extended Thinking（扩展思维）

### 概述
- 在响应前进行更深的推理过程，产出思维块（可选可流式），适合复杂推理、数学、代码与分析任务。

### 使用要点（节选）
- 与 `temperature`/`top_k`、强制工具使用存在不兼容；可搭配 `top_p`（建议 1 到 0.95）。
- 当启用思维时，无法预填充响应；调整思维预算可能使带 `messages` 的提示前缀缓存失效，但系统提示与工具定义缓存仍可工作。
- 当 `max_tokens` 大于 21333 时需要流式传输。

### 示例（cURL，概念性）
```bash
#!/bin/sh
curl https://api.anthropic.com/v1/messages \
     --header "x-api-key: $ANTHROPIC_API_KEY" \
     --header "anthropic-version: 2023-06-01" \
     --header "content-type: application/json" \
     --data \
'{
  "model": "claude-opus-4-1-20250805",
  "max_tokens": 512,
  "messages": [
    {"role": "user", "content": "Solve a multi-step math problem with careful reasoning."}
  ]
  // 实际启用思维的参数以官方文档为准，思维块可能以特殊类型返回
}'
```

请结合流式事件解码与 `content` 中的思维块类型处理。

参考：`https://docs.anthropic.com/zh-CN/docs/build-with-claude/extended-thinking`


## Count Message tokens 接口

### 接口概述
- 用途：在不生成回复的情况下，预估一段 `messages/system/tools` 等输入在目标模型下的 token 计数与费用影响，用于配额与速率限制前置评估。
- 端点：
```
POST /v1/messages/count-tokens
```

### 请求参数（要点）
- `model` (string, 必填)：目标模型名。
- `messages` (object[], 可选)：与 `Messages` 接口相同的消息结构。
- `system` (string | object[], 可选)：系统提示词。
- 其他与上下文相关的字段（如 `tools`、`tool_choice`、`metadata` 等）在计数时同样会影响 token 计算。

### cURL 示例
```bash
curl https://api.anthropic.com/v1/messages/count-tokens \
     --header "x-api-key: $ANTHROPIC_API_KEY" \
     --header "anthropic-version: 2023-06-01" \
     --header "content-type: application/json" \
     --data '{
       "model": "claude-sonnet-4-20250514",
       "messages": [
         {"role": "user", "content": "How many tokens will this take?"}
       ]
     }'
```

返回值通常包含按类型拆分的计数（如 `input_tokens` 等）。

参考：`https://docs.anthropic.com/en/api/messages-count-tokens`

## 其他相关接口概览

- Models（模型列表与说明）：查询可用模型与能力、上下文长度限制等。
  - 参考：`https://docs.anthropic.com/en/api/models`
- Message Batches：批量异步消息处理，适合大规模任务与后台作业。
  - 参考：`https://docs.anthropic.com/en/api/message-batches`
- Files：文件上传与管理，用于长文档或工具链场景。
  - 参考：`https://docs.anthropic.com/en/api/files`
- Admin API：工作区级别的使用统计与成本数据（Usage and Cost API）。
  - 参考：`https://docs.anthropic.com/en/api/admin`
- Experimental APIs：实验性能力与早期预览接口，随时间可能变化。
  - 参考：`https://docs.anthropic.com/en/api/experimental`

### 相关响应字段补充
- `usage`：计费与速率限制统计。
  - `input_tokens`、`output_tokens`：输入与输出 token 数。
  - `cache_creation_input_tokens` / `cache_read_input_tokens`：命中缓存的输入 token 计数（如使用 cache control）。
  - `service_tier`：此次请求所使用的服务层级（`standard`/`priority`/`batch`）。
- `stop_reason`：停止原因。
  - `end_turn` / `max_tokens` / `stop_sequence` / `tool_use` / `pause_turn` / `refusal`。
- `container`：当使用容器/工具相关能力时返回容器信息（如 `id`、`expires_at`）。

以上信息以官方文档为准，详见：`https://docs.anthropic.com/en/api/messages`

以上条目建议按项目需要选择性集成，并密切关注官方文档的版本变更与兼容性说明。

---

## 批处理（Message Batches）

### 概述
- 异步批量提交 `Messages` 请求，提升吞吐并大幅节省成本（约 50%）。
- 适用于不需要立即响应的大规模评估、审核、摘要与内容生成等。

### 创建批次（带注释）
```bash
#!/bin/sh
curl https://api.anthropic.com/v1/messages/batches \
     --header "x-api-key: $ANTHROPIC_API_KEY" \
     --header "anthropic-version: 2023-06-01" \
     --header "content-type: application/json" \
     --data '
{
  "requests": [
    {
      "custom_id": "req-1",                          // 便于结果对齐
      "params": {
        "model": "claude-opus-4-20250514",
        "max_tokens": 512,
        "messages": [
          {"role": "user", "content": "Summarize article A."}
        ]
      }
    },
    {
      "custom_id": "req-2",
      "params": {
        "model": "claude-opus-4-20250514",
        "max_tokens": 512,
        "messages": [
          {"role": "user", "content": "Summarize article B."}
        ]
      }
    }
  ]
}'
```

示例响应（创建批次）
```json
{
  "id": "mb_01H...",
  "type": "message_batch",
  "processing_status": "in_progress",   // 处理中
  "created_at": "2025-09-10T10:00:00Z"
}
```

### 轮询批次状态
```bash
curl https://api.anthropic.com/v1/messages/batches/mb_01H... \
     --header "x-api-key: $ANTHROPIC_API_KEY" \
     --header "anthropic-version: 2023-06-01"
```

示例响应（状态）
```json
{
  "id": "mb_01H...",
  "processing_status": "ended",          // ended | in_progress | canceled | expired
  "ended_at": "2025-09-10T10:42:00Z"
}
```

### 获取批次结果
```bash
curl https://api.anthropic.com/v1/messages/batches/mb_01H.../results \
     --header "x-api-key: $ANTHROPIC_API_KEY" \
     --header "anthropic-version: 2023-06-01"
```

示例响应（结果概览）
```json
{
  "results": [
    {
      "custom_id": "req-1",
      "result": {
        "status": "succeeded",
        "message": { "type": "message", "content": [{"type": "text", "text": "..."}] }
      }
    },
    {
      "custom_id": "req-2",
      "result": { "status": "errored", "error": { "type": "invalid_request_error", "message": "..." } }
    }
  ]
}
```

参考：`https://docs.anthropic.com/zh-CN/docs/build-with-claude/batch-processing`

---

## 引用（Citations）

### 概述
- 通过提示设计与输出约定，让模型在回答中标注出处并给出引用条目，适合问答、检索增强生成（RAG）等场景。

### 提示范式与示例
```bash
#!/bin/sh
curl https://api.anthropic.com/v1/messages \
     --header "x-api-key: $ANTHROPIC_API_KEY" \
     --header "anthropic-version: 2023-06-01" \
     --header "content-type: application/json" \
     --data '
{
  "model": "claude-sonnet-4-20250514",
  "max_tokens": 512,
  "system": "当你引用来源时，请在文中以[1]、[2]标注，并在答案末尾提供sources数组（JSON），包含title与url。",
  "messages": [
    {"role": "user", "content": "根据以下两篇链接回答问题：\n1) https://example.com/doc1\n2) https://example.com/doc2\n问题：给出两篇文章的主要差异。"}
  ]
}'
```

示例响应（简化）
```json
{
  "content": [
    {"type": "text", "text": "两篇文章在方法论与实验设置上存在显著差异[1][2]...\n\nSources: \n"},
    {"type": "text", "text": "[\n  {\"title\": \"Doc1\", \"url\": \"https://example.com/doc1\"},\n  {\"title\": \"Doc2\", \"url\": \"https://example.com/doc2\"}\n]"}
  ]
}
```

参考：`https://docs.anthropic.com/zh-CN/docs/build-with-claude/citations`

---

## 嵌入向量（Embeddings）

### 概述
- 使用 Embeddings API 将文本转化为向量，用于检索、聚类、语义搜索与相似度计算等。

### 创建嵌入（带注释）
```bash
#!/bin/sh
curl https://api.anthropic.com/v1/embeddings \
     --header "x-api-key: $ANTHROPIC_API_KEY" \
     --header "anthropic-version: 2023-06-01" \
     --header "content-type: application/json" \
     --data '
{
  "model": "claude-embedding-2024-xx",        // 请参考模型文档选择可用 embedding 模型
  "input": [
    "A quick brown fox jumps over the lazy dog.",
    "Large language models are useful for many tasks."
  ]
}'
```

示例响应（简化）
```json
{
  "data": [
    { "index": 0, "embedding": [0.01, -0.02, 0.03, "..."] },
    { "index": 1, "embedding": [0.00, 0.05, -0.01, "..."] }
  ],
  "model": "claude-embedding-2024-xx"
}
```

参考：`https://docs.anthropic.com/zh-CN/docs/build-with-claude/embeddings`

---

## 视觉（Vision）补充

### Base64 图像示例
```bash
#!/bin/sh
IMAGE_URL="https://upload.wikimedia.org/wikipedia/commons/a/a7/Camponotus_flavomarginatus_ant.jpg"
IMAGE_MEDIA_TYPE="image/jpeg"
IMAGE_BASE64=$(curl "$IMAGE_URL" | base64)

curl https://api.anthropic.com/v1/messages \
     --header "x-api-key: $ANTHROPIC_API_KEY" \
     --header "anthropic-version: 2023-06-01" \
     --header "content-type: application/json" \
     --data '
{
  "model": "claude-opus-4-1-20250805",
  "max_tokens": 512,
  "messages": [
    {"role": "user", "content": [
      {"type": "image", "source": {"type": "base64", "media_type": "'$IMAGE_MEDIA_TYPE'", "data": "'$IMAGE_BASE64'"}},
      {"type": "text", "text": "What is in the above image?"}
    ]}
  ]
}'
```

### 多图输入（并列对比）
```bash
#!/bin/sh
curl https://api.anthropic.com/v1/messages \
     --header "x-api-key: $ANTHROPIC_API_KEY" \
     --header "anthropic-version: 2023-06-01" \
     --header "content-type: application/json" \
     --data '
{
  "model": "claude-sonnet-4-20250514",
  "max_tokens": 512,
  "messages": [
    {"role": "user", "content": [
      {"type": "image", "source": {"type": "url", "url": "https://example.com/img1.jpg"}},
      {"type": "image", "source": {"type": "url", "url": "https://example.com/img2.jpg"}},
      {"type": "text", "text": "Compare these two images."}
    ]}
  ]
}'
```

参考：`https://docs.anthropic.com/zh-CN/docs/build-with-claude/vision`

---

## PDF 支持（Files API）

### 概述
- 通过 Files API 上传 PDF 等文档，并在对话中引用以实现长文档问答与摘要。

### 上传文件（带注释）
```bash
#!/bin/sh
curl https://api.anthropic.com/v1/files \
     --header "x-api-key: $ANTHROPIC_API_KEY" \
     --header "anthropic-version: 2023-06-01" \
     -F "file=@./document.pdf" \
     -F "purpose=general"
```

示例响应（上传）
```json
{
  "id": "file_01F...",
  "filename": "document.pdf",
  "purpose": "general",
  "status": "processed"
}
``;

### 在对话中引用文件（概念性示例）
```bash
#!/bin/sh
curl https://api.anthropic.com/v1/messages \
     --header "x-api-key: $ANTHROPIC_API_KEY" \
     --header "anthropic-version: 2023-06-01" \
     --header "content-type: application/json" \
     --data '
{
  "model": "claude-sonnet-4-20250514",
  "max_tokens": 512,
  "messages": [
    {"role": "user", "content": [
      {"type": "text", "text": "Summarize the key points from the attached PDF."}
      // 实际引用方式以官方 Files API 文档为准（可包含文件标识）
    ]}
  ]
}'
```

参考：`https://docs.anthropic.com/zh-CN/docs/build-with-claude/pdf-support`
