# Claude API 官方文档完整指南

本文档基于 Anthropic 官方文档编写，涵盖 Claude API 的核心功能与最佳实践。

**官方文档**: https://docs.anthropic.com/

---

## 目录

1. [Messages API](#messages-api)
2. [Prompt Caching（提示缓存）](#prompt-caching提示缓存)
3. [Context Editing（上下文编辑）](#context-editing上下文编辑)
4. [Extended Thinking（扩展思维）](#extended-thinking扩展思维)
5. [Streaming（流式响应）](#streaming流式响应)
6. [Count Tokens API](#count-tokens-api)
7. [其他功能](#其他功能)

---

## Messages API

### 概述

Messages API 是与 Claude 交互的核心接口，支持发送文本、图像等多模态内容，获取对话响应。

**端点**: `POST https://api.anthropic.com/v1/messages`

**官方文档**: https://docs.anthropic.com/en/api/messages

### 请求参数

#### 必需参数

| 参数 | 类型 | 描述 |
|------|------|------|
| `model` | string | 模型名称（如 `claude-sonnet-4-5-20250929`） |
| `max_tokens` | integer | 生成的最大 token 数（≥1） |
| `messages` | array | 对话消息列表 |

#### 可选参数

| 参数 | 类型 | 描述 |
|------|------|------|
| `system` | string/array | 系统提示词 |
| `temperature` | number | 随机性控制（0.0-1.0） |
| `top_p` | number | 核采样参数（0.0-1.0） |
| `top_k` | integer | 仅从 top K 选项采样 |
| `stream` | boolean | 是否启用流式响应 |
| `stop_sequences` | array | 自定义停止序列 |
| `tools` | array | 可用工具定义 |
| `tool_choice` | object/string | 工具选择策略 |
| `metadata` | object | 请求元数据 |

### 消息格式

```json
{
  "role": "user",
  "content": [
    {
      "type": "text",
      "text": "Hello, Claude"
    },
    {
      "type": "image",
      "source": {
        "type": "url",
        "url": "https://example.com/image.jpg"
      }
    }
  ]
}
```

### 响应格式

```json
{
  "id": "msg_01XFDUDYJgAACzvnptvVoYEL",
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "Hello! How can I help you today?"
    }
  ],
  "model": "claude-sonnet-4-5-20250929",
  "stop_reason": "end_turn",
  "usage": {
    "input_tokens": 12,
    "output_tokens": 10
  }
}
```

### 停止原因（stop_reason）

- `end_turn`: 模型完成响应
- `max_tokens`: 达到 token 上限
- `stop_sequence`: 触发自定义停止序列
- `tool_use`: 模型请求使用工具
- `pause_turn`: 暂停长时间运行
- `refusal`: 拒绝响应（政策违规）

### 示例：基本对话

```bash
curl https://api.anthropic.com/v1/messages \
  --header "x-api-key: $ANTHROPIC_API_KEY" \
  --header "anthropic-version: 2023-06-01" \
  --header "content-type: application/json" \
  --data '{
    "model": "claude-sonnet-4-5-20250929",
    "max_tokens": 1024,
    "messages": [
      {"role": "user", "content": "Hello, world"}
    ]
  }'
```

### 示例：多轮对话

#### 基础多轮对话

```bash
curl https://api.anthropic.com/v1/messages \
  --header "x-api-key: $ANTHROPIC_API_KEY" \
  --header "anthropic-version: 2023-06-01" \
  --header "content-type: application/json" \
  --data '{
    "model": "claude-sonnet-4-5-20250929",
    "max_tokens": 1024,
    "messages": [
      {"role": "user", "content": "Hello, Claude"},
      {"role": "assistant", "content": "Hello!"},
      {"role": "user", "content": "Can you explain LLMs?"}
    ]
  }'
```

**注意**：Messages API 是无状态的，需要在每次请求中发送完整的对话历史。

#### 多轮对话 + 工具调用

```bash
# 第一轮：用户请求 -> Claude 调用工具
curl https://api.anthropic.com/v1/messages \
  --header "x-api-key: $ANTHROPIC_API_KEY" \
  --header "anthropic-version: 2023-06-01" \
  --header "content-type: application/json" \
  --data '{
    "model": "claude-sonnet-4-5-20250929",
    "max_tokens": 1024,
    "tools": [
      {
        "name": "get_weather",
        "description": "Get current weather in a location",
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
    "messages": [
      {"role": "user", "content": "What is the weather in Tokyo?"}
    ]
  }'
```

**响应示例**：
```json
{
  "id": "msg_01...",
  "role": "assistant",
  "content": [
    {
      "type": "tool_use",
      "id": "toolu_01...",
      "name": "get_weather",
      "input": {"location": "Tokyo", "unit": "celsius"}
    }
  ],
  "stop_reason": "tool_use"
}
```

```bash
# 第二轮：返回工具结果 -> Claude 生成最终响应
curl https://api.anthropic.com/v1/messages \
  --header "x-api-key: $ANTHROPIC_API_KEY" \
  --header "anthropic-version: 2023-06-01" \
  --header "content-type: application/json" \
  --data '{
    "model": "claude-sonnet-4-5-20250929",
    "max_tokens": 1024,
    "tools": [...],
    "messages": [
      {"role": "user", "content": "What is the weather in Tokyo?"},
      {
        "role": "assistant",
        "content": [
          {
            "type": "tool_use",
            "id": "toolu_01...",
            "name": "get_weather",
            "input": {"location": "Tokyo", "unit": "celsius"}
          }
        ]
      },
      {
        "role": "user",
        "content": [
          {
            "type": "tool_result",
            "tool_use_id": "toolu_01...",
            "content": "{\"temperature\": 22, \"condition\": \"sunny\"}"
          }
        ]
      }
    ]
  }'
```

**最终响应**：
```json
{
  "content": [
    {
      "type": "text",
      "text": "The weather in Tokyo is currently sunny with a temperature of 22°C."
    }
  ],
  "stop_reason": "end_turn"
}
```

#### 多轮对话 + Extended Thinking + 工具调用（交错思考）

**启用交错思考**需要添加 Beta Header：`anthropic-beta: interleaved-thinking-2025-05-14`

交错思考允许 Claude 在工具调用之间进行推理，适用于需要多步骤分析的复杂任务。

```bash
# 第一轮：启用 Extended Thinking 和工具
curl https://api.anthropic.com/v1/messages \
  --header "x-api-key: $ANTHROPIC_API_KEY" \
  --header "anthropic-version: 2023-06-01" \
  --header "anthropic-beta: interleaved-thinking-2025-05-14" \
  --header "content-type: application/json" \
  --data '{
    "model": "claude-sonnet-4-5-20250929",
    "max_tokens": 4096,
    "thinking": {
      "type": "enabled",
      "budget_tokens": 8000
    },
    "tools": [
      {
        "name": "search_database",
        "description": "Search product database",
        "input_schema": {
          "type": "object",
          "properties": {
            "query": {"type": "string"},
            "category": {"type": "string"}
          },
          "required": ["query"]
        }
      },
      {
        "name": "calculate_price",
        "description": "Calculate final price with discount",
        "input_schema": {
          "type": "object",
          "properties": {
            "base_price": {"type": "number"},
            "discount_percent": {"type": "number"}
          },
          "required": ["base_price"]
        }
      }
    ],
    "messages": [
      {
        "role": "user",
        "content": "Find me the best laptop under $1000, calculate the price with a 15% student discount, and explain why it is the best choice."
      }
    ]
  }'
```

**第一轮响应示例**（包含思考和工具调用）：
```json
{
  "content": [
    {
      "type": "thinking",
      "thinking": "I need to search for laptops first, then evaluate the results, calculate the discounted price, and explain my reasoning..."
    },
    {
      "type": "tool_use",
      "id": "toolu_01...",
      "name": "search_database",
      "input": {"query": "laptop", "category": "computers"}
    }
  ],
  "stop_reason": "tool_use"
}
```

```bash
# 第二轮：返回第一个工具结果，Claude 继续推理并调用第二个工具
curl https://api.anthropic.com/v1/messages \
  --header "x-api-key: $ANTHROPIC_API_KEY" \
  --header "anthropic-version: 2023-06-01" \
  --header "anthropic-beta: interleaved-thinking-2025-05-14" \
  --header "content-type: application/json" \
  --data '{
    "model": "claude-sonnet-4-5-20250929",
    "max_tokens": 4096,
    "thinking": {
      "type": "enabled",
      "budget_tokens": 8000
    },
    "tools": [...],
    "messages": [
      {
        "role": "user",
        "content": "Find me the best laptop..."
      },
      {
        "role": "assistant",
        "content": [
          {
            "type": "thinking",
            "thinking": "I need to search for laptops first..."
          },
          {
            "type": "tool_use",
            "id": "toolu_01...",
            "name": "search_database",
            "input": {"query": "laptop", "category": "computers"}
          }
        ]
      },
      {
        "role": "user",
        "content": [
          {
            "type": "tool_result",
            "tool_use_id": "toolu_01...",
            "content": "[{\"name\":\"Dell XPS 13\",\"price\":950},{\"name\":\"MacBook Air\",\"price\":999}]"
          }
        ]
      }
    ]
  }'
```

**第二轮响应示例**（交错思考 + 下一个工具调用）：
```json
{
  "content": [
    {
      "type": "thinking",
      "thinking": "Based on the search results, I found two options under $1000. The Dell XPS 13 at $950 seems like the better value. Now I need to calculate the price with the 15% student discount..."
    },
    {
      "type": "tool_use",
      "id": "toolu_02...",
      "name": "calculate_price",
      "input": {"base_price": 950, "discount_percent": 15}
    }
  ],
  "stop_reason": "tool_use"
}
```

```bash
# 第三轮：返回第二个工具结果，Claude 生成最终响应
curl https://api.anthropic.com/v1/messages \
  --header "x-api-key: $ANTHROPIC_API_KEY" \
  --header "anthropic-version: 2023-06-01" \
  --header "anthropic-beta: interleaved-thinking-2025-05-14" \
  --header "content-type: application/json" \
  --data '{
    "model": "claude-sonnet-4-5-20250929",
    "max_tokens": 4096,
    "thinking": {
      "type": "enabled",
      "budget_tokens": 8000
    },
    "tools": [...],
    "messages": [
      {"role": "user", "content": "Find me the best laptop..."},
      {
        "role": "assistant",
        "content": [
          {"type": "thinking", "thinking": "I need to search..."},
          {"type": "tool_use", "id": "toolu_01...", "name": "search_database", "input": {...}}
        ]
      },
      {
        "role": "user",
        "content": [
          {"type": "tool_result", "tool_use_id": "toolu_01...", "content": "[...]"}
        ]
      },
      {
        "role": "assistant",
        "content": [
          {"type": "thinking", "thinking": "Based on the search results..."},
          {"type": "tool_use", "id": "toolu_02...", "name": "calculate_price", "input": {...}}
        ]
      },
      {
        "role": "user",
        "content": [
          {"type": "tool_result", "tool_use_id": "toolu_02...", "content": "807.50"}
        ]
      }
    ]
  }'
```

**最终响应示例**：
```json
{
  "content": [
    {
      "type": "thinking",
      "thinking": "Now I have all the information. The discounted price is $807.50, which is excellent value. I can now provide a comprehensive recommendation..."
    },
    {
      "type": "text",
      "text": "Based on my research, I recommend the **Dell XPS 13** for $807.50 (after 15% student discount).\n\n**Why it's the best choice:**\n1. Fits comfortably under your $1000 budget\n2. Excellent build quality and performance\n3. Long battery life ideal for students\n4. Portable 13-inch form factor\n\nWith the student discount, you save $142.50, bringing the final price to just $807.50."
    }
  ],
  "stop_reason": "end_turn",
  "usage": {
    "input_tokens": 450,
    "output_tokens": 2100
  }
}
```

**关键要点**：

1. **必须保留思考块**：在多轮对话中，必须将完整的 `thinking` 块传回 API，保持推理连续性
2. **交错思考的优势**：
   - 在工具调用之间进行推理
   - 根据中间结果做出更明智的决策
   - 链接多个工具调用并在它们之间进行推理
3. **Beta 功能**：交错思考需要添加 `anthropic-beta: interleaved-thinking-2025-05-14` header
4. **仅支持 Claude 4 模型**：Opus 4、Sonnet 4、Sonnet 4.5 等

#### JavaScript/TypeScript 多轮对话示例

```typescript
interface Message {
  role: 'user' | 'assistant';
  content: string | Array<any>;
}

async function multiTurnConversation() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const messages: Message[] = [];

  // 第一轮：用户问候
  messages.push({ role: 'user', content: 'Hello, Claude!' });

  let response = await callClaude(messages);
  console.log('Claude:', response.content[0].text);

  // 保存 assistant 的回复到历史
  messages.push({ role: 'assistant', content: response.content[0].text });

  // 第二轮：提问
  messages.push({ role: 'user', content: 'Can you help me understand prompt caching?' });

  response = await callClaude(messages);
  console.log('Claude:', response.content[0].text);

  // 继续保存历史...
  messages.push({ role: 'assistant', content: response.content[0].text });

  // 第三轮：深入提问
  messages.push({ role: 'user', content: 'How much can I save with caching?' });

  response = await callClaude(messages);
  console.log('Claude:', response.content[0].text);
}

async function callClaude(messages: Message[]) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      messages: messages
    })
  });

  return await response.json();
}
```

#### JavaScript 多轮对话 + 工具调用示例

```javascript
// 工具定义
const tools = [
  {
    name: 'get_weather',
    description: 'Get current weather in a location',
    input_schema: {
      type: 'object',
      properties: {
        location: { type: 'string' },
        unit: { type: 'string', enum: ['celsius', 'fahrenheit'] }
      },
      required: ['location']
    }
  }
];

// 模拟天气 API
function getWeather(location, unit = 'celsius') {
  // 实际应用中这里应调用真实的天气 API
  return JSON.stringify({
    location,
    temperature: 22,
    unit,
    condition: 'sunny'
  });
}

async function conversationWithTools() {
  const messages = [];

  // 第一轮：用户请求天气
  messages.push({
    role: 'user',
    content: 'What is the weather like in Tokyo?'
  });

  let response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      tools: tools,
      messages: messages
    })
  });

  let data = await response.json();

  // Claude 请求调用工具
  if (data.stop_reason === 'tool_use') {
    const toolUse = data.content.find(block => block.type === 'tool_use');

    // 保存 assistant 的工具调用请求
    messages.push({
      role: 'assistant',
      content: data.content
    });

    // 执行工具调用
    let toolResult;
    if (toolUse.name === 'get_weather') {
      toolResult = getWeather(toolUse.input.location, toolUse.input.unit);
    }

    // 返回工具结果
    messages.push({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: toolResult
        }
      ]
    });

    // 第二轮：获取 Claude 的最终响应
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1024,
        tools: tools,
        messages: messages
      })
    });

    data = await response.json();
    console.log('Claude:', data.content[0].text);
  }
}
```

### 示例：基础工具调用

```bash
curl https://api.anthropic.com/v1/messages \
  --header "x-api-key: $ANTHROPIC_API_KEY" \
  --header "anthropic-version: 2023-06-01" \
  --header "content-type: application/json" \
  --data '{
    "model": "claude-sonnet-4-5-20250929",
    "max_tokens": 1024,
    "tools": [
      {
        "name": "get_weather",
        "description": "Get current weather in a location",
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
    "messages": [
      {"role": "user", "content": "What is the weather in Tokyo?"}
    ]
  }'
```

---

## Prompt Caching（提示缓存）

### 概述

Prompt Caching 允许缓存提示前缀，减少重复内容的处理时间和成本。适用于长系统提示、工具定义等稳定内容。

**官方文档**: https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching

### 工作原理

- 系统检查提示前缀是否已缓存
- 如已缓存，使用缓存版本，降低成本和延迟
- 缓存生命周期：5 分钟，每次使用刷新

### 支持的模型

- Claude Opus 4.1 和 4
- Claude Sonnet 4.5、4 和 3.7
- Claude Haiku 4.5、3.5 和 3

### 最小缓存长度

- 大部分模型：1024 tokens
- Haiku 模型：2048 tokens

### 定价

- **缓存写入**：比基础输入 token 价格高 25%
- **缓存读取**：基础输入 token 价格的 10%

### 使用方式

在内容块中添加 `cache_control` 参数：

```json
{
  "model": "claude-sonnet-4-5-20250929",
  "max_tokens": 1024,
  "system": [
    {
      "type": "text",
      "text": "Long system prompt here...",
      "cache_control": {"type": "ephemeral"}
    }
  ],
  "messages": [
    {"role": "user", "content": "Question"}
  ]
}
```

### 缓存断点

- 最多支持 4 个缓存断点
- 按照从前到后的顺序匹配最长前缀
- 可在 system、tools、messages 中设置

### 最佳实践

1. **缓存稳定内容**：系统提示、工具定义、常见文档
2. **将可缓存内容置于前面**：提高命中率
3. **监控缓存命中率**：通过 `usage` 字段分析效果
4. **避免频繁修改**：工具或系统提示变化会使缓存失效

### 示例响应中的用量统计

```json
{
  "usage": {
    "input_tokens": 100,
    "cache_creation_input_tokens": 1024,
    "cache_read_input_tokens": 0,
    "output_tokens": 50
  }
}
```

---

## Context Editing（上下文编辑）

### 概述

Context Editing（上下文编辑）是一个 Beta 功能，用于自动管理对话上下文。当对话超过配置阈值时，自动清理旧的工具结果，防止上下文溢出。

**Beta Header**: `anthropic-beta: context-management-2025-06-27`

**官方文档**: https://docs.anthropic.com/en/docs/build-with-claude/context-editing

### 工作原理

- 当对话上下文增长超过阈值时自动触发
- 优先清理最旧的工具结果
- 替换为占位符文本
- 在服务端执行，对 Claude 透明
- 保留最近的工具交互

### 支持的模型

- Claude Opus 4.1 和 4
- Claude Sonnet 4.5 和 4
- Claude Haiku 4.5

### 配置选项

| 参数 | 默认值 | 描述 |
|------|--------|------|
| `trigger_threshold` | 100,000 | 触发清理的输入 token 阈值 |
| `num_tool_uses_to_keep` | 3 | 保留最近 N 次工具使用 |
| `min_tokens_to_clear` | 可选 | 最小清理 token 数 |
| `exclude_tools` | 可选 | 排除清理的工具名称列表 |

### 使用示例

```bash
curl https://api.anthropic.com/v1/messages \
  --header "x-api-key: $ANTHROPIC_API_KEY" \
  --header "anthropic-version: 2023-06-01" \
  --header "anthropic-beta: context-management-2025-06-27" \
  --header "content-type: application/json" \
  --data '{
    "model": "claude-sonnet-4-5-20250929",
    "max_tokens": 1024,
    "context_management": {
      "edits": [
        {
          "type": "clear_tool_uses_20250919",
          "trigger_threshold": 80000,
          "num_tool_uses_to_keep": 5
        }
      ]
    },
    "messages": [
      {"role": "user", "content": "Continue our conversation"}
    ]
  }'
```

### 注意事项

- **破坏缓存**：清理内容会使提示缓存失效
- **与 Memory Tool 配合**：可结合使用以保留重要信息
- **客户端保留完整历史**：清理仅在服务端进行
- **响应包含编辑详情**：可查看应用的编辑操作

---

## Extended Thinking（扩展思维）

### 概述

Extended Thinking 增强 Claude 的推理能力，在生成最终答案前进行深度思考。适用于复杂推理、数学、编程和分析任务。

**官方文档**: https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking

### 支持的模型

- Claude Opus 4.1 和 4
- Claude Sonnet 4.5、4 和 3.7
- Claude Haiku 4.5

### 启用方式

在请求中添加 `thinking` 对象：

```json
{
  "model": "claude-sonnet-4-5-20250929",
  "max_tokens": 16000,
  "thinking": {
    "type": "enabled",
    "budget_tokens": 10000
  },
  "messages": [
    {"role": "user", "content": "Solve this complex math problem..."}
  ]
}
```

### 关键特性

- **透明推理**：生成 `thinking` 内容块展示思考过程
- **可控预算**：通过 `budget_tokens` 控制思考深度
- **支持流式**：可实时展示思考过程
- **工具集成**：支持交错思考（interleaved thinking）

### 交错思考（Interleaved Thinking）

交错思考是 Extended Thinking 的高级特性，允许 Claude 在工具调用之间进行推理。

**启用方式**：添加 Beta Header `anthropic-beta: interleaved-thinking-2025-05-14`

**主要优势**：
1. **工具调用之间推理**：Claude 可以在接收工具结果后继续思考
2. **链式工具调用**：根据前一个工具的结果智能选择下一个工具
3. **动态策略调整**：从失败的工具调用中学习并调整策略
4. **更复杂的决策**：基于中间结果做出更明智的判断

**示例**：

```bash
curl https://api.anthropic.com/v1/messages \
  --header "x-api-key: $ANTHROPIC_API_KEY" \
  --header "anthropic-version: 2023-06-01" \
  --header "anthropic-beta: interleaved-thinking-2025-05-14" \
  --header "content-type: application/json" \
  --data '{
    "model": "claude-sonnet-4-5-20250929",
    "max_tokens": 4096,
    "thinking": {
      "type": "enabled",
      "budget_tokens": 10000
    },
    "tools": [...],
    "messages": [...]
  }'
```

**工作流程示例**：
```
用户请求 → Claude 思考 → 调用工具 A → Claude 分析结果并思考 → 调用工具 B → Claude 综合思考 → 最终回答
```

**注意事项**：
- 仅支持 Claude 4 系列模型（Opus 4、Sonnet 4、Sonnet 4.5 等）
- 必须保留完整的 `thinking` 块在多轮对话中
- 不能与 `temperature` 或强制工具使用同时启用

详细的交错思考示例请参见上文 [多轮对话 + Extended Thinking + 工具调用](#多轮对话--extended-thinking--工具调用交错思考) 章节。

### 思考预算建议

- **复杂任务**：16,000+ tokens
- **中等任务**：8,000-16,000 tokens
- **简单任务**：4,000-8,000 tokens

### 定价

思考 token 按输出 token 计费：

- Sonnet 4.5: $15/MTok（输出）
- Opus 4: $75/MTok（输出）

### 响应格式

```json
{
  "id": "msg_01...",
  "type": "message",
  "role": "assistant",
  "content": [
    {
      "type": "thinking",
      "thinking": "Let me work through this step by step..."
    },
    {
      "type": "text",
      "text": "The answer is 42."
    }
  ],
  "usage": {
    "input_tokens": 100,
    "output_tokens": 1500
  }
}
```

### 兼容性限制

- **不支持 temperature 修改**
- **不支持预填充响应**
- **不能与强制工具使用同时启用**
- **修改预算会使带 messages 的缓存失效**
- **当 max_tokens > 21333 时必须使用流式传输**

### 最佳实践

1. **起始预算充足**：对复杂任务使用 16k+ tokens
2. **监控使用情况**：跟踪思考 token 消耗
3. **适用场景**：数学、代码生成、逻辑推理、多步分析
4. **与流式结合**：实时展示推理过程提升体验

---

## Streaming（流式响应）

### 概述

Streaming 使用服务器发送事件（SSE）增量传递响应，降低首字延迟，提升用户体验。

**官方文档**: https://docs.anthropic.com/en/docs/build-with-claude/streaming

### 启用方式

设置 `"stream": true`：

```bash
curl https://api.anthropic.com/v1/messages \
  --header "x-api-key: $ANTHROPIC_API_KEY" \
  --header "anthropic-version: 2023-06-01" \
  --header "content-type: application/json" \
  --data '{
    "model": "claude-sonnet-4-5-20250929",
    "max_tokens": 1024,
    "stream": true,
    "messages": [
      {"role": "user", "content": "Write a story"}
    ]
  }'
```

### 事件流程

1. **message_start**: 消息开始，包含空内容
2. **content_block_start**: 内容块开始
3. **content_block_delta**: 增量内容（多次）
4. **content_block_stop**: 内容块结束
5. **message_delta**: 消息级别更新
6. **message_stop**: 消息结束

### 内容块类型

#### 文本增量

```json
{
  "type": "content_block_delta",
  "index": 0,
  "delta": {
    "type": "text_delta",
    "text": "Hello"
  }
}
```

#### 工具使用增量

```json
{
  "type": "content_block_delta",
  "index": 0,
  "delta": {
    "type": "input_json_delta",
    "partial_json": "{\"location\":"
  }
}
```

#### 思考增量

```json
{
  "type": "content_block_delta",
  "index": 0,
  "delta": {
    "type": "thinking_delta",
    "thinking": "Let me consider..."
  }
}
```

### JavaScript 单轮流式示例

```javascript
const response = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'x-api-key': process.env.ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json'
  },
  body: JSON.stringify({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1024,
    stream: true,
    messages: [{ role: 'user', content: 'Hello' }]
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
          process.stdout.write(event.delta.text);
        }
      } catch (e) {
        // 忽略解析错误
      }
    }
  }
}
```

### 多轮对话流式输出示例

#### JavaScript/TypeScript 完整实现

```typescript
interface StreamEvent {
  type: string;
  index?: number;
  delta?: any;
  content_block?: any;
  message?: any;
}

interface Message {
  role: 'user' | 'assistant';
  content: string | any[];
}

class ClaudeStreamChat {
  private messages: Message[] = [];
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async sendMessage(userMessage: string): Promise<string> {
    // 添加用户消息
    this.messages.push({
      role: 'user',
      content: userMessage
    });

    console.log(`\nUser: ${userMessage}`);
    console.log('Claude: ');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1024,
        stream: true,
        messages: this.messages
      })
    });

    // 收集完整的 assistant 响应
    let fullResponse = '';
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (!data || data === '[DONE]') continue;

            try {
              const event: StreamEvent = JSON.parse(data);

              // 处理文本增量
              if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                const text = event.delta.text;
                process.stdout.write(text); // 实时输出
                fullResponse += text;
              }

              // 处理消息停止事件
              if (event.type === 'message_stop') {
                console.log('\n');
              }
            } catch (e) {
              // 忽略 JSON 解析错误
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // 保存 assistant 响应到历史
    this.messages.push({
      role: 'assistant',
      content: fullResponse
    });

    return fullResponse;
  }

  getHistory(): Message[] {
    return this.messages;
  }
}

// 使用示例
async function multiTurnStreamingChat() {
  const chat = new ClaudeStreamChat(process.env.ANTHROPIC_API_KEY!);

  // 第一轮
  await chat.sendMessage('Hello! What can you tell me about streaming APIs?');

  // 第二轮
  await chat.sendMessage('Can you give me a practical example?');

  // 第三轮
  await chat.sendMessage('What are the benefits compared to non-streaming?');

  console.log('\n--- Conversation History ---');
  console.log(JSON.stringify(chat.getHistory(), null, 2));
}
```

#### cURL 多轮流式对话示例

```bash
# 第一轮：流式响应
curl -N https://api.anthropic.com/v1/messages \
  --header "x-api-key: $ANTHROPIC_API_KEY" \
  --header "anthropic-version: 2023-06-01" \
  --header "content-type: application/json" \
  --data '{
    "model": "claude-sonnet-4-5-20250929",
    "max_tokens": 1024,
    "stream": true,
    "messages": [
      {"role": "user", "content": "Tell me a short story about AI"}
    ]
  }'
```

**流式响应输出**：
```
data: {"type":"message_start","message":{"id":"msg_01...","role":"assistant",...}}

data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Once"}}

data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" upon"}}

data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" a"}}

...

data: {"type":"content_block_stop","index":0}

data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":150}}

data: {"type":"message_stop"}
```

```bash
# 第二轮：继续流式对话（需要收集第一轮的完整响应）
curl -N https://api.anthropic.com/v1/messages \
  --header "x-api-key: $ANTHROPIC_API_KEY" \
  --header "anthropic-version: 2023-06-01" \
  --header "content-type: application/json" \
  --data '{
    "model": "claude-sonnet-4-5-20250929",
    "max_tokens": 1024,
    "stream": true,
    "messages": [
      {"role": "user", "content": "Tell me a short story about AI"},
      {"role": "assistant", "content": "Once upon a time... [完整的第一轮响应]"},
      {"role": "user", "content": "What is the moral of this story?"}
    ]
  }'
```

### 多轮对话 + 流式 + 工具调用示例

```typescript
async function streamingChatWithTools() {
  const messages: Message[] = [];

  const tools = [
    {
      name: 'get_weather',
      description: 'Get current weather in a location',
      input_schema: {
        type: 'object',
        properties: {
          location: { type: 'string' }
        },
        required: ['location']
      }
    }
  ];

  // 第一轮：用户请求
  messages.push({ role: 'user', content: 'What is the weather in Paris?' });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      stream: true,
      tools: tools,
      messages: messages
    })
  });

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  let currentContentBlocks: any[] = [];
  let currentBlockIndex = -1;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;

      const data = line.slice(6).trim();
      if (!data || data === '[DONE]') continue;

      try {
        const event = JSON.parse(data);

        // 内容块开始
        if (event.type === 'content_block_start') {
          currentBlockIndex = event.index;
          currentContentBlocks[event.index] = event.content_block;

          if (event.content_block.type === 'tool_use') {
            console.log(`\n[Tool Use: ${event.content_block.name}]`);
          }
        }

        // 内容块增量
        if (event.type === 'content_block_delta') {
          const delta = event.delta;

          // 文本增量
          if (delta.type === 'text_delta') {
            process.stdout.write(delta.text);
          }

          // 工具输入 JSON 增量
          if (delta.type === 'input_json_delta') {
            if (!currentContentBlocks[event.index].input) {
              currentContentBlocks[event.index].input = '';
            }
            currentContentBlocks[event.index].input += delta.partial_json;
          }
        }

        // 消息停止
        if (event.type === 'message_stop') {
          console.log('\n');

          // 保存 assistant 响应
          messages.push({
            role: 'assistant',
            content: currentContentBlocks
          });

          // 检查是否需要调用工具
          const toolUse = currentContentBlocks.find(b => b.type === 'tool_use');
          if (toolUse) {
            // 解析完整的 JSON 输入
            toolUse.input = JSON.parse(toolUse.input);

            console.log(`Calling tool: ${toolUse.name} with input:`, toolUse.input);

            // 模拟工具调用
            const toolResult = JSON.stringify({
              location: toolUse.input.location,
              temperature: 18,
              condition: 'Cloudy'
            });

            // 添加工具结果
            messages.push({
              role: 'user',
              content: [{
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: toolResult
              }]
            });

            // 第二轮：获取最终响应（递归或继续流式处理）
            console.log('\n[Getting final response...]');
            // 这里可以递归调用或继续处理...
          }
        }
      } catch (e) {
        // 忽略解析错误
      }
    }
  }
}
```

### 流式输出的关键要点

1. **实时渲染**：流式输出允许立即显示响应，无需等待完整响应
2. **保存完整响应**：在多轮对话中，必须收集并保存完整的流式响应用于下一轮
3. **事件处理**：正确处理所有事件类型（message_start、content_block_delta 等）
4. **工具调用**：流式工具调用需要组装部分 JSON 输入
5. **错误处理**：使用 try-catch 处理 JSON 解析错误，某些事件可能不完整

### 错误恢复

- 可从最后成功接收的内容块恢复
- SDK 提供自动错误处理
- 建议使用官方 SDK（Python/TypeScript）

---

## Count Tokens API

### 概述

Count Tokens API 用于在不实际生成响应的情况下，计算消息的 token 数量，便于预估成本和管理配额。

**端点**: `POST https://api.anthropic.com/v1/messages/count_tokens`

**官方文档**: https://docs.anthropic.com/en/api/messages-count-tokens

### 请求参数

- `model` (必需): 模型名称
- `messages` (可选): 消息列表
- `system` (可选): 系统提示词
- `tools` (可选): 工具定义

### 示例请求

```bash
curl https://api.anthropic.com/v1/messages/count_tokens \
  --header "x-api-key: $ANTHROPIC_API_KEY" \
  --header "anthropic-version: 2023-06-01" \
  --header "content-type: application/json" \
  --data '{
    "model": "claude-sonnet-4-5-20250929",
    "messages": [
      {"role": "user", "content": "How many tokens is this?"}
    ]
  }'
```

### 响应格式

```json
{
  "input_tokens": 15
}
```

### 使用场景

- 预估 API 调用成本
- 管理上下文窗口
- 验证是否超出限制
- 优化提示长度

---

## 其他功能

### Message Batches（批处理）

批量异步处理消息，节省约 50% 成本。

**文档**: https://docs.anthropic.com/en/api/message-batches

```bash
curl https://api.anthropic.com/v1/messages/batches \
  --header "x-api-key: $ANTHROPIC_API_KEY" \
  --header "anthropic-version: 2023-06-01" \
  --header "content-type: application/json" \
  --data '{
    "requests": [
      {
        "custom_id": "req-1",
        "params": {
          "model": "claude-sonnet-4-5-20250929",
          "max_tokens": 1024,
          "messages": [{"role": "user", "content": "Hello"}]
        }
      }
    ]
  }'
```

### Vision（视觉）

支持图像输入（URL 或 Base64）。

```json
{
  "type": "image",
  "source": {
    "type": "url",
    "url": "https://example.com/image.jpg"
  }
}
```

### PDF Support（PDF 支持）

通过 Files API 上传和处理 PDF 文档。

**文档**: https://docs.anthropic.com/en/api/files

### Citations（引用）

通过提示设计让模型标注信息来源。

### Embeddings（嵌入）

将文本转换为向量用于检索和相似度计算。

### Models API

查询可用模型及其能力。

**文档**: https://docs.anthropic.com/en/api/models

---

## 总结

本文档涵盖了 Claude API 的核心功能：

1. **Messages API**: 基础对话接口
2. **Prompt Caching**: 降低成本和延迟
3. **Context Editing**: 自动管理上下文
4. **Extended Thinking**: 增强推理能力
5. **Streaming**: 实时响应传输
6. **Count Tokens**: Token 计数工具

建议根据具体需求选择合适的功能，并参考官方文档获取最新信息：

**官方文档**: https://docs.anthropic.com/
