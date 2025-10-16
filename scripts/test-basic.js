/**
 * 基础消息测试脚本
 * 测试 /v1/messages 端点的基本功能
 */

const API_URL = 'http://localhost:8787';

// 从环境变量或命令行参数获取 Gemini API 密钥
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.argv[2];

if (!GEMINI_API_KEY) {
  console.error('❌ 错误: 请提供 Gemini API 密钥');
  console.error('方法 1: 设置环境变量 GEMINI_API_KEY');
  console.error('方法 2: 命令行参数 node scripts/test-basic.js YOUR_KEY');
  process.exit(1);
}

async function testBasicMessage() {
  console.log('\n🧪 测试 1: 基础文本对话');
  console.log('='.repeat(60));

  const request = {
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 100,
    messages: [
      {
        role: 'user',
        content: 'Hello! Please respond with a simple greeting.'
      }
    ]
  };

  console.log('📤 请求数据:');
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

    console.log(`\n📥 响应状态: ${response.status} ${response.statusText}`);

    const data = await response.json();
    console.log('\n📥 响应数据:');
    console.log(JSON.stringify(data, null, 2));

    if (response.ok && data.content && data.content.length > 0) {
      console.log('\n✅ 测试通过: 基础文本对话');
      console.log(`💬 模型回复: ${data.content[0].text}`);
      console.log(`📊 Token 使用: 输入 ${data.usage.input_tokens}, 输出 ${data.usage.output_tokens}`);
      return true;
    } else {
      console.log('\n❌ 测试失败: 响应格式不正确');
      return false;
    }
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    return false;
  }
}

async function testSystemPrompt() {
  console.log('\n\n🧪 测试 2: 系统提示词');
  console.log('='.repeat(60));

  const request = {
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 100,
    system: 'You are a helpful assistant that always responds in a cheerful tone.',
    messages: [
      {
        role: 'user',
        content: 'Tell me about the weather.'
      }
    ]
  };

  console.log('📤 请求数据 (带 system):');
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

    if (response.ok && data.content) {
      console.log('✅ 测试通过: 系统提示词');
      console.log(`💬 回复: ${data.content[0].text}`);
      return true;
    } else {
      console.log('❌ 测试失败');
      console.log(JSON.stringify(data, null, 2));
      return false;
    }
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    return false;
  }
}

async function testMultiTurn() {
  console.log('\n\n🧪 测试 3: 多轮对话');
  console.log('='.repeat(60));

  const request = {
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 100,
    messages: [
      {
        role: 'user',
        content: 'My name is Alice.'
      },
      {
        role: 'assistant',
        content: 'Nice to meet you, Alice!'
      },
      {
        role: 'user',
        content: 'What is my name?'
      }
    ]
  };

  console.log('📤 请求数据 (多轮对话):');
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

    if (response.ok && data.content) {
      console.log('✅ 测试通过: 多轮对话');
      console.log(`💬 回复: ${data.content[0].text}`);

      // 检查是否能识别上下文中的名字
      const text = data.content[0].text.toLowerCase();
      if (text.includes('alice')) {
        console.log('✅ 上下文识别正确 (包含 "Alice")');
      } else {
        console.log('⚠️  上下文可能未正确识别');
      }
      return true;
    } else {
      console.log('❌ 测试失败');
      console.log(JSON.stringify(data, null, 2));
      return false;
    }
  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    return false;
  }
}

async function testCountTokens() {
  console.log('\n\n🧪 测试 4: Token 计数');
  console.log('='.repeat(60));

  const request = {
    model: 'claude-sonnet-4-5-20250929',
    messages: [
      {
        role: 'user',
        content: 'This is a test message for token counting.'
      }
    ]
  };

  console.log('📤 请求数据:');
  console.log(JSON.stringify(request, null, 2));

  try {
    const response = await fetch(`${API_URL}/v1/messages/count_tokens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify(request),
    });

    console.log(`\n📥 响应状态: ${response.status}`);
    const data = await response.json();
    console.log('📥 响应数据:');
    console.log(JSON.stringify(data, null, 2));

    if (response.ok && typeof data.input_tokens === 'number') {
      console.log(`✅ 测试通过: Token 计数 = ${data.input_tokens}`);
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

async function testHealthCheck() {
  console.log('\n\n🧪 测试 5: 健康检查');
  console.log('='.repeat(60));

  try {
    const response = await fetch(`${API_URL}/health`);
    console.log(`📥 响应状态: ${response.status}`);

    const data = await response.json();
    console.log('📥 响应数据:');
    console.log(JSON.stringify(data, null, 2));

    if (response.ok && data.status === 'ok') {
      console.log('✅ 测试通过: 健康检查');
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

async function runAllTests() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 开始运行基础测试套件');
  console.log('='.repeat(60));

  const results = [];

  results.push(await testHealthCheck());
  results.push(await testBasicMessage());
  results.push(await testSystemPrompt());
  results.push(await testMultiTurn());
  results.push(await testCountTokens());

  console.log('\n\n' + '='.repeat(60));
  console.log('📊 测试结果汇总');
  console.log('='.repeat(60));

  const passed = results.filter(r => r).length;
  const total = results.length;

  console.log(`✅ 通过: ${passed}/${total}`);
  console.log(`❌ 失败: ${total - passed}/${total}`);

  if (passed === total) {
    console.log('\n🎉 所有测试通过!');
    process.exit(0);
  } else {
    console.log('\n⚠️  部分测试失败，请检查日志');
    process.exit(1);
  }
}

// 运行测试
runAllTests().catch(error => {
  console.error('💥 测试运行出错:', error);
  process.exit(1);
});
