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

### 1. 创建 KV 命名空间（如果还没有创建）

```bash
# 创建生产环境 KV
npx wrangler kv:namespace create "KV"

# 创建开发环境 KV（可选）
npx wrangler kv:namespace create "KV" --preview
```

将返回的 ID 更新到 `wrangler.toml` 中：
```toml
[[kv_namespaces]]
binding = "CACHE"
id = "你的KV_ID"
```

### 2. 配置环境变量（可选）

如果需要固定的 API 密钥，可以配置 secrets：
```bash
npx wrangler secret put DEFAULT_API_KEY
```

### 3. 本地开发测试

```bash
npm run dev
```

本地服务将运行在 `http://localhost:8787`

### 4. 部署到 Cloudflare Workers

```bash
npm run deploy
```

部署成功后会显示你的 Worker URL，格式如：
`https://<你的子域名>.workers.dev`

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
    "model": "claude-3-5-sonnet-20241022",
    "messages": [{"role": "user", "content": "Hello"}],
    "max_tokens": 100
  }'
```

## 配置说明

### wrangler.toml 配置项

- `name`: Worker 名称
- `main`: 入口文件路径
- `compatibility_date`: 兼容性日期
- `compatibility_flags`: 启用 Node.js 兼容性
- `kv_namespaces`: KV 存储绑定

### 支持的环境变量

- `DEFAULT_API_KEY`: 默认的 Gemini API 密钥（可选）
- `ENABLE_CACHE`: 是否启用缓存（默认: true）
- `ENABLE_RATE_LIMIT`: 是否启用速率限制（默认: true）

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

1. **KV 绑定错误**
   - 确保 KV 命名空间 ID 正确
   - 检查是否有权限访问 KV

2. **部署失败**
   - 检查 `wrangler.toml` 配置
   - 确保已登录 Cloudflare
   - 验证代码没有语法错误：`npm run typecheck`

3. **API 密钥无效**
   - 确保使用正确的 Gemini API 密钥
   - 检查密钥是否有足够的配额

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