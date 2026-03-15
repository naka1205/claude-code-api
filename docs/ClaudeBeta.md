# Claude API Beta 模块功能说明

本文档详细介绍了 Anthropic Claude API 中除了已知的 `claude-code-20250219`、`interleaved-thinking-2025-05-14`、`fine-grained-tool-streaming-2025-05-14` 之外的其他 beta 模块功能。

## 1. Web Fetch Tool (网页获取工具)

### Beta Header
```
anthropic-beta: web-fetch-2025-09-10
```

### 功能说明
Web Fetch Tool 允许 Claude 从指定的网页和PDF文档中检索完整内容。

### 主要功能
- 从指定URL获取完整文本内容
- 自动从PDF提取文本内容
- 可选的内容引用功能
- 可配置的域名过滤
- 通过 `max_content_tokens` 限制内容长度

### 技术特性
- 支持最多100,000个内容令牌每次获取
- PDF内容以base64编码返回，自动文本提取
- 支持模型：Opus 4.1, Opus 4, Sonnet 4, Sonnet 3.7, Haiku 3.5

### 安全考量
- Claude 无法动态构造URL
- 只能获取用户明确提供的URL
- 支持域名允许/阻止列表
- 建议在可信环境中使用

### 使用限制
- 无法获取JavaScript动态渲染的网站
- URL必须在对话上下文中出现过
- 可选参数如 `max_uses` 控制获取行为

### 定价
- 无额外费用，仅标准令牌成本
- 令牌使用量取决于内容长度

## 2. Computer Use (计算机使用)

### Beta Headers
根据工具类型选择相应的beta标志：
- Claude 4 工具 (20250429)：`"betas": ["computer-use-2025-01-24"]`
- Claude Sonnet 3.7 工具 (20250124)：`"betas": ["computer-use-2025-01-24"]`
- Claude Sonnet 3.5 工具 (20241022)：`"betas": ["computer-use-2024-10-22"]`

### 功能说明
Computer Use 是一个beta功能，允许 Claude 通过截图、鼠标和键盘控制与桌面环境进行交互。

### 支持的模型
- Claude 4 Opus 和 Sonnet
- Claude Sonnet 3.7
- Claude Sonnet 3.5 (新版)

### 核心功能
- 截图功能
- 鼠标操作（点击、移动、拖拽）
- 文本输入
- 键盘输入
- 与应用程序和界面交互

### 可用操作
#### 基础操作
- screenshot（截图）
- left_click（左键点击）
- type（文本输入）
- key（键盘按键）
- mouse_move（鼠标移动）

#### 增强操作（Claude 4/3.7）
- scroll（滚动）
- 点击变体
- 精确鼠标控制

### 安全考量
- 在沙盒、隔离环境中使用
- 由于潜在安全风险需谨慎实施
- 性能可能存在延迟限制
- 需要仔细实施和人工监督

### 最佳实践
- 使用虚拟机或容器
- 限制对敏感数据的访问
- 执行前验证操作
- 记录交互以便调试

### 定价
按标准工具使用费率计费，截图和工具执行会产生额外令牌消耗。

## 3. Token-Efficient Tools (令牌高效工具)

### Beta Header
```
anthropic-beta: token-efficient-tools-2025-02-19
```

### 功能说明
Claude 3.7 Sonnet 现在支持以令牌高效的方式调用工具，可将输出令牌消耗减少高达70%。

### 主要优势
- 输出令牌消耗平均减少14%
- 最高可减少70%的令牌使用
- 提高API调用效率
- 降低成本

### 可用性
- 目前在 Anthropic API 上的beta版本中可用
- Amazon Bedrock
- Google Cloud 的 Vertex AI

## 4. Maximum Output Tokens (最大输出令牌)

### Beta Header
```
anthropic-beta: max-tokens-3-5-sonnet-2024-07-15
```

### 功能说明
使用新的 anthropic-beta 头允许 Claude Sonnet 3.5 生成长达8,192个令牌的输出。

### 技术规格
- 最大输出：8,192 令牌
- 专门针对 Claude Sonnet 3.5
- 显著增加单次响应的内容长度

## 5. Extended Output Length (扩展输出长度)

### Beta Header
```
anthropic-beta: output-128k-2025-02-19
```

### 功能说明
在API请求中包含此beta头可将最大输出令牌长度增加到128k令牌，适用于Claude Sonnet 3.7。

### 技术规格
- 最大输出：128,000 令牌
- 专门针对 Claude Sonnet 3.7
- 支持超长内容生成

## 6. Agent Capabilities API (智能代理功能API)

### 功能说明
Anthropic API 上的四项新功能，使开发者能够构建更强大的AI智能代理。

### 核心组件
1. **代码执行工具 (Code Execution Tool)**
   - 将Claude从代码编写助手转变为数据分析师
   - 可以迭代可视化、清理数据集、直接在API调用中提取洞察
   - 加载数据集、生成探索性图表、识别模式、基于执行结果迭代改进输出

2. **MCP连接器 (MCP Connector)**
   - 支持模型上下文协议
   - 增强Claude与外部系统的集成能力

3. **文件API (Files API)**
   - 支持文件上传和处理
   - 增强文档处理能力

4. **扩展提示缓存 (Extended Prompt Caching)**
   - 提示缓存时间延长至1小时
   - 为长提示降低成本高达90%，减少延迟高达85%

### 可用性
所有新的智能代理功能现已在 Anthropic API 上的公开beta版本中可用。

## 7. Extended Thinking with Tool Use (扩展思维与工具使用)

### 功能说明
Claude Opus 4 和 Sonnet 4 都具备"扩展思维与工具使用（beta）"功能。

### 核心特性
- 模型可以在扩展思维过程中使用工具（如网页搜索）
- 允许Claude在推理和工具使用之间交替，以改善响应质量
- 支持复杂的多步骤推理和问题解决

## 8. 1M Token Context Window (100万令牌上下文窗口)

### Beta状态
Claude Sonnet 4 的100万令牌上下文窗口目前处于beta版本。

### 可用性
- 仅适用于使用层级4的API组织
- 或具有自定义速率限制的组织

### 功能优势
- 支持极长的文档处理
- 增强的上下文理解能力
- 适合复杂的多文档分析任务

## 使用方法

### API请求示例
```bash
curl https://api.anthropic.com/v1/messages \
  --header "x-api-key: $ANTHROPIC_API_KEY" \
  --header "anthropic-version: 2023-06-01" \
  --header "anthropic-beta: web-fetch-2025-09-10,computer-use-2025-01-24" \
  --header "content-type: application/json"
```

### SDK使用示例
```python
# Python SDK
import anthropic

client = anthropic.Anthropic(
    api_key="your-api-key"
)

message = client.beta.messages.create(
    model="claude-sonnet-4-6-20260217",
    max_tokens=1000,
    betas=["web-fetch-2025-09-10", "computer-use-2025-01-24"],
    messages=[
        {"role": "user", "content": "Hello, Claude!"}
    ]
)
```

```javascript
// JavaScript/TypeScript SDK
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: 'your-api-key',
});

const message = await anthropic.beta.messages.create({
  model: 'claude-sonnet-4-6-20260217',
  max_tokens: 1000,
  betas: ['web-fetch-2025-09-10', 'computer-use-2025-01-24'],
  messages: [
    { role: 'user', content: 'Hello, Claude!' }
  ],
});
```

## 重要注意事项

1. **Beta功能特性**
   - 可能随时更改
   - 可能被修改或移除
   - 可能有不同的速率限制或定价
   - 并非在所有地区都可用

2. **安全考量**
   - Computer Use 功能具有独特的安全风险
   - 建议在沙盒环境中使用
   - 需要适当的监督和安全措施

3. **性能考量**
   - Beta功能可能存在性能限制
   - 某些功能可能有延迟
   - 建议在生产环境使用前进行充分测试

4. **定价影响**
   - 大多数beta功能遵循标准令牌定价
   - 某些功能可能产生额外的令牌消耗
   - 建议监控使用情况以控制成本

---

## 项目兼容性分析与建议

### 当前项目实现状况

基于对项目代码的分析，发现项目已具备良好的架构基础来处理beta模块：

✅ **已实现的功能**
- 工具调用支持 (`tools`, `tool_choice`) - `src/transformers/request-transformer.ts`
- 思维推理支持 (`thinking`) - `src/transformers/thinking-transformer.ts`
- 流式输出支持 (`stream`) - `src/handler/stream-manager.ts`
- `anthropic-beta` 参数接收和类型定义 - `src/types/claude.ts:128`
- 完整的请求转换架构 - `src/transformers/` 目录

✅ **架构优势**
- 模块化设计，易于扩展
- 完整的请求/响应转换链
- 良好的错误处理机制

### Beta模块兼容性评估

| Beta模块 | 兼容性状态 | 建议处理方式 | 技术原因 |
|---------|-----------|------------|---------|
| **Web Fetch Tool** | 🔴 **需要特殊处理** | **可选实现** | Gemini API无对应功能，需在代理层实现 |
| **Computer Use** | 🔴 **需要特殊处理** | **建议忽略** | 技术复杂度极高，存在安全风险 |
| **Token-Efficient Tools** | 🟢 **透明兼容** | **保持现状** | Gemini本身高效，无需特殊处理 |
| **Max Output Tokens** | 🟢 **透明兼容** | **保持现状** | 通过现有`max_tokens`参数处理 |
| **Extended Output** | 🟢 **透明兼容** | **保持现状** | 透明传递到Gemini API |
| **Agent Capabilities** | 🟡 **部分兼容** | **保持现状** | 部分功能已支持，其他透明传递 |

---

## 参考资源

- [Claude API 官方文档](https://docs.claude.com/)
- [Beta Headers 文档](https://docs.claude.com/en/api/beta-headers)
- [Computer Use 文档](https://docs.claude.com/en/docs/agents-and-tools/computer-use)
- [Web Fetch Tool 文档](https://docs.claude.com/en/docs/agents-and-tools/tool-use/web-fetch-tool)
- [Anthropic API 发布说明](https://docs.claude.com/en/release-notes/api)