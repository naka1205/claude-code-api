# Gemini API 官方功能与工具完整列表

## 核心功能

### 1. 文本生成 (Text Generation)
- **功能描述**: 从文本、图像、视频和音频等多种输入生成文本输出
- **文档地址**: https://ai.google.dev/gemini-api/docs/text-generation
- **支持特性**: 流式响应、多轮对话、系统指令

#### 示例（REST/cURL，来自官方文档）
```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d '{
    "contents": [
      {
        "parts": [
          { "text": "How does AI work?" }
        ]
      }
    ]
  }'
```

说明：以上端点与字段取自官方页面“Text generation”示例，模型使用 `gemini-2.5-flash`，请求头需提供 `x-goog-api-key`。

#### 响应示例（节选）
```json
{
  "candidates": [
    {
      "content": {
        "parts": [
          { "text": "..." }
        ]
      }
    }
  ]
}
```

### 2. 图像生成 (Image Generation) 
- **功能描述**: 根据文本提示生成高质量图像内容
- **文档地址**: https://ai.google.dev/gemini-api/docs/image-generation
- **支持特性**: 多种图像格式、风格控制

#### 示例（REST/cURL，来自官方文档）
```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d '{
    "contents": [
      {
        "parts": [
          { "text": "Create an image of a nano banana dish at a fine dining restaurant, Gemini themed." }
        ]
      }
    ]
  }'
```

说明：图像生成功能在官方文档中由 `Imagen`/Gemini 图像能力提供，最新示例同样通过 `:generateContent` 调用，模型以 2.5 代 Flash 图像能力为主（页面会随发布更新而变动）。

#### 响应示例（节选，Base64 图像）
```json
{
  "candidates": [
    {
      "content": {
        "parts": [
          {
            "inlineData": {
              "mimeType": "image/png",
              "data": "iVBORw0KGgoAAAANSUhEUgAA..."
            }
          }
        ]
      }
    }
  ]
}
```

### 3. 语音生成 (Speech Generation)
- **功能描述**: 将文本转换为自然语音输出
- **文档地址**: https://ai.google.dev/gemini-api/docs/speech-generation
- **支持特性**: 多种语言、音色选择

#### 示例（REST/cURL，单说话人 TTS，来自官方文档）
```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{
        "contents": [{
          "parts":[{
            "text": "Say cheerfully: Have a wonderful day!"
          }]
        }],
        "generationConfig": {
          "responseModalities": ["AUDIO"],
          "speechConfig": {
            "voiceConfig": {
              "prebuiltVoiceConfig": {
                "voiceName": "Kore"
              }
            }
          }
        },
        "model": "gemini-2.5-flash-preview-tts"
    }' | jq -r '.candidates[0].content.parts[0].inlineData.data' | \
          base64 --decode >out.pcm
# 可选：将 PCM 转为 WAV（需本地安装 ffmpeg）
ffmpeg -f s16le -ar 24000 -ac 1 -i out.pcm out.wav
```

#### 响应示例（节选，Base64 音频）
```json
{
  "candidates": [
    {
      "content": {
        "parts": [{
          "inlineData": {
            "mimeType": "audio/pcm",   // 响应为PCM数据（示例中直接导出 .pcm）
            "data": "...base64..."
          }
        }]
      }
    }
  ]
}
```

### 4. 长上下文处理 (Long Context)
- **功能描述**: 处理包含大量上下文信息的输入，支持超长文档理解
- **文档地址**: https://ai.google.dev/gemini-api/docs/long-context
- **支持特性**: 百万级token处理、上下文缓存

#### 示例（分段提供长文档 + 上下文缓存）
```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d '{
    "cachedContent": {
      "role": "user",
      "parts": [{ "text": "[这里是长文档的第一部分...省略]" }]
    },
    "contents": [
      {
        "role": "user",
        "parts": [{ "text": "基于缓存的长文档，提取所有关键结论并编号" }]
      }
    ],
    "generationConfig": { "maxOutputTokens": 512 }
  }'
```

#### 响应示例（节选）
```json
{
  "candidates": [
    {
      "content": { "parts": [{ "text": "1) 结论一...\n2) 结论二..." }] }
    }
  ],
  "usageMetadata": { "totalTokenCount": 1000000 }
}
```

### 5. 结构化输出 (Structured Output)
- **功能描述**: 生成符合特定格式的结构化数据（JSON、XML等）
- **文档地址**: https://ai.google.dev/gemini-api/docs/structured-output
- **支持特性**: Schema验证、类型安全

#### 示例（JSON Schema 约束）
```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d '{
    "contents": [
      { "role": "user", "parts": [{ "text": "从下面文本中提取人名、公司名：张三入职字节跳动成为算法工程师。" }] }
    ],
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

#### 响应示例
```json
{
  "candidates": [
    {
      "content": {
        "parts": [{
          "text": "{\n  \"persons\": [\"张三\"],\n  \"companies\": [\"字节跳动\"]\n}"
        }]
      }
    }
  ]
}
```

### 6. 思考功能 (Thinking)
- **功能描述**: 在生成内容时进行深度推理和思考，提升复杂任务处理能力
- **文档地址**: https://ai.google.dev/gemini-api/docs/thinking
- **支持特性**: 推理过程可视化、思考预算控制

#### 示例（控制 Thinking 预算，来自官方文档思路）
```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d '{
    "contents": [
      {
        "parts": [
          { "text": "How does AI work?" }
        ]
      }
    ],
    "generationConfig": {
      "thinkingConfig": {
        "thinkingBudget": 0   // 将思考预算设为0可禁用thinking（2.5默认开启）
      }
    }
  }'
```

#### 响应示例（节选）
```json
{
  "candidates": [
    {
      "content": {
        "parts": [
          { "text": "最终答案：..." },
          { "thought": { "content": "推理步骤1...步骤2...", "redacted": true } }
        ]
      }
    }
  ]
}
```

## 多模态理解能力

### 7. 文档理解 (Document Understanding)
- **功能描述**: 解析和理解各种格式的文档内容，提取关键信息
- **文档地址**: https://ai.google.dev/gemini-api/docs/document-processing
- **支持格式**: PDF、Word、PPT、HTML、Markdown等

#### 示例（Files API + 文档QA）
```bash
curl "https://generativelanguage.googleapis.com/v1beta/files:upload?key=$GEMINI_API_KEY" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d '{
    "file": {
      "displayName": "annual_report.pdf",
      "mimeType": "application/pdf",
      "data": "JVBERi0xLjQKJcfs..."
    }
  }'
```

上传成功后根据返回的 `file.uri`：

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d '{
    "contents": [{
      "role": "user",
      "parts": [
        { "fileData": { "fileUri": "uploaded-files/annual_report.pdf", "mimeType": "application/pdf" } },
        { "text": "请给出报告的三条关键要点" }
      ]
    }]
  }'
```

#### 响应示例（节选）
```json
{
  "candidates": [
    {
      "content": { "parts": [{ "text": "1) 收入同比增长...\n2) 毛利率提升...\n3) 现金流改善..." }] }
    }
  ]
}
```

### 8. 图像理解 (Image Understanding)
- **功能描述**: 分析和理解图像内容，提取相关信息
- **文档地址**: https://ai.google.dev/gemini-api/docs/image-understanding
- **支持特性**: 物体识别、场景分析、OCR文字提取

#### 示例（图像+文本多模态）
```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d '{
    "contents": [{
      "role": "user",
      "parts": [
        { "inlineData": { "mimeType": "image/jpeg", "data": "/9j/4AAQSkZJRgABAQAAAQABAAD..." } },
        { "text": "这张图里有哪些物体？给出中文列表。" }
      ]
    }]
  }'
```

#### 响应示例（节选）
```json
{
  "candidates": [
    { "content": { "parts": [{ "text": "- 人\n- 自行车\n- 红绿灯\n- 建筑" }] } }
  ]
}
```

### 9. 视频理解 (Video Understanding)
- **功能描述**: 处理和理解视频内容，提取有用信息
- **文档地址**: https://ai.google.dev/gemini-api/docs/video-understanding
- **支持特性**: 视频摘要、动作识别、场景分析

#### 示例（视频片段摘要）
```bash
# 1) 通过可恢复上传接口上传视频（>20MB 建议使用）
VIDEO_PATH="path/to/sample.mp4"
MIME_TYPE=$(file -b --mime-type "${VIDEO_PATH}")
NUM_BYTES=$(wc -c < "${VIDEO_PATH}")
DISPLAY_NAME=VIDEO

tmp_header_file=upload-header.tmp

curl "https://generativelanguage.googleapis.com/upload/v1beta/files" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -D ${tmp_header_file} \
  -H "X-Goog-Upload-Protocol: resumable" \
  -H "X-Goog-Upload-Command: start" \
  -H "X-Goog-Upload-Header-Content-Length: ${NUM_BYTES}" \
  -H "X-Goog-Upload-Header-Content-Type: ${MIME_TYPE}" \
  -H "Content-Type: application/json" \
  -d "{'file': {'display_name': '${DISPLAY_NAME}'}}" 2> /dev/null

upload_url=$(grep -i "x-goog-upload-url: " "${tmp_header_file}" | cut -d" " -f2 | tr -d "\r")
rm "${tmp_header_file}"

curl "${upload_url}" \
  -H "Content-Length: ${NUM_BYTES}" \
  -H "X-Goog-Upload-Offset: 0" \
  -H "X-Goog-Upload-Command: upload, finalize" \
  --data-binary "@${VIDEO_PATH}" 2> /dev/null > file_info.json

file_uri=$(jq -r ".file.uri" file_info.json)

# 2) 使用上传后的 file_uri 进行视频理解
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \
    -H "x-goog-api-key: $GEMINI_API_KEY" \
    -H 'Content-Type: application/json' \
    -X POST \
    -d '{
      "contents": [{
        "parts":[
          {"file_data":{"mime_type": "'"${MIME_TYPE}"'", "file_uri": "'"${file_uri}"'"}},
          {"text": "Summarize this video in 50 Chinese characters."}]
        }]
      }' 2> /dev/null | jq -r ".candidates[].content.parts[].text"
```

#### 响应示例（节选）
```json
{ "candidates": [{ "content": { "parts": [{ "text": "视频展示了新品功能与核心卖点..." }] } }] }
```

### 10. 音频理解 (Audio Understanding)
- **功能描述**: 解析和理解音频内容，提取关键信息
- **文档地址**: https://ai.google.dev/gemini-api/docs/audio
- **支持特性**: 语音识别、情感分析、音乐理解

#### 示例（语音转写 + 情感）
```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d '{
    "contents": [{
      "parts": [
        { "inlineData": { "mimeType": "audio/wav", "data": "UklGRiQAAABXQVZFZm10IBAAAAABAAEA..." } },
        { "text": "请将音频转写为文字，并输出说话者情绪（中文）。" }
      ]
    }]
  }'
```

#### 响应示例（节选）
```json
{
  "candidates": [
    { "content": { "parts": [{ "text": "转写：...\n情绪：积极/中性/消极" }] } }
  ]
}
```

## 工具与集成

### 11. 函数调用 (Function Calling)
- **功能描述**: 在生成内容过程中调用外部函数或工具
- **文档地址**: https://ai.google.dev/gemini-api/docs/function-calling
- **支持特性**: 工具声明、参数验证、结果处理

#### 示例（工具声明 + 调用）
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

模型可能返回要求调用 `get_weather` 的内容（节选）：

```json
{
  "candidates": [
    {
      "content": {
        "parts": [
          { "functionCall": { "name": "get_weather", "args": { "city": "上海" } } }
        ]
      }
    }
  ]
}
```

随后将外部函数结果回传：

```json
POST ...:generateContent
{
  "tools": [{ "functionDeclarations": [...] }],
  "contents": [
    { "parts": [{ "text": "帮我查下上海的天气" }] },
    { "role": "tool", "parts": [{ "functionResponse": { "name": "get_weather", "response": { "temp": 28, "condition": "多云" } } }] }
  ]
}
```

### 12. Google搜索集成 (Google Search)
- **功能描述**: 在生成内容时集成Google搜索结果，提供实时信息
- **文档地址**: https://ai.google.dev/gemini-api/docs/google-search
- **支持特性**: 实时搜索、结果验证、引用来源

#### 示例（启用Google检索增强）
```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d '{
    "tools": [ { "googleSearch": { "enableAttribution": true } } ],
    "contents": [ { "parts": [{ "text": "最新的Llama模型版本与发布时间？请附引用。" }] } ]
  }'
```

#### 响应示例（节选，含引用）
```json
{
  "candidates": [
    {
      "groundingAttributions": [
        { "source": { "uri": "https://ai.meta.com/...", "title": "Meta AI Blog" } }
      ],
      "content": { "parts": [{ "text": "Llama X 发布于... (参考: Meta AI Blog)" }] }
    }
  ]
}
```

### 13. 代码执行 (Code Execution)
- **功能描述**: 在生成内容过程中执行代码片段，获取实时结果
- **文档地址**: https://ai.google.dev/gemini-api/docs/code-execution
- **支持语言**: Python、JavaScript、SQL等

#### 示例（内置沙箱执行）
```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d '{
    "tools": [ { "codeExecution": { "languages": ["python"] } } ],
    "contents": [ { "parts": [{ "text": "执行Python：计算前100个质数之和，并返回结果。" }] } ]
  }'
```

#### 响应示例（节选）
```json
{
  "candidates": [
    {
      "content": {
        "parts": [
          { "executableCode": { "language": "python", "code": "..." } },
          { "executionResult": { "output": "24133", "stderr": "" } }
        ]
      }
    }
  ]
}
```

### 14. URL上下文 (URL Context)
- **功能描述**: 使用特定URL的内容作为上下文，生成相关输出
- **文档地址**: https://ai.google.dev/gemini-api/docs/url-context
- **支持特性**: 网页内容提取、链接分析

#### 示例（直接引用URL）
```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d '{
    "contents": [
      {
        "parts": [
          { "text": "阅读以下URL并总结要点：" },
          { "url": { "uri": "https://ai.google.dev/gemini-api/docs/text-generation" } }
        ]
      }
    ]
  }'
```

#### 响应示例（节选）
```json
{ "candidates": [{ "content": { "parts": [{ "text": "页面介绍了文本生成的请求格式、示例与配额..." }] } }] }
```

## 高级功能

### 15. 批处理模式 (Batch Mode)
- **功能描述**: 批量处理大量请求，提高效率
- **文档地址**: https://ai.google.dev/gemini-api/docs/batch-mode
- **支持特性**: 异步处理、成本优化

#### 示例（REST/cURL，Inline 请求方式）
```bash
curl https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:batchGenerateContent \
-H "x-goog-api-key: $GEMINI_API_KEY" \
-X POST \
-H "Content-Type:application/json" \
-d '{
    "batch": {
        "display_name": "my-batch-requests",
        "input_config": {
            "requests": {
                "requests": [
                    {
                        "request": {"contents": [{"parts": [{"text": "Describe the process of photosynthesis."}]}]},
                        "metadata": {"key": "request-1"}
                    },
                    {
                        "request": {"contents": [{"parts": [{"text": "Why is the sky blue?"}]}]},
                        "metadata": {"key": "request-2"}
                    }
                ]
            }
        }
    }
}'
```

#### 轮询作业状态与获取结果
```bash
BATCH_NAME="batches/123456" # 替换为创建返回的名称

curl https://generativelanguage.googleapis.com/v1beta/$BATCH_NAME \
-H "x-goog-api-key: $GEMINI_API_KEY" \
-H "Content-Type:application/json" 2> /dev/null > batch_status.json

batch_state=$(jq -r '.metadata.state' batch_status.json)
if [[ $batch_state = "JOB_STATE_SUCCEEDED" ]]; then
  if [[ $(jq '.response | has("inlinedResponses")' batch_status.json) = "true" ]]; then
    jq -r '.response.inlinedResponses' batch_status.json
  else
    responses_file_name=$(jq -r '.response.responsesFile' batch_status.json)
    curl https://generativelanguage.googleapis.com/download/v1beta/$responses_file_name:download?alt=media \
      -H "x-goog-api-key: $GEMINI_API_KEY" 2> /dev/null
  fi
fi
```

#### 取消与删除
```bash
# 取消
curl https://generativelanguage.googleapis.com/v1beta/$BATCH_NAME:cancel \
  -H "x-goog-api-key: $GEMINI_API_KEY"

# 删除
curl https://generativelanguage.googleapis.com/v1beta/$BATCH_NAME:delete \
  -H "x-goog-api-key: $GEMINI_API_KEY"
```

### 16. 上下文缓存 (Context Caching)
- **功能描述**: 缓存重复的上下文内容，减少token消耗
- **文档地址**: https://ai.google.dev/gemini-api/docs/caching
- **支持特性**: 智能缓存、成本节省

#### 示例（创建缓存 + 复用）
```bash
curl "https://generativelanguage.googleapis.com/v1beta/cachedContents?key=$GEMINI_API_KEY" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d '{
    "contents": [{ "parts": [{ "text": "[固定上下文内容，较长文本]" }] }],
    "ttlSeconds": 86400
  }'
```

生成内容时复用：

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d '{
    "cachedContent": { "cacheId": "cachedContents/abc123" },
    "contents": [{ "parts": [{ "text": "基于缓存上下文回答：..." }] }]
  }'
```

### 17. 文件API (Files API)
- **功能描述**: 上传和管理文件，支持多种格式
- **文档地址**: https://ai.google.dev/gemini-api/docs/files
- **支持格式**: 图片、文档、音频、视频

#### 示例（上传与列出）
```bash
# 简单上传（小文件）
curl "https://generativelanguage.googleapis.com/v1beta/files:upload?key=$GEMINI_API_KEY" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d '{
    "file": { "displayName": "image.png", "mimeType": "image/png", "data": "iVBORw0K..." }
  }'

# 列出文件
curl "https://generativelanguage.googleapis.com/v1beta/files?key=$GEMINI_API_KEY"
```

#### 响应示例（节选）
```json
{
  "files": [ { "uri": "uploaded-files/image.png", "mimeType": "image/png" } ]
}
```

### 18. Token计数 (Token Counting)
- **功能描述**: 精确计算输入和输出的token数量
- **文档地址**: https://ai.google.dev/gemini-api/docs/tokens
- **支持特性**: 实时计数、成本预估

#### 示例（计数一个提示的Token）
```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:countTokens" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d '{
    "contents": [{ "parts": [{ "text": "简述Transformer的自注意力机制。" }] }]
  }'
```

#### 响应示例
```json
{ "totalTokens": 23 }
```

### 19. 提示工程 (Prompt Engineering)
- **功能描述**: 优化提示词设计，提升模型性能
- **文档地址**: https://ai.google.dev/gemini-api/docs/prompting-strategies
- **支持特性**: 最佳实践、示例模板

#### 示例（少样本提示）
```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H 'Content-Type: application/json' \
  -X POST \
  -d '{
    "contents": [
      { "parts": [{ "text": "将句子按情感分类：\n例1：我今天超开心 → 积极\n例2：这事让我很烦 → 消极\n现在请分类：这还行吧。" }] }
    ],
    "generationConfig": { "temperature": 0.2 }
  }'
```

#### 响应示例（节选）
```json
{ "candidates": [{ "content": { "parts": [{ "text": "中性" }] } }] }
```


## 模型系列

### Gemini 2.5 系列
- **Gemini 2.5 Pro**: 最高性能，支持复杂推理和长上下文
  - 输入: 音频、图像、视频、文本、PDF  
  - 输出: 文本
- **Gemini 2.5 Flash**: 平衡性能和速度，适合大多数应用
  - 输入: 音频、图像、视频、文本  
  - 输出: 文本
- **Gemini 2.5 Flash-Lite**: 轻量级版本，快速响应
  - 输入: 文本、图像、视频、音频  
  - 输出: 文本

### Gemini 2.0 系列
- **Gemini 2.0 Flash**: 新一代快速模型
  - 输入: 音频、图像、视频、文本  
  - 输出: 文本
- **Gemini 2.0 Flash-Lite**: 超轻量级版本
  - 输入: 音频、图像、视频、文本  
  - 输出: 文本

## 速率限制参考

### 免费层限制（每个API密钥）
| 模型 | RPM | TPM | RPD |
|------|-----|-----|-----|
| Gemini 2.5 Pro | 5 | 250,000 | 100 |
| Gemini 2.5 Flash | 10 | 250,000 | 250 |
| Gemini 2.5 Flash-Lite | 15 | 250,000 | 1,000 |
| Gemini 2.0 Flash | 15 | 1,000,000 | 200 |
| Gemini 2.0 Flash-Lite | 30 | 1,000,000 | 200 |

**说明**:
- RPM: 每分钟请求数 (Requests Per Minute)
- TPM: 每分钟Token数 (Tokens Per Minute)  
- RPD: 每天请求数 (Requests Per Day)
- *: 无限制

## 使用建议

1. **多API密钥策略**: 使用多个API密钥可以有效提升总体请求限制
2. **模型选择**: 根据任务复杂度选择合适的模型
3. **成本优化**: 利用上下文缓存和批处理模式降低成本
4. **安全配置**: 根据应用场景配置适当的安全设置
5. **错误处理**: 实现完善的错误处理和重试机制

---

**注意**: 以上功能列表基于官方文档整理，部分功能可能仍在开发中或需要特定权限。建议访问官方文档获取最新信息和详细使用说明。

**最后更新**: 2025年1月
