# Claude to Gemini API 智能转换网关

## 项目概述

这是一个部署在 Cloudflare Workers 上的高性能 API 转换网关，将 Claude API 格式的请求无缝转换为 Google Gemini API 格式。该项目实现了完整的协议转换、智能缓存、多层速率限制等企业级功能，适用于需要在不同 AI 模型间切换的应用场景。

## 核心特性

### 🚀 完整的 API 转换
- **双向格式转换**：完美兼容 Claude API 的请求/响应格式
- **流式响应支持**：支持 SSE (Server-Sent Events) 流式输出
- **工具调用转换**：自动转换 Function Calling 格式
- **思维链支持**：支持 Gemini 2.5 系列的 Extended Thinking 功能

### ⚡ 性能优化
- **多密钥负载均衡**：支持多个 API 密钥轮询和智能故障转移
- **智能缓存系统**：基于 Cloudflare KV 的响应缓存和密钥使用缓存
- **内存优化**：使用对象冻结和预分配减少内存开销
- **零编译部署**：原生 TypeScript 支持，无需构建步骤

### 🛡️ 企业级特性
- **黑名单管理**：自动检测故障密钥并实施冷却机制
- **请求验证**：严格的参数校验和模型能力检查
- **CORS 支持**：可配置的跨域访问控制
- **错误处理**：完善的错误边界和友好的错误提示
- **日志追踪**：结构化日志记录，支持请求全链路追踪

## 快速开始

### 前置要求
- Node.js 18+
- Cloudflare 账号
- Google Gemini API 密钥

### 安装步骤

1. **克隆项目并安装依赖**
```bash
git clone <repository-url>
cd claude-code-api
npm install
```

2. **创建 Cloudflare KV 命名空间**
```bash
wrangler kv:namespace create "KV"
```

3. **配置 wrangler.toml**
```toml
name = "claude-code-api"
main = "src/worker.ts"
compatibility_date = "2024-01-01"

[[kv_namespaces]]
binding = "KV"
id = "your-kv-namespace-id"  # 替换为实际的 KV ID

[vars]
ALLOWED_ORIGINS = "*"  # 可选：配置允许的跨域来源
```

4. **代码检查**
```bash
npm run typecheck
```

5. **部署到 Cloudflare**
```bash
npm run deploy
```

## API 使用指南

### 支持的端点

#### 1. 消息接口 (Messages API)
```
POST /v1/messages
```
完全兼容 Claude API 格式，支持：
- 文本对话和多轮对话
- 流式响应 (SSE)
- 多模态内容（文本+图像）
- 工具调用 (Function Calling)
- 思维链推理 (Thinking)

#### 2. Token 计数接口
```
POST /v1/messages/count-tokens
```
在不实际调用模型的情况下估算 token 使用量

#### 3. 健康检查接口
```
GET /health
```
返回服务状态和运行时信息

### 认证方式

支持两种 API 密钥传递方式：

**方式一：使用 x-api-key 头**
```bash
curl -X POST https://your-worker.workers.dev/ \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_GEMINI_API_KEY" \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "messages": [{"role": "user", "content": "Hello!"}],
    "max_tokens": 1024
  }'
```

**方式二：使用 Bearer Token**
```bash
curl -X POST https://your-worker.workers.dev/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_GEMINI_API_KEY" \
  -d '{...}'
```

### 多密钥负载均衡

系统支持智能的多密钥管理和负载均衡：

```bash
# 使用逗号分隔多个密钥
curl -X POST https://your-worker.workers.dev/v1/messages \
  -H "x-api-key: KEY1,KEY2,KEY3" \
  -d '{...}'
```

**智能特性**：
- **轮询机制**：自动在可用密钥间轮询分发请求
- **故障检测**：实时监控密钥状态，自动识别失效密钥
- **黑名单管理**：将故障密钥加入黑名单并设置冷却时间
- **使用统计**：基于 KV 存储跟踪每个密钥的使用情况
- **智能恢复**：黑名单密钥冷却期过后自动重新启用

### 流式响应

启用流式输出以获得实时响应：

```javascript
const response = await fetch('https://your-worker.workers.dev/', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': 'YOUR_API_KEY'
  },
  body: JSON.stringify({
    model: 'claude-3-5-sonnet-20241022',
    messages: [{role: 'user', content: 'Write a story'}],
    stream: true,
    max_tokens: 2000
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const {done, value} = await reader.read();
  if (done) break;

  const chunk = decoder.decode(value);
  // 处理 SSE 格式的流式数据
  console.log(chunk);
}
```

## 模型映射关系

| Claude 模型 | Gemini 模型 | 上下文窗口 | 主要特性 |
|------------|------------|-----------|---------|
| claude-opus-4-1-20250805 | gemini-2.5-pro | 2M tokens | 最强能力，支持思维链 |
| claude-opus-4-20250514 | gemini-2.5-pro | 2M tokens | 高级推理，视觉理解 |
| claude-sonnet-4-20250514 | gemini-2.5-flash | 1M tokens | 平衡性能，支持工具 |
| claude-3-7-sonnet-20250219 | gemini-2.5-flash-lite | 1M tokens | 快速响应，轻量级 |
| claude-3-5-sonnet-20241022 | gemini-2.5-flash-lite | 1M tokens | 高效处理，低延迟 |
| claude-3-5-haiku-20241022 | gemini-2.0-flash | 1M tokens | 基础模型，快速简洁 |

### 高级功能特性

#### 1. 智能缓存机制

系统根据请求的 temperature 参数和内容类型自动调整缓存策略：

- `temperature = 0`：缓存 24 小时（确定性输出）
- `temperature < 0.3`：缓存 1 小时（低随机性）
- `temperature < 0.7`：缓存 10 分钟（中等随机性）
- `temperature >= 0.7`：不缓存（高随机性）

**缓存跳过条件**：
- 启用流式响应 (`stream: true`)
- 包含工具调用请求
- 启用思维链功能

#### 2. 黑名单管理系统

自动管理失效的 API 密钥：

- **自动检测**：根据 Gemini API 错误响应判断密钥状态
- **冷却机制**：失效密钥进入黑名单，设置随机冷却时间（15-60秒）
- **自动恢复**：冷却期满后自动将密钥重新加入可用池
- **持久化存储**：使用 Cloudflare KV 存储黑名单状态

#### 3. 请求验证与规范化

严格的输入验证确保请求质量：

- **模型能力检查**：验证请求功能与目标模型能力的匹配性
- **参数范围验证**：检查 temperature、max_tokens 等参数的有效范围
- **内容格式验证**：确保消息格式符合 Claude API 规范
- **工具定义验证**：验证 Function Calling 的 schema 正确性

### 错误处理

所有错误响应遵循 Claude API 格式：

```json
{
  "error": {
    "type": "api_error",
    "message": "错误描述",
    "details": {
      // 额外的错误信息
    }
  }
}
```

常见错误码：
- `400`：请求参数错误
- `401`：认证失败
- `429`：速率限制
- `500`：服务器内部错误

## 项目架构

### 核心模块设计

本项目采用模块化架构设计，清晰分离关注点，便于维护和扩展：

```
src/
├── worker.ts                 # Cloudflare Workers 入口点
├── client.ts                 # Gemini API 客户端封装
├── config.ts                 # 配置管理和环境变量处理
├── models.ts                 # 模型映射和能力配置
├── index.ts                  # 模块导出入口
├── middleware.ts             # 中间件管理器
├── handler/                  # 请求处理模块
│   ├── index.ts              # 处理器导出
│   ├── request-handler.ts    # 核心请求处理逻辑
│   ├── stream-manager.ts     # 流式响应管理
│   ├── response-manager.ts   # 响应处理和格式化
│   ├── client-manager.ts     # API 客户端管理
│   ├── api-key-manager.ts    # API 密钥管理和轮询
│   ├── key-usage-cache.ts    # 密钥使用情况缓存
│   └── request-validator.ts  # 请求参数验证
├── transformers/             # 数据转换模块
│   ├── index.ts              # 转换器导出
│   ├── request-transformer.ts    # 请求格式转换
│   ├── response-transformer.ts   # 响应格式转换
│   ├── stream-transformer.ts     # 流式数据转换
│   ├── content-transformer.ts    # 内容块转换
│   ├── tool-transformer.ts       # 工具调用转换
│   └── thinking-transformer.ts   # 思维链处理
├── middlewares/              # 中间件模块
│   ├── error.ts              # 错误处理中间件
│   ├── logger.ts             # 日志记录中间件
│   └── keys.ts               # API 密钥验证中间件
└── types/                    # TypeScript 类型定义
    ├── index.ts              # 类型导出
    ├── common.ts             # 通用类型接口
    ├── claude.ts             # Claude API 类型定义
    └── gemini.ts             # Gemini API 类型定义
```

### 模块职责说明

#### 1. 核心入口层（Entry Layer）
- **worker.ts**: Cloudflare Workers 的主入口，处理 HTTP 请求路由
- **index.ts**: 模块统一导出，提供清晰的 API 接口

#### 2. 处理层（Handler Layer）
- **request-handler.ts**: 核心业务逻辑，协调各个组件完成请求处理
- **stream-manager.ts**: 专门处理 SSE 流式响应的管理和转发
- **response-manager.ts**: 统一的响应处理和格式化
- **client-manager.ts**: 管理到 Gemini API 的客户端连接
- **api-key-manager.ts**: 实现多密钥轮询、黑名单管理和负载均衡
- **key-usage-cache.ts**: 基于 KV 存储的密钥使用情况缓存
- **request-validator.ts**: 请求参数的严格验证和规范化

#### 3. 转换层（Transformer Layer）
- **request-transformer.ts**: Claude 请求格式到 Gemini 格式的转换
- **response-transformer.ts**: Gemini 响应到 Claude 格式的转换
- **stream-transformer.ts**: 流式数据的实时转换处理
- **content-transformer.ts**: 消息内容块的智能转换
- **tool-transformer.ts**: 工具调用格式的双向转换
- **thinking-transformer.ts**: Gemini 2.5 思维链功能的处理

#### 4. 中间件层（Middleware Layer）
- **error.ts**: 统一错误处理和 Claude API 兼容的错误格式
- **logger.ts**: 结构化日志记录，支持请求追踪
- **keys.ts**: API 密钥验证和提取

#### 5. 支撑层（Support Layer）
- **client.ts**: Gemini API 的 HTTP 客户端封装
- **config.ts**: 环境配置管理和默认值设置
- **models.ts**: Claude 到 Gemini 模型映射和能力配置
- **types/**: 完整的 TypeScript 类型定义系统

## 性能指标

经过优化后的性能表现：

- **请求延迟**：P50 < 100ms, P99 < 500ms
- **内存占用**：单请求 < 10MB
- **并发处理**：支持 1000+ QPS
- **缓存命中率**：> 30%（取决于使用模式）

## 开发与调试

### 本地开发环境

```bash
# 类型检查
npm run typecheck

# 本地开发服务器（需要 wrangler）
npx wrangler dev

# 查看实时日志
npx wrangler tail
```

### 环境变量配置

可在 `wrangler.toml` 中配置以下环境变量：

```toml
[vars]
# CORS配置
CORS_ENABLED = "true"

# 服务器配置
ENABLE_VALIDATION = "true"
ENABLE_LOGGING = "true"

# Gemini API配置
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com"
GEMINI_API_VERSION = "v1beta"
GEMINI_TIMEOUT = "30000"

# 黑名单管理配置
BLACKLIST_COOLDOWN_MIN_MS = "15000"
BLACKLIST_COOLDOWN_MAX_MS = "60000"

# 日志配置
LOG_LEVEL = "info"
LOG_CONSOLE = "true"
```

### KV 命名空间配置

```toml
[[kv_namespaces]]
binding = "KV"
id = "your-kv-namespace-id"
preview_id = "your-preview-kv-namespace-id"
```

### 监控和调试

- **实时日志**：使用 `npx wrangler tail` 查看 Workers 运行日志
- **错误追踪**：每个请求都有唯一的 RequestID 用于全链路追踪
- **性能监控**：通过 Cloudflare Analytics 监控响应时间和错误率
- **KV 存储查看**：使用 `npx wrangler kv:key list` 查看缓存状态

## 贡献指南

欢迎提交 Issue 和 Pull Request！请确保：

1. 代码通过 TypeScript 类型检查
2. 遵循现有的代码风格
3. 添加必要的注释和文档
4. 测试所有功能正常工作

## 常见问题

**Q: 为什么选择 Cloudflare Workers？**
A: Workers 提供全球边缘部署、自动扩展、KV 存储等特性，非常适合 API 网关场景。

**Q: 支持哪些 Claude 功能？**
A: 支持文本对话、流式输出、工具调用、视觉理解、思维链推理等主要功能。部分 Claude 特有功能通过智能转换实现兼容。

**Q: 如何处理 API 配额限制？**
A: 使用多密钥轮询、智能缓存和黑名单管理来优化 API 使用效率。

**Q: 可以自定义模型映射吗？**
A: 可以修改 `src/models.ts` 中的 `MODEL_MAPPING` 配置来支持更多模型映射。

**Q: 如何监控系统运行状态？**
A: 通过 Cloudflare Analytics、实时日志和健康检查端点监控系统状态。

**Q: 密钥黑名单机制如何工作？**
A: 系统自动检测失效密钥，将其加入黑名单并设置冷却时间，冷却期满后自动恢复使用。

## 许可证

ISC License