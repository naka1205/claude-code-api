/**
 * 工具调用测试脚本
 * 测试 Tool Use (Function Calling) 功能
 */

const API_URL = 'http://localhost:8787';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.argv[2];

if (!GEMINI_API_KEY) {
  console.error('❌ 错误: 请提供 Gemini API 密钥');
  console.error('方法 1: 设置环境变量 GEMINI_API_KEY');
  console.error('方法 2: 命令行参数 node scripts/test-tools.js YOUR_KEY');
  process.exit(1);
}

async function testToolDefinition() {
  console.log('\n🧪 测试 1: 工具定义和调用');
  console.log('='.repeat(60));

  const request = {
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 200,
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
    messages: [
      {
        role: 'user',
        content: 'What is the weather like in Tokyo today?'
      }
    ]
  };

  console.log('📤 请求数据 (带工具定义):');
  console.log(JSON.stringify(request, null, 2));

  try {
    const response = await fetch(`${API_URL}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify(request),
    });

    console.log(`\n📥 响应状态: ${response.status}`);
    const data = await response.json();

    console.log('\n📥 响应数据:');
    console.log(JSON.stringify(data, null, 2));

    // 检查是否包含工具调用
    const hasToolUse = data.content && data.content.some(block => block.type === 'tool_use');

    if (response.ok && hasToolUse) {
      const toolBlock = data.content.find(block => block.type === 'tool_use');
      console.log('\n✅ 测试通过: 工具调用成功');
      console.log(`🔧 工具名称: ${toolBlock.name}`);
      console.log(`📋 工具参数: ${JSON.stringify(toolBlock.input)}`);
      console.log(`🆔 工具ID: ${toolBlock.id}`);
      console.log(`🛑 停止原因: ${data.stop_reason}`);
      return true;
    } else {
      console.log('\n❌ 测试失败: 未检测到工具调用');
      return false;
    }
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    return false;
  }
}

async function testToolWithAuto() {
  console.log('\n\n🧪 测试 2: tool_choice = auto');
  console.log('='.repeat(60));

  const request = {
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 200,
    tools: [
      {
        name: 'calculate',
        description: 'Perform a mathematical calculation',
        input_schema: {
          type: 'object',
          properties: {
            expression: { type: 'string' }
          },
          required: ['expression']
        }
      }
    ],
    tool_choice: { type: 'auto' },
    messages: [
      {
        role: 'user',
        content: 'Just say hello, no need to calculate anything.'
      }
    ]
  };

  console.log('📤 请求: tool_choice=auto, 用户不需要工具');

  try {
    const response = await fetch(`${API_URL}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify(request),
    });

    const data = await response.json();
    const hasToolUse = data.content && data.content.some(block => block.type === 'tool_use');

    if (response.ok) {
      if (!hasToolUse) {
        console.log('✅ 测试通过: 模型正确判断不需要工具');
        console.log(`💬 回复: ${data.content[0].text}`);
      } else {
        console.log('⚠️  模型调用了工具 (可能合理，取决于模型判断)');
      }
      return true;
    } else {
      console.log('❌ 测试失败');
      return false;
    }
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    return false;
  }
}

async function testToolWithAny() {
  console.log('\n\n🧪 测试 3: tool_choice = any');
  console.log('='.repeat(60));

  const request = {
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 200,
    tools: [
      {
        name: 'search_database',
        description: 'Search the database for information',
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string' }
          },
          required: ['query']
        }
      }
    ],
    tool_choice: { type: 'any' },
    messages: [
      {
        role: 'user',
        content: 'Find information about Python programming'
      }
    ]
  };

  console.log('📤 请求: tool_choice=any (强制使用工具)');

  try {
    const response = await fetch(`${API_URL}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify(request),
    });

    const data = await response.json();
    const hasToolUse = data.content && data.content.some(block => block.type === 'tool_use');

    if (response.ok && hasToolUse) {
      console.log('✅ 测试通过: 强制工具调用成功');
      const toolBlock = data.content.find(block => block.type === 'tool_use');
      console.log(`🔧 工具: ${toolBlock.name}`);
      console.log(`📋 参数: ${JSON.stringify(toolBlock.input)}`);
      return true;
    } else {
      console.log('❌ 测试失败: 未强制使用工具');
      console.log(JSON.stringify(data, null, 2));
      return false;
    }
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    return false;
  }
}

async function testToolWithSpecificTool() {
  console.log('\n\n🧪 测试 4: tool_choice = 指定工具');
  console.log('='.repeat(60));

  const request = {
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 200,
    tools: [
      {
        name: 'tool_a',
        description: 'First tool',
        input_schema: {
          type: 'object',
          properties: { param: { type: 'string' } },
          required: ['param']
        }
      },
      {
        name: 'tool_b',
        description: 'Second tool',
        input_schema: {
          type: 'object',
          properties: { param: { type: 'string' } },
          required: ['param']
        }
      }
    ],
    tool_choice: { type: 'tool', name: 'tool_b' },
    messages: [
      {
        role: 'user',
        content: 'Use the available tool with parameter "test"'
      }
    ]
  };

  console.log('📤 请求: 强制使用 tool_b');

  try {
    const response = await fetch(`${API_URL}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify(request),
    });

    const data = await response.json();
    const toolBlock = data.content && data.content.find(block => block.type === 'tool_use');

    if (response.ok && toolBlock && toolBlock.name === 'tool_b') {
      console.log('✅ 测试通过: 正确使用指定工具 tool_b');
      console.log(`📋 参数: ${JSON.stringify(toolBlock.input)}`);
      return true;
    } else {
      console.log('❌ 测试失败: 未使用指定工具');
      console.log(JSON.stringify(data, null, 2));
      return false;
    }
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 开始运行工具调用测试套件');
  console.log('='.repeat(60));

  const results = [];
  results.push(await testToolDefinition());
  results.push(await testToolWithAuto());
  results.push(await testToolWithAny());
  results.push(await testToolWithSpecificTool());

  console.log('\n\n' + '='.repeat(60));
  console.log('📊 测试结果汇总');
  console.log('='.repeat(60));

  const passed = results.filter(r => r).length;
  const total = results.length;

  console.log(`✅ 通过: ${passed}/${total}`);
  console.log(`❌ 失败: ${total - passed}/${total}`);

  if (passed === total) {
    console.log('\n🎉 所有工具调用测试通过!');
    process.exit(0);
  } else {
    console.log('\n⚠️  部分测试失败');
    process.exit(1);
  }
}

runAllTests().catch(error => {
  console.error('💥 测试运行出错:', error);
  process.exit(1);
});
