#!/usr/bin/env node

/**
 * Claude API 基础功能测试
 * 测试项目的 Claude -> Gemini 转换逻辑是否正确
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
          if (res.statusCode >= 400) {
            reject({ status: res.statusCode, error: parsed });
          } else {
            resolve({ status: res.statusCode, data: parsed });
          }
        } catch (e) {
          reject({ status: res.statusCode, error: `Failed to parse response: ${data}` });
        }
      });
    });

    req.on('error', reject);
    req.write(JSON.stringify(data));
    req.end();
  });
}

// 延迟函数
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// 测试用例：基本文本生成
async function testBasicTextGeneration() {
  console.log('\n📝 测试: 基本文本生成');

  const request = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 100,
    messages: [
      { role: 'user', content: 'Reply with exactly: "Hello from Claude API test"' }
    ]
  };

  try {
    const response = await makeRequest('/v1/messages', request);

    if (config.verbose) {
      console.log('响应:', JSON.stringify(response.data, null, 2));
    }

    const hasCorrectStructure =
      response.data.id &&
      response.data.type === 'message' &&
      response.data.role === 'assistant' &&
      response.data.content &&
      Array.isArray(response.data.content) &&
      response.data.content[0]?.type === 'text';

    const hasExpectedContent = response.data.content?.[0]?.text?.includes('Hello from Claude API test');

    if (hasCorrectStructure && hasExpectedContent) {
      console.log('✅ 通过 - 响应结构正确，内容符合预期');
      return true;
    } else {
      console.log('❌ 失败 - 响应结构或内容不正确');
      console.log('实际响应:', response.data.content?.[0]?.text?.substring(0, 100));
      return false;
    }
  } catch (error) {
    console.log('❌ 失败:', error.error || error);
    return false;
  }
}

// 测试用例：多轮对话
async function testMultiTurnConversation() {
  console.log('\n📝 测试: 多轮对话');

  const request = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 150,
    messages: [
      { role: 'user', content: 'My favorite number is 73. Remember it.' },
      { role: 'assistant', content: 'I\'ll remember that your favorite number is 73.' },
      { role: 'user', content: 'What is my favorite number?' }
    ]
  };

  try {
    const response = await makeRequest('/v1/messages', request);

    if (config.verbose) {
      console.log('响应:', JSON.stringify(response.data, null, 2));
    }

    const mentions73 = response.data.content?.[0]?.text?.includes('73');

    if (mentions73) {
      console.log('✅ 通过 - 正确维持多轮对话上下文');
      return true;
    } else {
      console.log('❌ 失败 - 未能正确维持上下文');
      console.log('实际响应:', response.data.content?.[0]?.text?.substring(0, 100));
      return false;
    }
  } catch (error) {
    console.log('❌ 失败:', error.error || error);
    return false;
  }
}

// 测试用例：系统提示词
async function testSystemPrompt() {
  console.log('\n📝 测试: 系统提示词');

  const request = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 100,
    system: 'You are a helpful assistant who always ends responses with "- Assistant"',
    messages: [
      { role: 'user', content: 'Say hello' }
    ]
  };

  try {
    const response = await makeRequest('/v1/messages', request);

    if (config.verbose) {
      console.log('响应:', JSON.stringify(response.data, null, 2));
    }

    const endsWithSignature = response.data.content?.[0]?.text?.includes('- Assistant') ||
                              response.data.content?.[0]?.text?.includes('Assistant');

    if (endsWithSignature) {
      console.log('✅ 通过 - 系统提示词生效');
      return true;
    } else {
      console.log('❌ 失败 - 系统提示词未生效');
      console.log('实际响应:', response.data.content?.[0]?.text);
      return false;
    }
  } catch (error) {
    console.log('❌ 失败:', error.error || error);
    return false;
  }
}

// 测试用例：温度参数
async function testTemperatureParameter() {
  console.log('\n📝 测试: 温度参数');

  // 低温度测试 - 应该更确定性
  const lowTempRequest = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 20,
    temperature: 0,
    messages: [
      { role: 'user', content: 'What is 2 + 2?' }
    ]
  };

  // 高温度测试 - 应该更随机
  const highTempRequest = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 50,
    temperature: 1,
    messages: [
      { role: 'user', content: 'Generate a random word' }
    ]
  };

  try {
    const lowTempResponse = await makeRequest('/v1/messages', lowTempRequest);
    const highTempResponse = await makeRequest('/v1/messages', highTempRequest);

    if (config.verbose) {
      console.log('低温响应:', lowTempResponse.data.content?.[0]?.text);
      console.log('高温响应:', highTempResponse.data.content?.[0]?.text);
    }

    const lowTempHas4 = lowTempResponse.data.content?.[0]?.text?.includes('4');
    const highTempHasResponse = highTempResponse.data.content?.[0]?.text?.length > 0;

    if (lowTempHas4 && highTempHasResponse) {
      console.log('✅ 通过 - 温度参数正确处理');
      return true;
    } else {
      console.log('❌ 失败 - 温度参数处理不正确');
      return false;
    }
  } catch (error) {
    console.log('❌ 失败:', error.error || error);
    return false;
  }
}

// 测试用例：停止序列
async function testStopSequences() {
  console.log('\n📝 测试: 停止序列');

  const request = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 200,
    stop_sequences: ['STOP', 'END'],
    messages: [
      { role: 'user', content: 'Count from 1 to 10 but say STOP after 5' }
    ]
  };

  try {
    const response = await makeRequest('/v1/messages', request);

    if (config.verbose) {
      console.log('响应:', JSON.stringify(response.data, null, 2));
    }

    const content = response.data.content?.[0]?.text || '';
    const stopReason = response.data.stop_reason;

    // 检查是否在遇到停止序列时停止
    const stoppedEarly = stopReason === 'stop_sequence' ||
                         (!content.includes('10') && content.includes('5'));

    if (stoppedEarly) {
      console.log('✅ 通过 - 停止序列正确工作');
      console.log('   停止原因:', stopReason);
      return true;
    } else {
      console.log('❌ 失败 - 停止序列未正确工作');
      console.log('   内容:', content.substring(0, 100));
      return false;
    }
  } catch (error) {
    console.log('❌ 失败:', error.error || error);
    return false;
  }
}

// 测试用例：top_p 参数
async function testTopPParameter() {
  console.log('\n📝 测试: top_p 参数');

  const request = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 50,
    top_p: 0.1,  // 非常低的 top_p，应该限制输出的多样性
    messages: [
      { role: 'user', content: 'Complete this: The sky is' }
    ]
  };

  try {
    const response = await makeRequest('/v1/messages', request);

    if (config.verbose) {
      console.log('响应:', JSON.stringify(response.data, null, 2));
    }

    const hasResponse = response.data.content?.[0]?.text?.length > 0;

    if (hasResponse) {
      console.log('✅ 通过 - top_p 参数被接受');
      console.log('   响应:', response.data.content?.[0]?.text?.substring(0, 50));
      return true;
    } else {
      console.log('❌ 失败 - top_p 参数处理失败');
      return false;
    }
  } catch (error) {
    console.log('❌ 失败:', error.error || error);
    return false;
  }
}

// 测试用例：top_k 参数
async function testTopKParameter() {
  console.log('\n📝 测试: top_k 参数');

  const request = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 50,
    top_k: 5,  // 限制只从前5个候选中选择
    messages: [
      { role: 'user', content: 'Generate a creative sentence' }
    ]
  };

  try {
    const response = await makeRequest('/v1/messages', request);

    if (config.verbose) {
      console.log('响应:', JSON.stringify(response.data, null, 2));
    }

    const hasResponse = response.data.content?.[0]?.text?.length > 0;

    if (hasResponse) {
      console.log('✅ 通过 - top_k 参数被接受');
      return true;
    } else {
      console.log('❌ 失败 - top_k 参数处理失败');
      return false;
    }
  } catch (error) {
    console.log('❌ 失败:', error.error || error);
    return false;
  }
}

// 测试用例：响应字段完整性
async function testResponseFields() {
  console.log('\n📝 测试: 响应字段完整性');

  const request = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 50,
    messages: [
      { role: 'user', content: 'Hi' }
    ]
  };

  try {
    const response = await makeRequest('/v1/messages', request);

    if (config.verbose) {
      console.log('响应:', JSON.stringify(response.data, null, 2));
    }

    // 检查所有必需的响应字段
    const requiredFields = ['id', 'type', 'role', 'content', 'model', 'stop_reason', 'usage'];
    const hasAllFields = requiredFields.every(field => field in response.data);

    // 检查 usage 对象
    const hasUsageFields = response.data.usage &&
                           'input_tokens' in response.data.usage &&
                           'output_tokens' in response.data.usage;

    if (hasAllFields && hasUsageFields) {
      console.log('✅ 通过 - 响应包含所有必需字段');
      console.log('   ID:', response.data.id);
      console.log('   模型:', response.data.model);
      console.log('   停止原因:', response.data.stop_reason);
      console.log('   Token使用:', response.data.usage);
      return true;
    } else {
      console.log('❌ 失败 - 响应缺少必需字段');
      console.log('   缺少的字段:', requiredFields.filter(f => !(f in response.data)));
      return false;
    }
  } catch (error) {
    console.log('❌ 失败:', error.error || error);
    return false;
  }
}

// 主测试函数
async function runTests() {
  console.log('🚀 Claude API 基础功能测试');
  console.log('=====================================');
  console.log(`API URL: ${config.apiUrl}`);
  console.log(`API Key: ${config.apiKey.substring(0, 10)}...`);

  let passed = 0;
  let failed = 0;

  const tests = [
    testBasicTextGeneration,
    testMultiTurnConversation,
    testSystemPrompt,
    testTemperatureParameter,
    testStopSequences,
    testTopPParameter,
    testTopKParameter,
    testResponseFields
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