# Gemini API 使用指南

本文档提供 Gemini API 的简明使用指南和代码示例。完整的功能说明和原理解析请参见项目主文档 [README.md](../README.md)。

**官方文档**: https://ai.google.dev/gemini-api/docs

---

## 目录

- [文本生成](#文本生成)
- [思考功能 (Thinking)](#思考功能-thinking)
- [多模态理解](#多模态理解)
- [函数调用 (Function Calling)](#函数调用-function-calling)
- [Google 搜索集成](#google-搜索集成)
- [其他功能](#其他功能)

---

## 文本生成

### 基础文本生成

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d '{
    "contents": [{
      "parts": [{ "text": "How does AI work?" }]
    }]
  }'
```

```javascript
const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
  method: 'POST',
  headers: {
    'x-goog-api-key': process.env.GEMINI_API_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    contents: [{
      parts: [{ text: 'How does AI work?' }]
    }]
  })
});
const data = await response.json();
console.log(data.candidates[0].content.parts[0].text);
```

### 系统指令配置

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d '{
    "systemInstruction": {
      "parts": [{ "text": "You are a professional technical writer." }]
    },
    "contents": [{
      "parts": [{ "text": "Explain quantum computing" }]
    }],
    "generationConfig": {
      "temperature": 0.3,
      "maxOutputTokens": 200
    }
  }'
```

```javascript
const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', {
  method: 'POST',
  headers: {
    'x-goog-api-key': process.env.GEMINI_API_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    systemInstruction: {
      parts: [{ text: 'You are a professional technical writer.' }]
    },
    contents: [{
      parts: [{ text: 'Explain quantum computing' }]
    }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 200
    }
  })
});
```

### 多轮对话

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d '{
    "contents": [
      { "role": "user", "parts": [{ "text": "What is the capital of France?" }] },
      { "role": "model", "parts": [{ "text": "The capital of France is Paris." }] },
      { "role": "user", "parts": [{ "text": "What is its population?" }] }
    ]
  }'
```

```javascript
const messages = [
  { role: 'user', parts: [{ text: 'What is the capital of France?' }] },
  { role: 'model', parts: [{ text: 'The capital of France is Paris.' }] },
  { role: 'user', parts: [{ text: 'What is its population?' }] }
];

const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
  method: 'POST',
  headers: {
    'x-goog-api-key': process.env.GEMINI_API_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ contents: messages })
});
```

---

## 思考功能 (Thinking)

### 启用思维摘要

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d '{
    "contents": [{
      "parts": [{ "text": "Solve: 3x^2 + 5x - 2 = 0" }]
    }],
    "generationConfig": {
      "thinkingConfig": {
        "thinkingBudget": 2048,
        "includeThoughts": true
      }
    }
  }'
```

```javascript
const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent', {
  method: 'POST',
  headers: {
    'x-goog-api-key': process.env.GEMINI_API_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    contents: [{
      parts: [{ text: 'Solve: 3x^2 + 5x - 2 = 0' }]
    }],
    generationConfig: {
      thinkingConfig: {
        thinkingBudget: 2048,
        includeThoughts: true
      }
    }
  })
});

const data = await response.json();
const parts = data.candidates[0].content.parts;

// 分离推理和答案
parts.forEach(part => {
  if (part.thought === true) {
    console.log('💭 Thinking:', part.text);
  } else {
    console.log('📝 Answer:', part.text);
  }
});
```

###⚠️ `thoughtSignature` 的实际位置（重要！）

根据实际API响应，`thoughtSignature`的位置**比文档描述的更灵活**：

#### 实际响应示例（来自Pro模型真实日志）

```json
{
  "candidates": [{
    "content": {
      "parts": [
        {
          "text": "我将通过 `ls -R` 命令递归列出所有文件和目录，以探索项目结构。",
          "thoughtSignature": "Cv0BAdHtim/OJtdbQ3JJ0KpPab..."  // ← 与text在同一个part！
        },
        {
          "functionCall": {
            "name": "Bash",
            "args": { "command": "ls -R", "description": "列出目录..." }
          }
          // ← 这个part没有thoughtSignature
        }
      ]
    }
  }],
  "usageMetadata": {
    "promptTokenCount": 13533,
    "candidatesTokenCount": 52,
    "thoughtsTokenCount": 48  // ← 确认有思维消耗
  }
}
```

#### 关键发现

1. **`thoughtSignature`可以与`text`同级**
   - 不仅出现在`functionCall`的part中
   - 也可以出现在包含思维文本的part中

2. **该text没有`thought: true`标记**
   - 虽然这个text是思维过程
   - 但响应中没有显式的`thought`字段
   - **原因**：请求中**没有设置`includeThoughts: true`**
   - 通过`thoughtSignature`的存在可以判断这是思维part
   - 通过`usageMetadata.thoughtsTokenCount > 0`确认

**⚠️ 重要区别：`thoughtSignature` vs 思维内容**

| 项目 | `thoughtSignature` | 思维内容（thought text） |
|------|-------------------|------------------------|
| **用途** | 维护多轮推理上下文 | 展示推理过程给用户 |
| **返回条件** | Function calling启用时**总是返回** | `includeThoughts: true`时才返回 |
| **Pro模型** | ✅ 总是有（thinking不可关） | ⚠️ 需要显式设置 `includeThoughts: true` |
| **Flash模型** | ✅ thinking启用时有 | ⚠️ 需要显式设置 `includeThoughts: true` |
| **内容形式** | Base64加密字符串 | 可读文本 + `thought: true`标记 |
| **可见性** | 不可读（仅用于传递） | 可读文本 |

**示例对比**：

```javascript
// ❌ 错误理解：没有 thought: true 就没有thinking
// ✅ 正确理解：Pro模型总是thinking，但默认不显示内容

// 场景1：includeThoughts: false（默认）
{
  "parts": [
    {
      "text": "最终答案",
      "thoughtSignature": "Cv0BAdHt..."  // ← 签名存在，说明有thinking
    }
  ],
  "usageMetadata": {
    "thoughtsTokenCount": 48  // ← 消耗了thinking tokens
  }
}
// 没有 thought: true 标记
// 没有可读的思维文本
// 但确实进行了thinking（通过签名和token消耗证明）

// 场景2：includeThoughts: true
{
  "parts": [
    {
      "text": "让我分析...\n首先...\n然后...",
      "thought": true,  // ← 明确标记
      "thoughtSignature": "Cv0BAdHt..."
    },
    {
      "text": "最终答案"
    }
  ],
  "usageMetadata": {
    "thoughtsTokenCount": 156
  }
}
// 有 thought: true 标记
// 有可读的思维文本
// 有签名
```

3. **`thoughtSignature`的多种出现模式**：

**模式1：与思维文本同级**（最常见）
```json
{
  "text": "让我思考一下...",
  "thoughtSignature": "Abc123..."
}
```
→ **签名与正文文本一起返回**

**模式2：与functionCall同级**
```json
{
  "functionCall": {...},
  "thoughtSignature": "Xyz789..."
}
```
→ **签名与工具调用一起返回**

**模式3：与普通文本同级（无thought标记）**
```json
{
  "text": "我将通过 ls -R 命令...",
  "thoughtSignature": "Cv0BA..."
}
```
→ **签名与普通文本一起返回**（见req_mgtc6n9mesgsjue92a8日志）
→ 没有`thought: true`标记，但有签名和`thoughtsTokenCount`

**关键规则**：
- `thoughtSignature`**总是附加在某个part上**
- **与该part的内容同时返回**（text或functionCall）
- **标记推理过程结束**
- 在流式响应中，出现在最后一个thinking相关的part上

#### 处理建议

```javascript
// 正确的处理方式：检查每个part是否有thoughtSignature
function processResponse(response) {
  const parts = response.candidates[0].content.parts;
  const signatures = [];

  parts.forEach((part, index) => {
    // 检查是否有思维签名
    if (part.thoughtSignature) {
      signatures.push(part.thoughtSignature);
      console.log(`Part ${index} has signature (type: ${part.text ? 'text' : 'functionCall'})`);
    }

    // 根据thought字段或thoughtSignature存在性判断是否为思维
    const isThinking = part.thought === true || part.thoughtSignature;

    if (isThinking && part.text) {
      console.log('💭 Thinking:', part.text);
    } else if (part.text) {
      console.log('📝 Answer:', part.text);
    } else if (part.functionCall) {
      console.log('🔧 Tool Call:', part.functionCall.name);
    }
  });

  return signatures;
}
```

#### 判断思维过程的标准

1. ✅ **优先级1**：`part.thought === true` → 明确的思维标记
2. ✅ **优先级2**：`part.thoughtSignature`存在 → 该part是思维的一部分
3. ✅ **优先级3**：`usageMetadata.thoughtsTokenCount > 0` → 响应包含思维

#### 多轮对话中的处理

```javascript
// 保留完整的part结构，包括thoughtSignature
const conversationHistory = [];

// 添加模型响应到历史
conversationHistory.push({
  role: 'model',
  parts: response.candidates[0].content.parts  // ← 完整保留，包括所有thoughtSignature
});

// 下一轮请求
const nextResponse = await fetch(url, {
  method: 'POST',
  body: JSON.stringify({
    tools: [...],
    contents: conversationHistory,  // ← thoughtSignature会自动传递
    generationConfig: {...}
  })
});
```

### 流式Thinking响应（重要！）

当启用thinking且使用流式输出时，响应结构与非流式有显著差异：

#### 流式Thinking的特殊行为

**关键发现**（基于真实日志）：

1. **思维过程分块流式输出**
   - 每个流式块包含一段思维文本
   - 每块都有`thought: true`标记
   - `thoughtsTokenCount`**逐块递增**

2. **`thoughtSignature`出现时机**
   - ❌ **不在前期的thinking块中**
   - ✅ **只在最后一个thinking文本块出现**
   - ⚠️ **`thoughtSignature`的出现 = 推理过程结束**
   - 📌 **签名与内容同时返回**：签名附加在text或functionCall所在的part上
   - 这是判断thinking完成的**可靠信号**

3. **完整的流式响应示例**

```json
{
  "body": [
    // 第1块：thinking开始
    {
      "timestamp": 1760614914697,
      "data": {
        "candidates": [{
          "content": {
            "parts": [{
              "text": "**Deeply Considering Optimization**\n\nI'm currently focused...",
              "thought": true  // ← 有标记
              // ← 无thoughtSignature
            }]
          }
        }],
        "usageMetadata": {
          "thoughtsTokenCount": 68  // ← 初始值
        }
      }
    },

    // 第2块：thinking继续
    {
      "timestamp": 1760614916930,
      "data": {
        "candidates": [{
          "content": {
            "parts": [{
              "text": "**Initiating Code Exploration**\n\nI'm now fully immersed...",
              "thought": true
              // ← 仍无thoughtSignature
            }]
          }
        }],
        "usageMetadata": {
          "thoughtsTokenCount": 321  // ← 递增！
        }
      }
    },

    // ...更多thinking块（省略）...

    // 第8块：thinking结束，签名出现！
    {
      "timestamp": 1760614928118,
      "data": {
        "candidates": [{
          "content": {
            "parts": [{
              "text": "好的，我将开始分析您当前的项目...",
              "thoughtSignature": "CiUB0e2Kb2htW3SDOXTCLy4..."  // ← 首次出现！
            }]
          }
        }],
        "usageMetadata": {
          "thoughtsTokenCount": 1408  // ← 最终值
        }
      }
    },

    // 第9块：开始输出答案
    {
      "timestamp": 1760614928120,
      "data": {
        "candidates": [{
          "content": {
            "parts": [{
              "text": "创建一个任务列表来指导整个分析和报告过程。"
              // ← 无thought标记，无签名
            }]
          }
        }],
        "usageMetadata": {
          "thoughtsTokenCount": 1408  // ← 保持不变
        }
      }
    },

    // 第10块：工具调用
    {
      "timestamp": 1760614928878,
      "data": {
        "candidates": [{
          "content": {
            "parts": [{
              "functionCall": {
                "name": "TodoWrite",
                "args": {...}
              }
              // ← 无thoughtSignature
            }]
          }
        }],
        "usageMetadata": {
          "thoughtsTokenCount": 1408
        }
      }
    }
  ]
}
```

#### 流式Thinking处理建议

```javascript
// 处理流式thinking响应
async function handleStreamingThinking(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let thinkingContent = '';
  let answerContent = '';
  let thoughtSignature = null;
  let isThinkingPhase = true;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const data = JSON.parse(chunk);

    const parts = data.candidates[0].content.parts;

    parts.forEach(part => {
      if (part.thought === true) {
        // 这是thinking内容
        console.log('💭 Thinking:', part.text);
        thinkingContent += part.text + '\n';

        // 检查签名（只在最后一块出现）
        if (part.thoughtSignature) {
          thoughtSignature = part.thoughtSignature;
          console.log('✅ Got thought signature - Thinking phase completed!');
          isThinkingPhase = false;  // ← 推理结束的信号！
        }
      } else if (part.text) {
        // 这是答案内容
        console.log('📝 Answer:', part.text);
        answerContent += part.text;
      } else if (part.functionCall) {
        // 工具调用
        console.log('🔧 Tool Call:', part.functionCall.name);
      }
    });

    // 监控thinking token增长
    const thinkingTokens = data.usageMetadata.thoughtsTokenCount;
    console.log(`Thinking tokens: ${thinkingTokens}`);
  }

  return {
    thinking: thinkingContent,
    answer: answerContent,
    signature: thoughtSignature  // 用于下一轮对话
  };
}
```

#### 关键要点

| 特性 | 流式Thinking | 非流式Thinking |
|------|-------------|---------------|
| **thinking输出** | 分块增量输出 | 一次性输出 |
| **thought标记** | 每个thinking块都有 | 整个thinking part有 |
| **thoughtSignature** | 只在**最后一块**出现 | 在thinking part出现 |
| **签名的含义** | **推理结束信号** | **推理结束信号** |
| **thoughtsTokenCount** | **逐块递增** | 固定值 |
| **签名位置** | 最后的thinking文本块 | thinking part或functionCall part |

**🔑 核心规则**：`thoughtSignature`的出现 = 推理过程完全结束

- ✅ 可以作为状态切换的触发器
- ✅ 之后的内容是答案或工具调用
- ✅ `thoughtsTokenCount`不再增长
- ✅ 可以安全地保存签名用于下一轮对话

**实用示例：基于签名的状态管理**

```javascript
class ThinkingStreamProcessor {
  constructor() {
    this.state = 'THINKING';  // THINKING -> ANSWERING -> TOOL_CALLING
    this.thinkingContent = '';
    this.answerContent = '';
    this.thoughtSignature = null;
  }

  processChunk(data) {
    const parts = data.candidates[0].content.parts;

    parts.forEach(part => {
      // 检测推理结束信号
      if (part.thoughtSignature && this.state === 'THINKING') {
        this.thoughtSignature = part.thoughtSignature;
        this.state = 'ANSWERING';  // ← 状态切换！
        console.log('🎯 State: THINKING → ANSWERING');
        this.onThinkingComplete(this.thinkingContent, this.thoughtSignature);
      }

      // 根据当前状态处理内容
      if (this.state === 'THINKING' && part.thought === true) {
        this.thinkingContent += part.text;
        this.onThinkingChunk(part.text);
      } else if (this.state === 'ANSWERING' && part.text) {
        this.answerContent += part.text;
        this.onAnswerChunk(part.text);
      } else if (part.functionCall) {
        this.state = 'TOOL_CALLING';
        console.log('🎯 State: ANSWERING → TOOL_CALLING');
        this.onToolCall(part.functionCall);
      }
    });
  }

  // 回调函数（由用户实现）
  onThinkingChunk(text) {
    console.log('💭', text);
  }

  onThinkingComplete(fullThinking, signature) {
    console.log('✅ Thinking completed');
    console.log('📝 Full thinking:', fullThinking);
    console.log('🔐 Signature:', signature.substring(0, 20) + '...');
  }

  onAnswerChunk(text) {
    console.log('📝', text);
  }

  onToolCall(functionCall) {
    console.log('🔧 Tool:', functionCall.name);
  }
}

// 使用示例
const processor = new ThinkingStreamProcessor();

// 处理流式响应
for await (const chunk of streamResponse) {
  processor.processChunk(chunk);
}

// 访问最终结果和签名
const signature = processor.thoughtSignature;  // 用于下一轮对话
```

#### 流式vs非流式对比

**非流式**：
```json
{
  "parts": [
    {
      "text": "完整的思维过程...",
      "thought": true,
      "thoughtSignature": "..."
    },
    {
      "text": "最终答案"
    }
  ]
}
```

**流式**：
```json
// 多个响应块
[
  { "parts": [{ "text": "思维片段1", "thought": true }] },
  { "parts": [{ "text": "思维片段2", "thought": true }] },
  { "parts": [{ "text": "思维片段N", "thoughtSignature": "..." }] },  // ← 最后一块
  { "parts": [{ "text": "答案" }] }
]
```

### 禁用思维（仅 Flash 支持）

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d '{
    "contents": [{
      "parts": [{ "text": "How does AI work?" }]
    }],
    "generationConfig": {
      "thinkingConfig": {
        "thinkingBudget": 0
      }
    }
  }'
```

```javascript
// Flash 模型可以关闭 thinking 以降低成本
const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
  method: 'POST',
  headers: {
    'x-goog-api-key': process.env.GEMINI_API_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    contents: [{ parts: [{ text: 'How does AI work?' }] }],
    generationConfig: {
      thinkingConfig: { thinkingBudget: 0 }  // 关闭 thinking
    }
  })
});
```

---

## 多模态理解

### 图像理解

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d '{
    "contents": [{
      "parts": [
        { "inlineData": { "mimeType": "image/jpeg", "data": "/9j/4AAQSkZJRg..." } },
        { "text": "What objects are in this image?" }
      ]
    }]
  }'
```

```javascript
const imageBase64 = '/9j/4AAQSkZJRg...';  // Base64 编码的图像数据

const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
  method: 'POST',
  headers: {
    'x-goog-api-key': process.env.GEMINI_API_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    contents: [{
      parts: [
        { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } },
        { text: 'What objects are in this image?' }
      ]
    }]
  })
});
```

### 结构化输出

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d '{
    "contents": [{
      "role": "user",
      "parts": [{ "text": "提取人名和公司名：张三入职字节跳动成为算法工程师。" }]
    }],
    "generationConfig": {
      "responseMimeType": "application/json",
      "responseSchema": {
        "type": "object",
        "properties": {
          "persons": { "type": "array", "items": { "type": "string" } },
          "companies": { "type": "array", "items": { "type": "string" } }
        },
        "required": ["persons", "companies"]
      }
    }
  }'
```

```javascript
const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
  method: 'POST',
  headers: {
    'x-goog-api-key': process.env.GEMINI_API_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    contents: [{
      role: 'user',
      parts: [{ text: '提取人名和公司名：张三入职字节跳动成为算法工程师。' }]
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: {
          persons: { type: 'array', items: { type: 'string' } },
          companies: { type: 'array', items: { type: 'string' } }
        },
        required: ['persons', 'companies']
      }
    }
  })
});

const result = await response.json();
const data = JSON.parse(result.candidates[0].content.parts[0].text);
console.log(data);  // { persons: ["张三"], companies: ["字节跳动"] }
```

---

## 函数调用 (Function Calling)

### 基础工具调用

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d '{
    "tools": [{
      "functionDeclarations": [{
        "name": "get_weather",
        "description": "查询城市天气",
        "parameters": {
          "type": "object",
          "properties": { "city": { "type": "string" } },
          "required": ["city"]
        }
      }]
    }],
    "contents": [{ "parts": [{ "text": "帮我查下上海的天气" }] }]
  }'
```

```javascript
// 第一轮：模型请求调用工具
const tools = [{
  functionDeclarations: [{
    name: 'get_weather',
    description: '查询城市天气',
    parameters: {
      type: 'object',
      properties: { city: { type: 'string' } },
      required: ['city']
    }
  }]
}];

let response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
  method: 'POST',
  headers: {
    'x-goog-api-key': process.env.GEMINI_API_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    tools: tools,
    contents: [{ parts: [{ text: '帮我查下上海的天气' }] }]
  })
});

let data = await response.json();
const functionCall = data.candidates[0].content.parts[0].functionCall;
console.log('Tool Call:', functionCall);
// { name: "get_weather", args: { city: "上海" } }

// 执行工具并返回结果
const weatherResult = { temp: 28, condition: '多云' };

// 第二轮：回传工具结果
response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
  method: 'POST',
  headers: {
    'x-goog-api-key': process.env.GEMINI_API_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    tools: tools,
    contents: [
      { parts: [{ text: '帮我查下上海的天气' }] },
      { role: 'model', parts: [{ functionCall: functionCall }] },
      { role: 'function', parts: [{ functionResponse: { name: 'get_weather', response: weatherResult } }] }
    ]
  })
});

data = await response.json();
console.log(data.candidates[0].content.parts[0].text);
// "上海当前天气为多云，温度28°C。"
```

### 并行函数调用

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d '{
    "tools": [{
      "functionDeclarations": [
        {
          "name": "get_weather",
          "description": "查询城市天气",
          "parameters": { "type": "object", "properties": { "city": { "type": "string" } } }
        },
        {
          "name": "get_exchange_rate",
          "description": "查询汇率",
          "parameters": { "type": "object", "properties": { "from": { "type": "string" }, "to": { "type": "string" } } }
        }
      ]
    }],
    "contents": [{ "parts": [{ "text": "上海天气如何？美元兑人民币汇率是多少？" }] }]
  }'
```

```javascript
const tools = [{
  functionDeclarations: [
    { name: 'get_weather', description: '查询城市天气', parameters: { /* ... */ } },
    { name: 'get_exchange_rate', description: '查询汇率', parameters: { /* ... */ } }
  ]
}];

const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent', {
  method: 'POST',
  headers: {
    'x-goog-api-key': process.env.GEMINI_API_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    tools: tools,
    contents: [{ parts: [{ text: '上海天气如何？美元兑人民币汇率是多少？' }] }]
  })
});

const data = await response.json();
const functionCalls = data.candidates[0].content.parts
  .filter(p => p.functionCall)
  .map(p => p.functionCall);

console.log('Parallel calls:', functionCalls);
// [
//   { name: "get_weather", args: { city: "上海" } },
//   { name: "get_exchange_rate", args: { from: "USD", to: "CNY" } }
// ]
```

---

## Google 搜索集成

### 基础搜索

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d '{
    "tools": [{ "googleSearch": {} }],
    "contents": [{ "parts": [{ "text": "Who won Euro 2024?" }] }]
  }'
```

```javascript
const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
  method: 'POST',
  headers: {
    'x-goog-api-key': process.env.GEMINI_API_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    tools: [{ googleSearch: {} }],
    contents: [{ parts: [{ text: 'Who won Euro 2024?' }] }]
  })
});

const data = await response.json();
console.log('Answer:', data.candidates[0].content.parts[0].text);
console.log('Sources:', data.candidates[0].groundingMetadata.groundingChunks);
```

---

## 其他功能

### Token 计数

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:countTokens" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d '{
    "contents": [{ "parts": [{ "text": "简述Transformer的自注意力机制。" }] }]
  }'
```

```javascript
const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:countTokens', {
  method: 'POST',
  headers: {
    'x-goog-api-key': process.env.GEMINI_API_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    contents: [{ parts: [{ text: '简述Transformer的自注意力机制。' }] }]
  })
});

const data = await response.json();
console.log('Total tokens:', data.totalTokens);
```

### 批处理模式

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:batchGenerateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d '{
    "batch": {
      "display_name": "my-batch",
      "input_config": {
        "requests": {
          "requests": [
            {
              "request": { "contents": [{ "parts": [{ "text": "Describe photosynthesis." }] }] },
              "metadata": { "key": "request-1" }
            },
            {
              "request": { "contents": [{ "parts": [{ "text": "Why is the sky blue?" }] }] },
              "metadata": { "key": "request-2" }
            }
          ]
        }
      }
    }
  }'
```

```javascript
const batchResponse = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:batchGenerateContent', {
  method: 'POST',
  headers: {
    'x-goog-api-key': process.env.GEMINI_API_KEY,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    batch: {
      display_name: 'my-batch',
      input_config: {
        requests: {
          requests: [
            {
              request: { contents: [{ parts: [{ text: 'Describe photosynthesis.' }] }] },
              metadata: { key: 'request-1' }
            },
            {
              request: { contents: [{ parts: [{ text: 'Why is the sky blue?' }] }] },
              metadata: { key: 'request-2' }
            }
          ]
        }
      }
    }
  })
});

const batchData = await batchResponse.json();
const batchName = batchData.name;  // batches/123456

// 轮询作业状态
const statusResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/${batchName}`, {
  headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY }
});

const statusData = await statusResponse.json();
console.log('Batch state:', statusData.metadata.state);
```

---

## 完整功能列表

本文档仅展示常用功能的示例。Gemini API 还支持以下功能：

- **图像生成**: 根据文本提示生成图像
- **语音生成**: 文本转语音 (TTS)
- **长上下文处理**: 百万级 token 处理
- **文档理解**: PDF、Word、PPT 等文档解析
- **视频理解**: 视频摘要和场景分析
- **音频理解**: 语音识别和情感分析
- **代码执行**: 沙箱中执行代码
- **上下文缓存**: 减少 token 消耗

详细说明和原理请参考：
- 项目主文档: [README.md](../README.md)
- 官方文档: https://ai.google.dev/gemini-api/docs

---

**最后更新**: 2025年1月
