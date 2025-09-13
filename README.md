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
- **智能缓存系统**：基于 Cloudflare KV 的分级缓存策略
- **多密钥负载均衡**：支持多个 API 密钥轮询和自动冷却
- **内存优化**：使用对象冻结和预分配减少内存开销
- **零编译部署**：原生 TypeScript 支持，无需构建步骤

### 🛡️ 安全与限流
- **分层速率限制**：突发/持续/每日三层限流机制
- **请求验证**：严格的参数校验和模型能力检查
- **CORS 支持**：可配置的跨域访问控制
- **错误处理**：完善的错误边界和友好的错误提示

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

4. **本地开发**
```bash
npm run dev
# 服务将在 http://localhost:8787 启动
```

5. **部署到 Cloudflare**
```bash
npm run deploy
```

## API 使用指南

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

### 多密钥支持

支持在单个请求中提供多个 API 密钥，系统会自动进行负载均衡：

```bash
# 使用逗号分隔多个密钥
curl -X POST https://your-worker.workers.dev/ \
  -H "x-api-key: KEY1,KEY2,KEY3"
```

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

## 高级功能

### 智能缓存策略

系统根据请求的 temperature 参数自动调整缓存时长：

- `temperature = 0`：缓存 24 小时（确定性输出）
- `temperature < 0.3`：缓存 1 小时（低随机性）
- `temperature < 0.7`：缓存 10 分钟（中等随机性）
- `temperature >= 0.7`：不缓存（高随机性）

流式请求和工具调用会自动跳过缓存。

### 速率限制规则

三层递进式限流保护：

1. **突发限制**：1 分钟内最多 10 个请求
2. **持续限制**：1 小时内最多 100 个请求
3. **每日限制**：24 小时内最多 1000 个请求

响应头中包含限流信息：
- `X-RateLimit-Limit`：当前限制数量
- `X-RateLimit-Remaining`：剩余请求次数
- `X-RateLimit-Reset`：限制重置时间

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

```
src/
├── worker.ts                 # Cloudflare Workers 入口
├── handler.ts                # 核心请求处理逻辑
├── models.ts                 # 模型映射配置
├── config.ts                 # 全局配置
├── cache.ts                  # 缓存管理器
├── limiter.ts                # 速率限制器
├── transformers/             # 格式转换器
│   ├── request.ts            # 请求转换
│   ├── response.ts           # 响应转换
│   ├── stream.ts             # 流式转换
│   ├── content.ts            # 内容转换
│   ├── tool.ts               # 工具调用转换
│   └── thinking.ts           # 思维链处理
└── types/                    # TypeScript 类型定义
    ├── claude.ts             # Claude API 类型
    ├── gemini.ts             # Gemini API 类型
    └── common.ts             # 通用类型

```

## 性能指标

经过优化后的性能表现：

- **请求延迟**：P50 < 100ms, P99 < 500ms
- **内存占用**：单请求 < 10MB
- **并发处理**：支持 1000+ QPS
- **缓存命中率**：> 30%（取决于使用模式）

## 开发与调试

### 本地开发
```bash
npm run dev           # 启动开发服务器
npm run typecheck     # TypeScript 类型检查
```

### 日志查看
```bash
wrangler tail         # 实时查看 Workers 日志
```

### 环境变量

可在 `wrangler.toml` 中配置：

```toml
[vars]
ALLOWED_ORIGINS = "https://example.com,https://app.example.com"
```

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
A: 支持文本对话、流式输出、工具调用、视觉理解等主要功能。部分 Claude 特有功能可能无法完全映射。

**Q: 如何处理 API 配额限制？**
A: 使用多密钥轮询、智能缓存和速率限制来优化 API 使用。

**Q: 可以自定义模型映射吗？**
A: 可以修改 `src/models.ts` 中的映射配置来支持更多模型。

## 许可证

ISC License

## 更新日志

### v1.0.0 (2025-09)
- 初始版本发布
- 完整的 Claude to Gemini API 转换
- 智能缓存和速率限制
- 多密钥负载均衡
- 流式响应支持