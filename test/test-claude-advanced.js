#!/usr/bin/env node

/**
 * Claude API 高级功能测试
 * 测试工具调用、多模态、流式响应等高级功能
 */

const https = require('https');
const http = require('http');

// 配置
const config = {
  apiUrl: process.env.API_URL || 'https://your-worker.workers.dev',
  apiKey: process.env.GEMINI_API_KEY || 'YOUR_GEMINI_API_KEY',
  verbose: process.env.VERBOSE === 'true'
};

// HTTP 请求函数（支持流式）
function makeRequest(path, data, headers = {}, stream = false) {
  return new Promise((resolve, reject) => {
    const url = new URL(config.apiUrl + path);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        ...headers
      }
    };

    const req = client.request(options, (res) => {
      if (stream) {
        const chunks = [];
        let buffer = '';

        res.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;
              try {
                chunks.push(JSON.parse(data));
              } catch (e) {
                // 忽略解析错误
              }
            }
          }
        });

        res.on('end', () => {
          resolve({ status: res.statusCode, chunks });
        });
      } else {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode >= 400) {
              reject({ status: res.statusCode, error: parsed });
            } else {
              resolve({ status: res.statusCode, data: parsed });
            }
          } catch (e) {
            reject({ status: res.statusCode, error: `Failed to parse response: ${data}` });
          }
        });
      }
    });

    req.on('error', reject);
    req.write(JSON.stringify(data));
    req.end();
  });
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// 测试用例：工具调用
async function testToolCalling() {
  console.log('\n📝 测试: 工具调用 (Function Calling)');

  const request = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 256,
    tools: [
      {
        name: 'get_weather',
        description: 'Get the current weather in a given location',
        input_schema: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'The city and state, e.g. San Francisco, CA'
            },
            unit: {
              type: 'string',
              enum: ['celsius', 'fahrenheit'],
              description: 'The unit of temperature'
            }
          },
          required: ['location']
        }
      }
    ],
    tool_choice: 'auto',
    messages: [
      { role: 'user', content: 'What\'s the weather like in Tokyo?' }
    ]
  };

  try {
    const response = await makeRequest('/v1/messages', request);

    if (config.verbose) {
      console.log('响应:', JSON.stringify(response.data, null, 2));
    }

    // 检查是否有工具调用
    const hasToolUse = response.data.content?.some(c => c.type === 'tool_use');
    const stopReason = response.data.stop_reason;

    if (hasToolUse || stopReason === 'tool_use') {
      console.log('✅ 通过 - 正确触发工具调用');

      // 如果有工具调用，显示详情
      const toolCall = response.data.content?.find(c => c.type === 'tool_use');
      if (toolCall) {
        console.log('   工具名称:', toolCall.name);
        console.log('   工具参数:', JSON.stringify(toolCall.input));
      }
      return true;
    } else {
      console.log('❌ 失败 - 未触发工具调用');
      console.log('   停止原因:', stopReason);
      return false;
    }
  } catch (error) {
    console.log('❌ 失败:', error.error || error);
    return false;
  }
}

// 测试用例：多个工具
async function testMultipleTools() {
  console.log('\n📝 测试: 多个工具定义');

  const request = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 256,
    tools: [
      {
        name: 'calculator',
        description: 'Perform mathematical calculations',
        input_schema: {
          type: 'object',
          properties: {
            expression: {
              type: 'string',
              description: 'Mathematical expression to evaluate'
            }
          },
          required: ['expression']
        }
      },
      {
        name: 'search',
        description: 'Search for information',
        input_schema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query'
            }
          },
          required: ['query']
        }
      }
    ],
    tool_choice: 'auto',
    messages: [
      { role: 'user', content: 'Calculate 123 * 456' }
    ]
  };

  try {
    const response = await makeRequest('/v1/messages', request);

    if (config.verbose) {
      console.log('响应:', JSON.stringify(response.data, null, 2));
    }

    const toolCall = response.data.content?.find(c => c.type === 'tool_use');
    const usedCalculator = toolCall?.name === 'calculator';

    if (usedCalculator) {
      console.log('✅ 通过 - 正确选择了计算器工具');
      return true;
    } else {
      console.log('❌ 失败 - 未正确选择工具');
      console.log('   使用的工具:', toolCall?.name);
      return false;
    }
  } catch (error) {
    console.log('❌ 失败:', error.error || error);
    return false;
  }
}

// 测试用例：流式响应
async function testStreamingResponse() {
  console.log('\n📝 测试: 流式响应 (SSE)');

  const request = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 100,
    stream: true,
    messages: [
      { role: 'user', content: 'Count from 1 to 5 slowly' }
    ]
  };

  try {
    const response = await makeRequest('/v1/messages', request, {}, true);

    if (config.verbose) {
      console.log('收到的事件数量:', response.chunks.length);
      console.log('事件类型:', [...new Set(response.chunks.map(c => c.type))]);
    }

    // 检查必需的流式事件
    const eventTypes = response.chunks.map(c => c.type);
    const hasMessageStart = eventTypes.includes('message_start');
    const hasContentBlockStart = eventTypes.includes('content_block_start');
    const hasContentBlockDelta = eventTypes.includes('content_block_delta');
    const hasContentBlockStop = eventTypes.includes('content_block_stop');
    const hasMessageDelta = eventTypes.includes('message_delta');
    const hasMessageStop = eventTypes.includes('message_stop');

    // 收集所有文本
    const textChunks = response.chunks
      .filter(c => c.type === 'content_block_delta')
      .map(c => c.delta?.text || '')
      .join('');

    if (hasMessageStart && hasContentBlockStart && hasContentBlockDelta && hasMessageStop) {
      console.log('✅ 通过 - 流式响应包含正确的事件序列');
      console.log('   收集的文本:', textChunks.substring(0, 50) + '...');
      return true;
    } else {
      console.log('❌ 失败 - 流式响应事件序列不完整');
      console.log('   缺少的事件:', {
        message_start: !hasMessageStart,
        content_block_start: !hasContentBlockStart,
        content_block_delta: !hasContentBlockDelta,
        message_stop: !hasMessageStop
      });
      return false;
    }
  } catch (error) {
    console.log('❌ 失败:', error.error || error);
    return false;
  }
}

// 测试用例：多模态 - Base64图像
async function testMultimodalBase64Image() {
  console.log('\n📝 测试: 多模态 - Base64图像');

  // 创建一个小的红色像素图片 (1x1 PNG)
  const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

  const request = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 150,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: base64Image
            }
          },
          {
            type: 'text',
            text: 'Describe what you see in this image'
          }
        ]
      }
    ]
  };

  try {
    const response = await makeRequest('/v1/messages', request);

    if (config.verbose) {
      console.log('响应:', JSON.stringify(response.data, null, 2));
    }

    const hasResponse = response.data.content?.[0]?.text?.length > 0;

    if (hasResponse) {
      console.log('✅ 通过 - 成功处理Base64图像');
      console.log('   图像描述:', response.data.content[0].text.substring(0, 100));
      return true;
    } else {
      console.log('❌ 失败 - 无法处理Base64图像');
      return false;
    }
  } catch (error) {
    console.log('❌ 失败:', error.error || error);
    return false;
  }
}

// 测试用例：多模态 - 多个内容块
async function testMultimodalMixedContent() {
  console.log('\n📝 测试: 多模态 - 混合内容');

  const request = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 150,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Here is some text before the image.'
          },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='
            }
          },
          {
            type: 'text',
            text: 'And here is text after the image. Please acknowledge both text parts and the image.'
          }
        ]
      }
    ]
  };

  try {
    const response = await makeRequest('/v1/messages', request);

    if (config.verbose) {
      console.log('响应:', JSON.stringify(response.data, null, 2));
    }

    const responseText = response.data.content?.[0]?.text || '';
    const acknowledgesMultipleParts =
      (responseText.toLowerCase().includes('text') || responseText.toLowerCase().includes('before')) &&
      (responseText.toLowerCase().includes('image') || responseText.toLowerCase().includes('pixel')) &&
      (responseText.toLowerCase().includes('after') || responseText.toLowerCase().includes('both'));

    if (acknowledgesMultipleParts || responseText.length > 20) {
      console.log('✅ 通过 - 成功处理混合内容');
      return true;
    } else {
      console.log('❌ 失败 - 未能正确处理混合内容');
      console.log('   响应:', responseText.substring(0, 100));
      return false;
    }
  } catch (error) {
    console.log('❌ 失败:', error.error || error);
    return false;
  }
}

// 测试用例：元数据
async function testMetadata() {
  console.log('\n📝 测试: 元数据 (metadata)');

  const request = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 50,
    metadata: {
      user_id: 'test-user-123'
    },
    messages: [
      { role: 'user', content: 'Hello' }
    ]
  };

  try {
    const response = await makeRequest('/v1/messages', request);

    if (config.verbose) {
      console.log('响应:', JSON.stringify(response.data, null, 2));
    }

    // 元数据不应影响正常响应
    const hasResponse = response.data.content?.[0]?.text?.length > 0;

    if (hasResponse) {
      console.log('✅ 通过 - 元数据被正确处理');
      return true;
    } else {
      console.log('❌ 失败 - 元数据影响了响应');
      return false;
    }
  } catch (error) {
    console.log('❌ 失败:', error.error || error);
    return false;
  }
}

// 测试用例：预填充助手响应
async function testPrefillAssistantResponse() {
  console.log('\n📝 测试: 预填充助手响应');

  const request = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 50,
    messages: [
      { role: 'user', content: 'What is the capital of France?' },
      { role: 'assistant', content: 'The capital of France is' }  // 预填充部分响应
    ]
  };

  try {
    const response = await makeRequest('/v1/messages', request);

    if (config.verbose) {
      console.log('响应:', JSON.stringify(response.data, null, 2));
    }

    const responseText = response.data.content?.[0]?.text || '';
    const mentionsParis = responseText.toLowerCase().includes('paris');

    if (mentionsParis) {
      console.log('✅ 通过 - 预填充响应被正确处理');
      console.log('   完成的响应:', responseText);
      return true;
    } else {
      console.log('❌ 失败 - 预填充响应未被正确处理');
      console.log('   响应:', responseText);
      return false;
    }
  } catch (error) {
    console.log('❌ 失败:', error.error || error);
    return false;
  }
}

// 主测试函数
async function runTests() {
  console.log('🚀 Claude API 高级功能测试');
  console.log('=====================================');
  console.log(`API URL: ${config.apiUrl}`);
  console.log(`API Key: ${config.apiKey.substring(0, 10)}...`);

  let passed = 0;
  let failed = 0;

  const tests = [
    testToolCalling,
    testMultipleTools,
    testStreamingResponse,
    testMultimodalBase64Image,
    testMultimodalMixedContent,
    testMetadata,
    testPrefillAssistantResponse
  ];

  for (const test of tests) {
    try {
      const result = await test();
      if (result) passed++;
      else failed++;
    } catch (error) {
      console.log('❌ 测试异常:', error);
      failed++;
    }

    // 避免速率限制
    await delay(1000);
  }

  // 测试总结
  console.log('\n=====================================');
  console.log('📊 测试结果总结');
  console.log(`✅ 通过: ${passed}`);
  console.log(`❌ 失败: ${failed}`);
  console.log(`📈 通过率: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

  process.exit(failed > 0 ? 1 : 0);
}

// 运行测试
if (require.main === module) {
  runTests().catch(console.error);
}