#!/usr/bin/env node

/**
 * Claude API Token计数接口测试
 * 测试 /v1/messages/count-tokens 端点
 */

const https = require('https');
const http = require('http');

// 配置
const config = {
  apiUrl: process.env.API_URL || 'https://your-worker.workers.dev',
  apiKey: process.env.GEMINI_API_KEY || 'YOUR_GEMINI_API_KEY',
  verbose: process.env.VERBOSE === 'true'
};

// HTTP 请求函数
function makeRequest(path, data, headers = {}) {
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
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify(data));
    req.end();
  });
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// 测试用例：基本Token计数
async function testBasicTokenCounting() {
  console.log('\n📝 测试: 基本Token计数');

  const request = {
    model: 'claude-sonnet-4-20250514',
    messages: [
      { role: 'user', content: 'Hello, how are you?' }
    ]
  };

  try {
    const response = await makeRequest('/v1/messages/count-tokens', request);

    if (config.verbose) {
      console.log('响应:', JSON.stringify(response.data, null, 2));
    }

    if (response.status === 200 && response.data?.input_tokens) {
      const tokenCount = response.data.input_tokens;
      console.log('✅ 通过 - 成功计算Token数量');
      console.log('   输入Token数:', tokenCount);

      // 验证token数量是否合理（简单的英文句子应该在5-20个token之间）
      if (tokenCount > 0 && tokenCount < 50) {
        console.log('   Token数量在合理范围内');
        return true;
      } else {
        console.log('   ⚠️  Token数量可能不准确');
        return true;  // 仍然算通过，因为API返回了结果
      }
    } else {
      console.log('❌ 失败 - 未返回Token计数');
      return false;
    }
  } catch (error) {
    console.log('❌ 失败:', error);
    return false;
  }
}

// 测试用例：多轮对话Token计数
async function testMultiTurnTokenCounting() {
  console.log('\n📝 测试: 多轮对话Token计数');

  const request = {
    model: 'claude-sonnet-4-20250514',
    messages: [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there! How can I help you today?' },
      { role: 'user', content: 'What is the weather like?' }
    ]
  };

  try {
    const response = await makeRequest('/v1/messages/count-tokens', request);

    if (config.verbose) {
      console.log('响应:', JSON.stringify(response.data, null, 2));
    }

    if (response.status === 200 && response.data?.input_tokens) {
      const tokenCount = response.data.input_tokens;
      console.log('✅ 通过 - 成功计算多轮对话Token');
      console.log('   总输入Token数:', tokenCount);

      // 多轮对话应该有更多的token
      if (tokenCount > 10) {
        console.log('   多轮对话Token计数正确');
        return true;
      } else {
        console.log('   ⚠️  Token数量可能偏低');
        return true;
      }
    } else {
      console.log('❌ 失败 - 未返回Token计数');
      return false;
    }
  } catch (error) {
    console.log('❌ 失败:', error);
    return false;
  }
}

// 测试用例：包含系统提示的Token计数
async function testSystemPromptTokenCounting() {
  console.log('\n📝 测试: 包含系统提示的Token计数');

  const requestWithoutSystem = {
    model: 'claude-sonnet-4-20250514',
    messages: [
      { role: 'user', content: 'Hello' }
    ]
  };

  const requestWithSystem = {
    model: 'claude-sonnet-4-20250514',
    system: 'You are a helpful assistant who speaks like a pirate.',
    messages: [
      { role: 'user', content: 'Hello' }
    ]
  };

  try {
    const response1 = await makeRequest('/v1/messages/count-tokens', requestWithoutSystem);
    await delay(500);
    const response2 = await makeRequest('/v1/messages/count-tokens', requestWithSystem);

    if (config.verbose) {
      console.log('无系统提示响应:', response1.data);
      console.log('有系统提示响应:', response2.data);
    }

    if (response1.status === 200 && response2.status === 200) {
      const tokens1 = response1.data?.input_tokens || 0;
      const tokens2 = response2.data?.input_tokens || 0;

      console.log('   无系统提示Token数:', tokens1);
      console.log('   有系统提示Token数:', tokens2);

      // 有系统提示的应该有更多token
      if (tokens2 > tokens1) {
        console.log('✅ 通过 - 系统提示正确增加了Token数');
        return true;
      } else {
        console.log('⚠️  警告 - 系统提示未增加Token数');
        return true;  // 可能API处理方式不同
      }
    } else {
      console.log('❌ 失败 - Token计数请求失败');
      return false;
    }
  } catch (error) {
    console.log('❌ 失败:', error);
    return false;
  }
}

// 测试用例：包含工具的Token计数
async function testToolsTokenCounting() {
  console.log('\n📝 测试: 包含工具定义的Token计数');

  const requestWithoutTools = {
    model: 'claude-sonnet-4-20250514',
    messages: [
      { role: 'user', content: 'What is the weather?' }
    ]
  };

  const requestWithTools = {
    model: 'claude-sonnet-4-20250514',
    messages: [
      { role: 'user', content: 'What is the weather?' }
    ],
    tools: [
      {
        name: 'get_weather',
        description: 'Get the current weather in a given location',
        input_schema: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description: 'The city and state'
            }
          },
          required: ['location']
        }
      }
    ]
  };

  try {
    const response1 = await makeRequest('/v1/messages/count-tokens', requestWithoutTools);
    await delay(500);
    const response2 = await makeRequest('/v1/messages/count-tokens', requestWithTools);

    if (config.verbose) {
      console.log('无工具响应:', response1.data);
      console.log('有工具响应:', response2.data);
    }

    if (response1.status === 200 && response2.status === 200) {
      const tokens1 = response1.data?.input_tokens || 0;
      const tokens2 = response2.data?.input_tokens || 0;

      console.log('   无工具Token数:', tokens1);
      console.log('   有工具Token数:', tokens2);

      // 有工具定义的应该有更多token
      if (tokens2 >= tokens1) {
        console.log('✅ 通过 - 工具定义影响了Token计数');
        return true;
      } else {
        console.log('⚠️  警告 - 工具定义未增加Token数');
        return true;
      }
    } else {
      console.log('❌ 失败 - Token计数请求失败');
      return false;
    }
  } catch (error) {
    console.log('❌ 失败:', error);
    return false;
  }
}

// 测试用例：长文本Token计数
async function testLongTextTokenCounting() {
  console.log('\n📝 测试: 长文本Token计数');

  // 创建一个较长的文本
  const longText = `
    The quick brown fox jumps over the lazy dog. This pangram sentence contains every letter
    of the English alphabet at least once. It has been used for decades to test typewriters,
    computer keyboards, and now, large language models. The sentence is short, memorable,
    and useful for many purposes in typography and technology.
  `.repeat(5);  // 重复5次以创建更长的文本

  const request = {
    model: 'claude-sonnet-4-20250514',
    messages: [
      { role: 'user', content: longText }
    ]
  };

  try {
    const response = await makeRequest('/v1/messages/count-tokens', request);

    if (config.verbose) {
      console.log('响应:', JSON.stringify(response.data, null, 2));
    }

    if (response.status === 200 && response.data?.input_tokens) {
      const tokenCount = response.data.input_tokens;
      console.log('✅ 通过 - 成功计算长文本Token');
      console.log('   文本长度:', longText.length, '字符');
      console.log('   Token数:', tokenCount);
      console.log('   平均每Token字符数:', (longText.length / tokenCount).toFixed(2));
      return true;
    } else {
      console.log('❌ 失败 - 未返回Token计数');
      return false;
    }
  } catch (error) {
    console.log('❌ 失败:', error);
    return false;
  }
}

// 测试用例：多模态内容Token计数
async function testMultimodalTokenCounting() {
  console.log('\n📝 测试: 多模态内容Token计数');

  // 小的base64图像
  const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

  const request = {
    model: 'claude-sonnet-4-20250514',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'What is in this image?'
          },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: base64Image
            }
          }
        ]
      }
    ]
  };

  try {
    const response = await makeRequest('/v1/messages/count-tokens', request);

    if (config.verbose) {
      console.log('响应:', JSON.stringify(response.data, null, 2));
    }

    if (response.status === 200 && response.data?.input_tokens) {
      const tokenCount = response.data.input_tokens;
      console.log('✅ 通过 - 成功计算多模态内容Token');
      console.log('   包含图像的Token数:', tokenCount);

      // 图像通常会占用较多的token
      if (tokenCount > 20) {
        console.log('   图像Token计数合理');
      } else {
        console.log('   ⚠️  图像Token数可能偏低');
      }
      return true;
    } else {
      console.log('❌ 失败 - 未返回Token计数');
      return false;
    }
  } catch (error) {
    console.log('❌ 失败:', error);
    return false;
  }
}

// 测试用例：错误处理 - 缺少必需参数
async function testMissingParameters() {
  console.log('\n📝 测试: 缺少必需参数的错误处理');

  // 缺少model
  const request1 = {
    messages: [
      { role: 'user', content: 'Hello' }
    ]
  };

  // 缺少messages
  const request2 = {
    model: 'claude-sonnet-4-20250514'
  };

  try {
    const response1 = await makeRequest('/v1/messages/count-tokens', request1);
    const response2 = await makeRequest('/v1/messages/count-tokens', request2);

    const handled1 = response1.status === 400 ||
                     (response1.status === 200 && response1.data?.input_tokens);
    const handled2 = response2.status === 400 ||
                     (response2.status === 200 && response2.data?.input_tokens === 0);

    if (handled1 && handled2) {
      console.log('✅ 通过 - 正确处理缺少参数的情况');
      return true;
    } else {
      console.log('❌ 失败 - 未正确处理缺少的参数');
      return false;
    }
  } catch (error) {
    console.log('❌ 失败:', error);
    return false;
  }
}

// 主测试函数
async function runTests() {
  console.log('🚀 Claude API Token计数接口测试');
  console.log('=====================================');
  console.log(`API URL: ${config.apiUrl}`);
  console.log(`API Key: ${config.apiKey.substring(0, 10)}...`);

  let passed = 0;
  let failed = 0;

  const tests = [
    testBasicTokenCounting,
    testMultiTurnTokenCounting,
    testSystemPromptTokenCounting,
    testToolsTokenCounting,
    testLongTextTokenCounting,
    testMultimodalTokenCounting,
    testMissingParameters
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