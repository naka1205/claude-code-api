# Claude API 测试套件

本目录包含完整的 Claude API 测试脚本，用于验证 Claude -> Gemini API 转换功能的正确性。

## 测试文件说明

### 1. `test-claude-basic.js`
**基础功能测试**
- 基本文本生成
- 多轮对话
- 系统提示词
- 温度参数 (temperature)
- 停止序列 (stop_sequences)
- top_p 和 top_k 参数
- 响应字段完整性

### 2. `test-claude-advanced.js`
**高级功能测试**
- 工具调用 (Function Calling)
- 多个工具定义
- 流式响应 (SSE)
- 多模态内容 (Base64图像)
- 混合内容处理
- 元数据 (metadata)
- 预填充助手响应

### 3. `test-claude-errors.js`
**错误处理与边界测试**
- 缺少必需参数
- 无效参数值
- 不支持的模型
- 消息格式错误
- 工具定义错误
- 超大请求处理
- 无效的 API 密钥
- 缺少 API 版本头

### 4. `test-claude-token-count.js`
**Token计数接口测试**
- 基本Token计数
- 多轮对话Token计数
- 系统提示Token计数
- 工具定义Token计数
- 长文本Token计数
- 多模态内容Token计数
- 错误处理

### 5. `run-all-tests.sh`
**批量测试运行脚本**
- 运行所有测试文件
- 生成综合测试报告
- 统计通过率

## 使用方法

### 环境变量设置

```bash
# 设置 API 端点（默认使用生产环境）
export API_URL="https://your-worker.workers.dev"

# 设置 Gemini API 密钥
export GEMINI_API_KEY="your-gemini-api-key"

# 启用详细输出（可选）
export VERBOSE=true
```

### 运行单个测试

```bash
# 运行基础功能测试
node test/test-claude-basic.js

# 运行高级功能测试
node test/test-claude-advanced.js

# 运行错误处理测试
node test/test-claude-errors.js

# 运行Token计数测试
node test/test-claude-token-count.js
```

### 运行所有测试

```bash
# 在 test 目录下
chmod +x run-all-tests.sh
./run-all-tests.sh

# 或从项目根目录
bash test/run-all-tests.sh
```

### 使用不同的环境

```bash
# 测试本地开发环境
API_URL=http://localhost:8787 GEMINI_API_KEY=your-key node test/test-claude-basic.js

# 测试生产环境
API_URL=https://your-worker.workers.dev GEMINI_API_KEY=your-key ./test/run-all-tests.sh

# 启用详细调试输出
VERBOSE=true GEMINI_API_KEY=your-key node test/test-claude-advanced.js
```

## 测试覆盖范围

### Messages API 端点
- ✅ POST `/v1/messages` - 主要消息生成端点
- ✅ POST `/v1/messages/count-tokens` - Token计数端点

### 请求参数
- ✅ `model` - 模型选择与映射
- ✅ `messages` - 消息数组处理
- ✅ `max_tokens` - 最大生成长度
- ✅ `system` - 系统提示词
- ✅ `temperature` - 温度参数
- ✅ `top_p` - 核采样参数
- ✅ `top_k` - Top-K采样
- ✅ `stop_sequences` - 停止序列
- ✅ `stream` - 流式响应
- ✅ `tools` - 工具定义
- ✅ `tool_choice` - 工具选择策略
- ✅ `metadata` - 元数据

### 消息格式
- ✅ 纯文本消息
- ✅ 多模态消息（文本+图像）
- ✅ Base64图像
- ✅ 多个内容块

### 响应格式
- ✅ 标准响应结构
- ✅ 流式响应事件
- ✅ 工具调用响应
- ✅ 错误响应格式

### 错误处理
- ✅ 400 Bad Request - 参数验证错误
- ✅ 401/403 - 认证错误
- ✅ 模型不支持错误
- ✅ 参数值超出范围

## 预期结果

成功运行所有测试后，您应该看到类似以下的输出：

```
=========================================
     Claude API 完整测试套件
=========================================

配置信息:
  API URL: https://claude-code-api.nkkk.workers.dev
  API Key: AIzaSyB2z...
  详细模式: false

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧪 运行: Claude API 基础功能测试
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📝 测试: 基本文本生成
✅ 通过 - 响应结构正确，内容符合预期

📝 测试: 多轮对话
✅ 通过 - 正确维持多轮对话上下文

[更多测试结果...]

=========================================
           测试套件完成
=========================================

📊 测试统计:
  总测试数: 30
  通过: 28
  失败: 2
  跳过: 0
  通过率: 93.3%
  执行时间: 45秒
```

## 常见问题

### 1. API密钥错误
确保您使用的是有效的 Gemini API 密钥，并且已正确设置环境变量。

### 2. 速率限制
如果遇到速率限制错误，可以：
- 增加测试之间的延迟
- 使用不同的 API 密钥
- 分批运行测试

### 3. 网络连接问题
确保能够访问 API 端点，特别是在使用本地开发环境时。

### 4. 测试失败
查看详细错误信息：
```bash
VERBOSE=true node test/test-claude-basic.js
```

## 贡献

欢迎提交问题报告和改进建议。在提交 PR 之前，请确保所有测试都能通过。

## 许可证

MIT License