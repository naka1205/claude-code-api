# Claude to Gemini API 转换网关

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9+-blue.svg)](https://www.typescriptlang.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange.svg)](https://workers.cloudflare.com/)
[![License: ISC](https://img.shields.io/badge/License-ISC-green.svg)](https://opensource.org/licenses/ISC)

## 项目概述

部署在 Cloudflare Workers 上的 API 转换网关，将 Claude API 格式的请求转换为 Google Gemini API 格式。服务端不存储任何 API 密钥，仅做数据转换，密钥由客户端在每次请求中提供。

针对 **Claude Code 官方客户端**进行了优化，支持工具调用、思维推理、流式输出等核心功能。

## 快速开始

### 前置要求
- Node.js 18+
- Cloudflare 账号
- Google Gemini API 密钥

### 安装与部署

```bash
git clone <repository-url>
cd claude-code-api
npm install
npm run typecheck  # TypeScript 类型检查
npm run deploy     # 部署到 Cloudflare
```

### Claude Code 客户端使用

```bash
export ANTHROPIC_API_URL="https://your-worker.workers.dev"
export ANTHROPIC_API_KEY="your-gemini-api-key"
```

## API 使用指南

### 支持的端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/v1/messages` | 消息接口，兼容 Claude API 格式 |
| POST | `/v1/messages/count_tokens` | Token 计数 |
| GET | `/health` | 健康检查 |
| GET | `/logs` | 请求日志查询（支持 `limit`、`offset`、`hasError`、`isStream` 参数） |
| GET | `/logs/:id` | 查看指定请求日志 |
| DELETE | `/logs` | 清除所有日志 |

### 认证方式

API 密钥由客户端提供，支持两种方式：

**方式一：x-api-key 头（推荐）**
```bash
curl -X POST https://your-worker.workers.dev/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_GEMINI_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-sonnet-4-6",
    "messages": [{"role": "user", "content": "Hello!"}],
    "max_tokens": 1024
  }'
```

**方式二：Bearer Token**
```bash
curl -X POST https://your-worker.workers.dev/v1/messages \
  -H "Authorization: Bearer YOUR_GEMINI_API_KEY" \
  -d '{...}'
```

### 多密钥负载均衡

支持逗号分隔传递多个密钥，系统自动选择使用量最低的可用密钥：

```bash
-H "x-api-key: KEY1,KEY2,KEY3"
```

- 自动跟踪每个密钥的使用次数和错误状态（内存中）
- 429 错误：密钥进入 5 分钟冷却
- 503 错误：密钥进入 30 秒冷却
- 其他错误：密钥进入 1 分钟冷却
- 冷却期满后自动恢复使用

## 模型映射关系

| Claude 模型 | Gemini 模型 | 上下文窗口 | 免费 RPM |
|------------|------------|-----------|----------|
| `claude-opus-4-6` / `claude-opus-4-1` / `claude-opus-4-20250514` | `gemini-3.1-pro-preview` | 2M tokens | 5 |
| `claude-sonnet-4-6` / `claude-sonnet-4-5` / `claude-sonnet-4-20250514` / `claude-3-7-sonnet-20250219` / `claude-3-5-sonnet-20241022` | `gemini-3-flash-preview` | 1M tokens | 10 |
| `claude-haiku-4-5` / `claude-3-5-haiku-20241022` | `gemini-3.1-flash-lite-preview` | 1M tokens | 15 |

> 完整映射含日期后缀版本，详见 `src/models.ts`

## 功能支持

| 功能特性 | 支持状态 | 说明 |
|---------|---------|------|
| Messages API | ✅ | 包括所有请求/响应格式 |
| 流式响应 (SSE) | ✅ | 实时流式输出 |
| 工具调用 (Tools) | ✅ | Function Calling 双向转换 |
| 思维推理 (Thinking) | ✅ | Extended Thinking 完整支持，含 Thought Signature 多轮传递 |
| 多模态内容 | ✅ | 文本 + 图像 + 文档 |
| Token 计数 | ✅ | 计数端点 |
| WebSearch | ✅ | 转换为 Gemini google_search |
| Beta 功能 | 🟡 | 透明传递大部分 beta 模块 |

### Beta 模块兼容性

| Beta 模块 | 状态 | 处理方式 |
|----------|------|---------|
| `claude-code-20250219` | ✅ | Claude Code 客户端支持 |
| `interleaved-thinking-2025-05-14` | ✅ | 思维推理完整转换 |
| `redact-thinking-2026-02-12` | ✅ | 思维签名正确传递，支持多轮工具调用 |
| `fine-grained-tool-streaming-2025-05-14` | ✅ | 工具调用流式输出 |
| `token-efficient-tools-2025-02-19` | ✅ | 透明兼容 |
| `output-128k-2025-02-19` | ✅ | 长输出支持 |
| `computer-use-*` | ❌ | Gemini 无对应功能 |

## 项目架构

```
src/
├── worker.ts                    # Cloudflare Workers 入口，路由分发
├── client.ts                    # Gemini API HTTP 客户端
├── config.ts                    # 配置管理，环境变量加载
├── models.ts                    # Claude→Gemini 模型映射
├── handler/
│   ├── request-handler.ts       # 核心请求处理，协调各组件
│   ├── stream-manager.ts        # SSE 流式响应管理
│   ├── response-manager.ts      # 非流式响应处理
│   ├── client-manager.ts        # API 客户端生命周期
│   ├── api-key-manager.ts       # 从请求头提取 API 密钥
│   ├── key-usage-cache.ts       # 密钥使用统计（内存缓存）
│   └── request-validator.ts     # 请求参数验证
├── transformers/
│   ├── request-transformer.ts   # Claude→Gemini 请求转换
│   ├── response-transformer.ts  # Gemini→Claude 响应转换
│   ├── stream-transformer.ts    # 流式数据转换
│   ├── content-transformer.ts   # 内容块类型转换
│   ├── tool-transformer.ts      # 工具调用格式转换
│   ├── thinking-transformer.ts  # 思维链配置转换
│   └── count-tokens-transformer.ts # Token 计数转换
├── types/
│   ├── claude.ts                # Claude API 类型定义
│   ├── gemini.ts                # Gemini API 类型定义
│   └── common.ts                # 通用类型
└── utils/
    ├── constants.ts             # 常量定义
    ├── common.ts                # 通用工具函数
    ├── cors.ts                  # CORS 处理
    ├── response.ts              # 错误响应工具
    └── logger.ts                # 请求日志（内存存储）
```

### 请求处理流程

```
客户端请求 (Claude 格式)
  → worker.ts 路由分发
  → ApiKeyManager 从请求头提取 Gemini API Key
  → RequestValidator 校验请求格式
  → KeyUsageCache 从多个 key 中选择最优
  → RequestTransformer 转换请求 (模型映射、内容/工具/thinking 转换)
  → GeminiApiClient 调用 Gemini API
  → ResponseTransformer / StreamTransformer 转换响应
  → 返回客户端 (Claude 格式)
```

## 环境变量配置

以下环境变量均为可选，可在 `wrangler.toml` 的 `[vars]` 中配置：

```toml
[vars]
CORS_ENABLED = "true"
ENABLE_VALIDATION = "true"
GEMINI_BASE_URL = "https://generativelanguage.googleapis.com"
GEMINI_API_VERSION = "v1beta"
GEMINI_TIMEOUT = "120000"
SERVER_TIMEOUT = "120000"
BLACKLIST_COOLDOWN_MIN_MS = "15000"
BLACKLIST_COOLDOWN_MAX_MS = "60000"
```

## 开发与调试

```bash
npm run dev          # 本地开发服务器 (http://localhost:8787)
npm run typecheck    # TypeScript 类型检查
npm run deploy       # 部署到 Cloudflare
npm run test:tools   # 测试工具调用
npm run test:stream  # 测试流式响应
npx wrangler tail    # 查看实时日志
```

## 已知问题与修复记录

### Thought Signature 多轮对话支持

Gemini API 在启用 thinking 时，会在 `functionCall` part 上附加 `thoughtSignature`，后续请求必须回传此签名，否则返回 400 错误。

**影响场景**：Sonnet 模型（`gemini-3-flash-preview`）在工具调用时可能不返回 `thought` 文本，仅返回 `functionCall` + `thoughtSignature`，而 Opus 模型（`gemini-3.1-pro-preview`）始终返回完整的思考文本。

**修复方案**：
1. **流式转换器**：当 `functionCall` 携带 `thoughtSignature` 但无前置 `thought` 文本时，创建空的 `thinking` block 传递 signature（`stream-transformer.ts`）
2. **请求转换器**：将 `thoughtSignature` 优先附加到 `functionCall` part 而非中间的 `text` part（`request-transformer.ts`）

## 常见问题

**Q: API 密钥如何传递？**
A: 客户端在每次请求时通过 `x-api-key` 或 `Authorization: Bearer` 头传递 Gemini API 密钥，服务端不存储任何密钥。

**Q: 支持哪些 Claude 模型？**
A: 支持 Opus 4.6/4.1/4、Sonnet 4.6/4.5/4/3.7/3.5、Haiku 4.5/3.5，详见模型映射表。

**Q: Claude Code 客户端如何使用？**
A: 设置 `ANTHROPIC_API_URL` 指向 Worker 地址，`ANTHROPIC_API_KEY` 设为 Gemini API Key 即可。

**Q: 可以自定义模型映射吗？**
A: 修改 `src/models.ts` 中的 `MODEL_MAPPING` 即可。

## 许可证

ISC License
