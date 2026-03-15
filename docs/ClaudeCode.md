


## 工具接口与示例（Claude Code 相关）

> 说明：以下示例基于 Messages API 的工具调用能力（Tool Use）。模型在响应中会产出 `tool_use` 类型的内容块，您的后端应据此实际执行，并将 `tool_result` 回传给模型继续对话。

参考文档：
- Bash 工具：`https://docs.anthropic.com/zh-CN/docs/agents-and-tools/tool-use/bash-tool`
- 代码执行工具：`https://docs.anthropic.com/zh-CN/docs/agents-and-tools/tool-use/code-execution-tool`
- 文本编辑器工具：`https://docs.anthropic.com/zh-CN/docs/agents-and-tools/tool-use/text-editor-tool`
- 网络搜索工具：`https://docs.anthropic.com/zh-CN/docs/agents-and-tools/tool-use/web-search-tool`
- 计算机使用工具：`https://docs.anthropic.com/zh-CN/docs/agents-and-tools/tool-use/computer-use-tool`

---

### 1) Bash 工具（bash_20250124）

适用：Claude 4 模型与 Sonnet 3.7。提供持久 bash 会话能力，适合脚本化自动化、构建、测试、数据处理等。

请求（cURL，带注释）：
```bash
#!/bin/sh
curl https://api.anthropic.com/v1/messages \
     --header "x-api-key: $ANTHROPIC_API_KEY" \
     --header "anthropic-version: 2023-06-01" \
     --header "content-type: application/json" \
     --data '
{
  "model": "claude-sonnet-4-6-20260217",
  "max_tokens": 512,
  "tools": [
    { "type": "bash_20250124", "name": "bash" }
  ],
  "messages": [
    { "role": "user", "content": "列出当前目录下所有 .py 文件，并显示大小。" }
  ]
}'
```

可能的中间响应（节选）：
```json
{
  "content": [
    {
      "type": "tool_use",
      "id": "toolu_01...",
      "name": "bash",
      "input": { "command": "ls -lh *.py" }
    }
  ],
  "stop_reason": "tool_use"
}
```

随后，您的后端应执行该命令，并以 `tool_result` 回传：
```json
{
  "role": "user",
  "content": [
    {
      "type": "tool_result",
      "tool_use_id": "toolu_01...",
      "content": "-rw-r--r--  1 user  staff   2.0K fetch_joke.py\n-rw-r--r--  1 user  staff   1.2K main.py\n"
    }
  ]
}
```

注意：也可传入 `{ "restart": true }` 以重启会话。更多安全/超时/截断建议见官方文档。

参考：`https://docs.anthropic.com/zh-CN/docs/agents-and-tools/tool-use/bash-tool`

---

### 2) 代码执行工具（Code Execution Tool）

用途：在受控沙盒中执行短小代码片段（如 Python/JS），适合运行片段级验证、轻量数据处理与演示。具体版本/可用性以官方文档为准。

请求（cURL，概念示例）：
```bash
#!/bin/sh
curl https://api.anthropic.com/v1/messages \
     --header "x-api-key: $ANTHROPIC_API_KEY" \
     --header "anthropic-version: 2023-06-01" \
     --header "content-type: application/json" \
     --data '
{
  "model": "claude-sonnet-4-6-20260217",
  "max_tokens": 512,
  "tools": [
    { "type": "code_execution_20250124", "name": "code_executor" }
  ],
  "messages": [
    { "role": "user", "content": "运行一段 Python 代码：计算前 10 个平方数。" }
  ]
}'
```

模型可能请求执行（节选）：
```json
{
  "content": [
    {
      "type": "tool_use",
      "id": "toolu_02...",
      "name": "code_executor",
      "input": {
        "language": "python",
        "code": "print([i*i for i in range(1, 11)])"
      }
    }
  ],
  "stop_reason": "tool_use"
}
```

回传执行结果：
```json
{
  "role": "user",
  "content": [
    {
      "type": "tool_result",
      "tool_use_id": "toolu_02...",
      "content": "[1, 4, 9, 16, 25, 36, 49, 64, 81, 100]"
    }
  ]
}
```

参考：`https://docs.anthropic.com/zh-CN/docs/agents-and-tools/tool-use/code-execution-tool`

---

### 3) 文本编辑器工具（Text Editor Tool）

用途：查看与修改文本文件，适合代码重构、小修小改与多文件协作。

可用版本（节选）：
- Claude 4 Opus & Sonnet: `text_editor_20250429`
- Claude Sonnet 3.7: `text_editor_20250124`
- Claude Sonnet 3.5: `text_editor_20241022`

请求（cURL，带注释）：
```bash
#!/bin/sh
curl https://api.anthropic.com/v1/messages \
     --header "x-api-key: $ANTHROPIC_API_KEY" \
     --header "anthropic-version: 2023-06-01" \
     --header "content-type: application/json" \
     --data '
{
  "model": "claude-opus-4-6-20260205",
  "max_tokens": 512,
  "tools": [
    { "type": "text_editor_20250429", "name": "editor" }
  ],
  "messages": [
    { "role": "user", "content": "在 README.md 末尾追加一段使用说明。" }
  ]
}'
```

可能的工具调用（节选）：
```json
{
  "content": [
    {
      "type": "tool_use",
      "id": "toolu_ed1...",
      "name": "editor",
      "input": {
        "action": "edit",
        "file_path": "README.md",
        "edits": [
          { "op": "append", "text": "\n## 使用说明\n1. 安装依赖\n2. 运行示例\n" }
        ]
      }
    }
  ],
  "stop_reason": "tool_use"
}
```

您的后端应执行实际文件修改，并以 `tool_result` 回传摘要或新的文件片段：
```json
{
  "role": "user",
  "content": [
    {
      "type": "tool_result",
      "tool_use_id": "toolu_ed1...",
      "content": "README.md 已追加 2 行。"
    }
  ]
}
```

参考：`https://docs.anthropic.com/zh-CN/docs/agents-and-tools/tool-use/text-editor-tool`

---

### 4) 网络搜索工具（Web Search Tool）

用途：让模型在对话中进行实时网络搜索并自动附带引用。需在控制台启用；可配置 `max_uses`、域白/黑名单与 `user_location`。

请求（cURL，带注释）：
```bash
#!/bin/sh
curl https://api.anthropic.com/v1/messages \
     --header "x-api-key: $ANTHROPIC_API_KEY" \
     --header "anthropic-version: 2023-06-01" \
     --header "content-type: application/json" \
     --data '
{
  "model": "claude-opus-4-6-20260205",
  "max_tokens": 1024,
  "messages": [
    {"role": "user", "content": "What's new in TypeScript 5.5? Please include sources."}
  ],
  "tools": [{
    "type": "web_search_20250305",
    "name": "web_search",
    "max_uses": 3,
    "allowed_domains": ["www.typescriptlang.org", "devblogs.microsoft.com"],
    "user_location": {"type": "approximate", "country": "US", "timezone": "America/Los_Angeles"}
  }]
}'
```

响应要点：
- 中途会出现 `server_tool_use`（触发搜索）与 `web_search_tool_result`（返回结果）内容块。
- 结束时给出带引用的最终回答；错误示例可能返回 `max_uses_exceeded` 等错误码。

参考：`https://docs.anthropic.com/zh-CN/docs/agents-and-tools/tool-use/web-search-tool`

---

### 5) 计算机使用工具（Computer Use Tool）

用途：以更高层次控制桌面环境（如打开应用、点击、输入文本等），适合 UI 自动化与复杂操作流程。需在受控环境中启用并配置权限与安全措施。

请求（cURL，概念示例）：
```bash
#!/bin/sh
curl https://api.anthropic.com/v1/messages \
     --header "x-api-key: $ANTHROPIC_API_KEY" \
     --header "anthropic-version: 2023-06-01" \
     --header "content-type: application/json" \
     --data '
{
  "model": "claude-sonnet-4-6-20260217",
  "max_tokens": 512,
  "tools": [
    { "type": "computer_use_20250124", "name": "computer" }
  ],
  "messages": [
    { "role": "user", "content": "打开浏览器访问 example.com，搜索 ‘hello world’，并截图返回。" }
  ]
}'
```

可能的工具调用（节选）：
```json
{
  "content": [
    {
      "type": "tool_use",
      "id": "toolu_comp1",
      "name": "computer",
      "input": {"actions": [
        {"type": "launch_app", "app": "browser"},
        {"type": "navigate", "url": "https://www.example.com"},
        {"type": "type", "text": "hello world"},
        {"type": "key", "key": "Enter"},
        {"type": "screenshot"}
      ]}
    }
  ],
  "stop_reason": "tool_use"
}
```

回传 `tool_result` 时建议携带截图的二进制引用（或可访问的文件 URL）与执行摘要。实际支持的动作与参数以官方文档为准。

参考：`https://docs.anthropic.com/zh-CN/docs/agents-and-tools/tool-use/computer-use-tool`

---

## Hooks 常用匹配器与内置工具概览（Claude Code）

以下内容基于 Hooks 参考文档，列出常用匹配器（Common matchers）与 Claude Code 客户端侧常见工具名称，便于在 `PreToolUse` / `PostToolUse` 中按工具名匹配：

### 常用匹配器（节选）
- `Task`：子代理任务（Subagent 相关）
- `Bash`：Bash 命令执行
- `Glob`：文件模式匹配
- `Grep`：内容搜索
- `Read`：读取文件
- `Edit`、`MultiEdit`：编辑文件
- `Write`：写入文件
- `WebFetch`、`WebSearch`：Web 获取/搜索

说明：匹配器是大小写敏感的工具名称匹配模式。支持：
- 完整字符串：`Write` 仅匹配 Write 工具
- 正则：`Edit|Write`、`Notebook.*`
- 通配：`*`（匹配全部）或空字符串 / 省略 `matcher`

参考：`https://docs.anthropic.com/en/docs/claude-code/hooks`

### Claude Code 常见工具清单（示例性，不同版本可能差异）
- 读写与编辑类：`Read`、`Write`、`Edit`、`MultiEdit`
- 搜索类：`Grep`、`Glob`
- 终端类：`Bash`
- Web 类：`WebFetch`、`WebSearch`
- 任务/子代理：`Task`
- 其他：与 MCP 提供的工具以 `mcp__<server>__<tool>` 命名出现

在 Hooks 中可按上述名称或模式匹配，以便实现在工具调用前/后触发校验、审计、格式化或自动化脚本。

---

## Todo工具系列详细说明

### TodoWrite工具参数结构

Claude Code提供了TodoWrite工具来帮助管理和跟踪任务进度，该工具的参数结构如下：

#### 基本参数
- `todos` (array, 必需): 待办任务列表数组

#### 每个todo项目的结构
- `content` (string, 必需): 任务描述，使用祈使句形式 (如 "Run tests", "Fix authentication bug")
- `activeForm` (string, 必需): 任务进行时的描述形式 (如 "Running tests", "Fixing authentication bug")
- `status` (string, 必需): 任务状态，可选值：
  - `pending`: 待处理
  - `in_progress`: 进行中
  - `completed`: 已完成

#### 状态管理原则

1. **同时只能有一个任务处于`in_progress`状态**
2. **任务完成后立即标记为`completed`，不要批量更新**
3. **实时更新任务状态，保持用户对进度的可见性**

#### 使用示例

```json
{
  "todos": [
    {
      "content": "Analyze project structure",
      "activeForm": "Analyzing project structure",
      "status": "completed"
    },
    {
      "content": "Optimize data transformation logic",
      "activeForm": "Optimizing data transformation logic",
      "status": "in_progress"
    },
    {
      "content": "Implement caching strategy",
      "activeForm": "Implementing caching strategy",
      "status": "pending"
    }
  ]
}
```

#### 客户端显示格式

Todo任务在Claude Code客户端中以以下格式显示：

```
Todos
☒ Analyze project structure
⚫ Optimizing data transformation logic
☐ Implement caching strategy
```

- `☒` 表示已完成的任务 (completed)
- `⚫` 表示正在进行的任务 (in_progress)
- `☐` 表示待处理的任务 (pending)

#### 已知限制

1. **Task工具内部的TodoWrite更新不可见**: 当在Task工具内部调用TodoWrite时，用户看不到Todo更新，只能看到最终输出
2. **覆盖整个列表**: TodoWrite会覆盖整个Todo列表而不是更新单个项目，可能导致现有todos丢失

#### 最佳实践

1. **频繁使用**: 在复杂任务中积极使用TodoWrite来跟踪进度
2. **即时更新**: 完成任务后立即更新状态，不要延迟
3. **清晰描述**: 使用具体、可操作的任务描述
4. **单一进行**: 确保同时只有一个任务为in_progress状态

---

## 客户端工具调用原理与流程（Claude Code）

以下描述从“用户发起请求”到“工具执行与结果回传”端到端的关键步骤：

1) 用户输入与会话状态
- 用户在 IDE/CLI 中提交指令（`UserPromptSubmit` 事件可被 Hook）。
- 客户端整理上下文（设置、会话历史、文件变更、系统提示等）。

2) 模型决策与工具选择
- 将请求发往 Messages API，模型基于意图选择是否调用工具（或多次调用）。
- 若启用 Hooks：在具体工具执行前触发 `PreToolUse`，可校验/修改/阻止调用。

3) 工具执行
- 对于客户端内置工具（如 `Read`/`Edit`/`Write`/`Grep`/`Glob`/`Bash` 等），由客户端在本地或受控环境中执行。
- 对于服务器侧工具（如 `web_search` 或远端 MCP 工具），由服务端或相应后端执行并将结果返回。
- 执行完成后触发 `PostToolUse`，可做格式检查、风格校验、日志记录等。

4) 结果回传与继续生成
- 工具结果以 `tool_result`（或服务器工具结果块）回注入对话，模型据此继续生成，直至 `end_turn` / `pause_turn` / `tool_use` 等停止原因。

5) 终止与清理
- 主代理完成响应会触发 `Stop`，子代理任务完成会触发 `SubagentStop`，会话生命周期事件（`SessionStart`/`SessionEnd`）可用于加载/清理上下文。

安全与治理建议：
- 结合 `PreToolUse` 做白/黑名单与路径/命令校验；`PostToolUse` 做输出截断与审计；`Notification` 做权限请求提示。
- 使用 `$CLAUDE_PROJECT_DIR` 引用项目内脚本，统一策略；合理设置超时与并发；记录与监控关键行为。

参考：`https://docs.anthropic.com/en/docs/claude-code/hooks`


## Claude支持的功能与工具

### 1. 核心功能

#### 文本生成
- **功能描述**: 生成高质量、连贯的文本内容
- **支持特性**: 创意写作、技术文档、代码生成、翻译等
- **文档地址**: https://docs.anthropic.com/en/api/messages

#### 多模态理解
- **功能描述**: 同时处理文本和图像内容
- **支持格式**: JPEG、PNG、WebP、GIF等图像格式
- **应用场景**: 图像描述、视觉问答、文档分析

#### 流式响应
- **功能描述**: 实时流式输出生成的内容
- **支持特性**: Server-Sent Events (SSE) 格式
- **优势**: 降低延迟，提升用户体验

#### 长上下文处理
- **功能描述**: 处理超长文档和对话历史
- **支持长度**: 根据模型不同，支持数十万到数百万token
- **应用场景**: 长文档分析、复杂对话、代码审查

### 2. 工具与集成

#### 函数调用 (Tool Use)
- **功能描述**: 调用外部函数和工具，扩展AI能力
- **支持特性**: 
  - 自定义工具定义
  - 参数验证
  - 结果处理
  - 工具链组合

#### 文本编辑器工具
- **功能描述**: 查看和修改文本文件，帮助调试和改进代码
- **支持模型**:
  - Claude 4 Opus & Sonnet: `text_editor_20250429`
  - Claude Sonnet 3.7: `text_editor_20250124`
  - Claude Sonnet 3.5: `text_editor_20241022`

### 3. 高级功能

#### 思考模式 (Thinking)
- **功能描述**: 在生成响应前进行深度推理和思考
- **支持特性**: 
  - 复杂问题分解
  - 多步推理过程
  - 思考过程可视化
- **适用场景**: 数学问题、逻辑推理、复杂分析

#### 结构化输出
- **功能描述**: 生成符合特定格式的结构化数据
- **支持格式**: JSON、XML、YAML等
- **应用场景**: API响应、数据提取、格式化输出

#### 自定义停止序列
- **功能描述**: 定义自定义文本序列来控制生成停止
- **支持特性**: 多个停止序列、精确控制输出长度
- **应用场景**: 格式化输出、特定长度要求

### 4. 模型系列

#### Claude 4 系列
- **Claude 4 Opus**: 最高性能，复杂推理和创作任务
- **Claude 4 Sonnet**: 平衡性能和速度，通用任务
- **Claude 4 Haiku**: 快速响应，简单任务

#### Claude 3.5 系列
- **Claude 3.5 Sonnet**: 高性能，代码和数学任务
- **Claude 3.5 Haiku**: 快速轻量，日常任务

### 5. 安全与配置

#### 内容安全
- **功能描述**: 内置内容安全过滤和审核
- **支持特性**: 有害内容检测、政策合规
- **配置选项**: 可自定义安全级别

#### 速率限制
- **功能描述**: 基于token的计费和速率限制
- **限制类型**: 
  - 每分钟请求数 (RPM)
  - 每分钟token数 (TPM)
  - 每天请求数 (RPD)


## 最佳实践

### 1. 提示工程
- 使用清晰的指令和上下文
- 提供具体的示例和格式要求
- 合理使用系统提示词

### 2. 错误处理
- 实现重试机制
- 处理速率限制
- 监控API使用情况

### 3. 性能优化
- 合理设置max_tokens
- 使用流式响应提升用户体验
- 缓存重复的请求

### 4. 安全考虑
- 保护API密钥
- 验证用户输入
- 监控异常使用

---

**注意**: 以上功能列表基于官方文档整理，部分功能可能仍在开发中或需要特定权限。建议访问官方文档获取最新信息和详细使用说明。

**官方文档**: https://docs.anthropic.com/en/api/messages
**示例代码**: https://docs.anthropic.com/en/api/messages-examples

**最后更新**: 2026年3月