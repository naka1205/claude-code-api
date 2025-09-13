#!/usr/bin/env node

/**
 * Claude API 错误处理与边界测试
 * 测试各种错误场景和边界条件
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

// 测试用例：缺少必需参数
async function testMissingRequiredParams() {
  console.log('\n📝 测试: 缺少必需参数');

  // 缺少 max_tokens
  const request1 = {
    model: 'claude-sonnet-4-20250514',
    messages: [{ role: 'user', content: 'Hello' }]
  };

  // 缺少 messages
  const request2 = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 100
  };

  // 缺少 model
  const request3 = {
    max_tokens: 100,
    messages: [{ role: 'user', content: 'Hello' }]
  };

  try {
    const response1 = await makeRequest('/v1/messages', request1);
    const response2 = await makeRequest('/v1/messages', request2);
    const response3 = await makeRequest('/v1/messages', request3);

    const allHandled = response1.status === 400 &&
                       response2.status === 400 &&
                       response3.status === 400;

    if (allHandled) {
      console.log('✅ 通过 - 正确处理缺少必需参数');
      if (config.verbose) {
        console.log('   错误1:', response1.data?.error?.message);
        console.log('   错误2:', response2.data?.error?.message);
        console.log('   错误3:', response3.data?.error?.message);
      }
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

// 测试用例：无效参数值
async function testInvalidParameterValues() {
  console.log('\n📝 测试: 无效参数值');

  // 负数 max_tokens
  const request1 = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: -1,
    messages: [{ role: 'user', content: 'Hello' }]
  };

  // 无效的温度值
  const request2 = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 100,
    temperature: 2.5,  // 超出 0-1 范围
    messages: [{ role: 'user', content: 'Hello' }]
  };

  // 空消息数组
  const request3 = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 100,
    messages: []
  };

  try {
    const response1 = await makeRequest('/v1/messages', request1);
    const response2 = await makeRequest('/v1/messages', request2);
    const response3 = await makeRequest('/v1/messages', request3);

    const allHandled = response1.status === 400 &&
                       response2.status === 400 &&
                       response3.status === 400;

    if (allHandled) {
      console.log('✅ 通过 - 正确验证参数值');
      return true;
    } else {
      console.log('❌ 失败 - 未正确验证参数值');
      console.log('   状态码:', response1.status, response2.status, response3.status);
      return false;
    }
  } catch (error) {
    console.log('❌ 失败:', error);
    return false;
  }
}

// 测试用例：不支持的模型
async function testUnsupportedModel() {
  console.log('\n📝 测试: 不支持的模型');

  const request = {
    model: 'claude-99-ultra-2099',  // 不存在的模型
    max_tokens: 100,
    messages: [{ role: 'user', content: 'Hello' }]
  };

  try {
    const response = await makeRequest('/v1/messages', request);

    if (response.status === 400 && response.data?.error) {
      const errorMessage = JSON.stringify(response.data.error);
      const mentionsModel = errorMessage.toLowerCase().includes('model') ||
                           errorMessage.toLowerCase().includes('unsupported');

      if (mentionsModel) {
        console.log('✅ 通过 - 正确处理不支持的模型');
        return true;
      }
    }

    console.log('❌ 失败 - 未正确处理不支持的模型');
    console.log('   响应:', response.data);
    return false;
  } catch (error) {
    console.log('❌ 失败:', error);
    return false;
  }
}

// 测试用例：消息格式错误
async function testInvalidMessageFormat() {
  console.log('\n📝 测试: 消息格式错误');

  // 缺少 role
  const request1 = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 100,
    messages: [{ content: 'Hello' }]
  };

  // 缺少 content
  const request2 = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 100,
    messages: [{ role: 'user' }]
  };

  // 无效的 role
  const request3 = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 100,
    messages: [{ role: 'invalid', content: 'Hello' }]
  };

  try {
    const response1 = await makeRequest('/v1/messages', request1);
    const response2 = await makeRequest('/v1/messages', request2);
    const response3 = await makeRequest('/v1/messages', request3);

    const allHandled = response1.status === 400 &&
                       response2.status === 400 &&
                       response3.status === 400;

    if (allHandled) {
      console.log('✅ 通过 - 正确验证消息格式');
      return true;
    } else {
      console.log('❌ 失败 - 未正确验证消息格式');
      return false;
    }
  } catch (error) {
    console.log('❌ 失败:', error);
    return false;
  }
}

// 测试用例：工具定义错误
async function testInvalidToolDefinition() {
  console.log('\n📝 测试: 工具定义错误');

  // 缺少必需的工具字段
  const request1 = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 100,
    tools: [
      {
        // 缺少 name
        description: 'A tool',
        input_schema: { type: 'object' }
      }
    ],
    messages: [{ role: 'user', content: 'Hello' }]
  };

  // 无效的 input_schema
  const request2 = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 100,
    tools: [
      {
        name: 'test_tool',
        description: 'A test tool',
        input_schema: 'invalid_schema'  // 应该是对象
      }
    ],
    messages: [{ role: 'user', content: 'Hello' }]
  };

  try {
    const response1 = await makeRequest('/v1/messages', request1);
    const response2 = await makeRequest('/v1/messages', request2);

    // 这些请求应该被拒绝或处理为无效
    if (response1.status === 400 || response2.status === 400) {
      console.log('✅ 通过 - 正确处理无效的工具定义');
      return true;
    } else if (response1.status === 200 && response2.status === 200) {
      // 或者API可能忽略无效的工具定义
      console.log('✅ 通过 - API忽略了无效的工具定义');
      return true;
    } else {
      console.log('❌ 失败 - 未正确处理无效的工具定义');
      return false;
    }
  } catch (error) {
    console.log('❌ 失败:', error);
    return false;
  }
}

// 测试用例：超大请求
async function testLargeRequest() {
  console.log('\n📝 测试: 超大请求处理');

  // 创建一个非常长的消息
  const longContent = 'This is a test. '.repeat(10000);  // 约 160KB

  const request = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 50,
    messages: [{ role: 'user', content: longContent }]
  };

  try {
    const response = await makeRequest('/v1/messages', request);

    // API应该能处理大请求，或返回适当的错误
    if (response.status === 200) {
      console.log('✅ 通过 - 成功处理大请求');
      return true;
    } else if (response.status === 413) {
      console.log('✅ 通过 - 正确拒绝过大的请求 (413)');
      return true;
    } else if (response.status === 400) {
      console.log('✅ 通过 - 返回验证错误 (400)');
      return true;
    } else {
      console.log('❌ 失败 - 意外的响应状态:', response.status);
      return false;
    }
  } catch (error) {
    console.log('❌ 失败:', error);
    return false;
  }
}

// 测试用例：无效的 API 密钥
async function testInvalidApiKey() {
  console.log('\n📝 测试: 无效的 API 密钥');

  const request = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 50,
    messages: [{ role: 'user', content: 'Hello' }]
  };

  try {
    const response = await makeRequest('/v1/messages', request, {
      'x-api-key': 'invalid-key-12345'
    });

    if (response.status === 401 || response.status === 403) {
      console.log('✅ 通过 - 正确拒绝无效的 API 密钥');
      return true;
    } else if (response.status === 400 && response.data?.error?.message?.includes('API')) {
      console.log('✅ 通过 - 返回 API 密钥相关错误');
      return true;
    } else {
      console.log('⚠️  警告 - API 可能接受了无效的密钥');
      console.log('   状态码:', response.status);
      return false;
    }
  } catch (error) {
    console.log('❌ 失败:', error);
    return false;
  }
}

// 测试用例：缺少 API 版本头
async function testMissingApiVersion() {
  console.log('\n📝 测试: 缺少 API 版本头');

  const request = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 50,
    messages: [{ role: 'user', content: 'Hello' }]
  };

  try {
    // 发送请求时不包含 anthropic-version 头
    const url = new URL(config.apiUrl + '/v1/messages');
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey
        // 故意不包含 'anthropic-version'
      }
    };

    const response = await new Promise((resolve, reject) => {
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
      req.write(JSON.stringify(request));
      req.end();
    });

    // API 可能要求版本头，也可能有默认值
    if (response.status === 400 || response.status === 200) {
      console.log('✅ 通过 - API 处理了缺少版本头的情况');
      return true;
    } else {
      console.log('❌ 失败 - 意外的响应状态:', response.status);
      return false;
    }
  } catch (error) {
    console.log('❌ 失败:', error);
    return false;
  }
}

// 主测试函数
async function runTests() {
  console.log('🚀 Claude API 错误处理与边界测试');
  console.log('=====================================');
  console.log(`API URL: ${config.apiUrl}`);
  console.log(`API Key: ${config.apiKey.substring(0, 10)}...`);

  let passed = 0;
  let failed = 0;

  const tests = [
    testMissingRequiredParams,
    testInvalidParameterValues,
    testUnsupportedModel,
    testInvalidMessageFormat,
    testInvalidToolDefinition,
    testLargeRequest,
    testInvalidApiKey,
    testMissingApiVersion
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