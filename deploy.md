# 部署指南

## 前置准备

1. **安装依赖**
```bash
npm install
```

2. **登录 Cloudflare**
```bash
npx wrangler login
```

## 部署步骤

### 1. 本地开发测试

```bash
npm run dev
```

本地服务将运行在 `http://localhost:8787`

### 2. 部署到 Cloudflare Workers

```bash
npm run deploy
```

部署成功后会显示你的 Worker URL，格式如：
`https://claude-code-api.<你的子域名>.workers.dev`

## 验证部署

### 健康检查
```bash
curl https://你的worker地址/health
```

### 测试 API 转换
```bash
curl -X POST https://你的worker地址/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: 你的Gemini_API_KEY" \
  -d '{
    "model": "claude-sonnet-4-6",
    "messages": [{"role": "user", "content": "Hello"}],
    "max_tokens": 100
  }'
```

> API 密钥由客户端在每次请求时通过 `x-api-key` 或 `Authorization: Bearer` 头传递，服务端不存储任何密钥。

## 配置说明

### wrangler.toml 配置项

- `name`: Worker 名称
- `main`: 入口文件路径
- `compatibility_date`: 兼容性日期
- `compatibility_flags`: 启用 Node.js 兼容性

### 可选环境变量

以下环境变量均为可选，可在 `wrangler.toml` 的 `[vars]` 中配置：

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `CORS_ENABLED` | 是否启用 CORS | `true` |
| `ENABLE_VALIDATION` | 是否启用请求验证 | `true` |
| `GEMINI_BASE_URL` | Gemini API 基础 URL | `https://generativelanguage.googleapis.com` |
| `GEMINI_API_VERSION` | Gemini API 版本 | `v1beta` |
| `GEMINI_TIMEOUT` | Gemini API 超时时间（ms） | `120000` |
| `SERVER_TIMEOUT` | 服务器超时时间（ms） | `120000` |
| `BLACKLIST_COOLDOWN_MIN_MS` | 密钥黑名单最小冷却时间（ms） | `15000` |
| `BLACKLIST_COOLDOWN_MAX_MS` | 密钥黑名单最大冷却时间（ms） | `60000` |

## 监控和日志

### 查看实时日志
```bash
npx wrangler tail
```

### 查看 Workers 分析
访问 [Cloudflare Dashboard](https://dash.cloudflare.com) 查看：
- 请求量统计
- 响应时间
- 错误率
- CPU 时间使用

## 故障排查

### 常见问题

1. **部署失败**
   - 检查 `wrangler.toml` 配置
   - 确保已登录 Cloudflare
   - 验证代码没有语法错误：`npm run typecheck`

2. **API 密钥无效**
   - 确保客户端使用正确的 Gemini API 密钥
   - 检查密钥是否有足够的配额
   - 支持通过 `x-api-key` 或 `Authorization: Bearer` 头传递

3. **模型不支持**
   - 检查模型名称是否在支持列表中（见 README.md）

## 更新部署

1. 修改代码后，运行类型检查：
```bash
npm run typecheck
```

2. 重新部署：
```bash
npm run deploy
```

## 回滚版本

查看部署历史：
```bash
npx wrangler deployments list
```

回滚到指定版本：
```bash
npx wrangler rollback [deployment-id]
```
