/**
 * 流式响应测试脚本
 * 测试 /v1/messages 端点的 SSE 流式输出
 */

const API_URL = 'http://localhost:8787';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.argv[2];

if (!GEMINI_API_KEY) {
  console.error('❌ 错误: 请提供 Gemini API 密钥');
  console.error('方法 1: 设置环境变量 GEMINI_API_KEY');
  console.error('方法 2: 命令行参数 node scripts/test-stream.js YOUR_KEY');
  process.exit(1);
}

async function testStreamingMessage() {
  console.log('\n🧪 测试: 流式文本响应');
  console.log('='.repeat(60));

  const request = {
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 200,
    stream: true,
    messages: [
      {
        role: 'user',
        content: 'Count from 1 to 5 slowly, explaining each number.'
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

    console.log(`\n📥 响应状态: ${response.status}`);
    console.log(`📥 Content-Type: ${response.headers.get('content-type')}`);

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ 请求失败:', error);
      return false;
    }

    if (!response.body) {
      console.error('❌ 无响应体');
      return false;
    }

    console.log('\n📡 开始接收 SSE 流:\n');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let eventCount = 0;
    let textContent = '';
    const events = {
      message_start: 0,
      content_block_start: 0,
      content_block_delta: 0,
      content_block_stop: 0,
      message_delta: 0,
      message_stop: 0,
      error: 0
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          const eventType = line.slice(7).trim();
          eventCount++;

          console.log(`\n[事件 ${eventCount}] ${eventType}`);
        } else if (line.startsWith('data: ')) {
          const data = line.slice(6);
          try {
            const event = JSON.parse(data);

            // 统计事件类型
            if (events.hasOwnProperty(event.type)) {
              events[event.type]++;
            }

            // 显示关键信息
            if (event.type === 'message_start') {
              console.log(`  ├─ 消息ID: ${event.message.id}`);
              console.log(`  └─ 模型: ${event.message.model}`);
            } else if (event.type === 'content_block_start') {
              console.log(`  ├─ 索引: ${event.index}`);
              console.log(`  └─ 类型: ${event.content_block.type}`);
            } else if (event.type === 'content_block_delta') {
              if (event.delta.type === 'text_delta') {
                process.stdout.write(event.delta.text);
                textContent += event.delta.text;
              } else if (event.delta.type === 'thinking_delta') {
                console.log(`  └─ 思维: ${event.delta.thinking.substring(0, 50)}...`);
              }
            } else if (event.type === 'message_delta') {
              console.log(`\n  ├─ 停止原因: ${event.delta.stop_reason}`);
              console.log(`  └─ 输出Token: ${event.usage.output_tokens}`);
            } else if (event.type === 'message_stop') {
              console.log('  └─ 流结束');
            }
          } catch (e) {
            console.error('  ⚠️  JSON 解析错误:', e.message);
          }
        }
      }
    }

    console.log('\n\n' + '='.repeat(60));
    console.log('📊 流式事件统计:');
    console.log('='.repeat(60));
    for (const [type, count] of Object.entries(events)) {
      if (count > 0) {
        console.log(`  ${type}: ${count}`);
      }
    }

    console.log('\n📝 完整文本内容:');
    console.log('─'.repeat(60));
    console.log(textContent);
    console.log('─'.repeat(60));

    // 验证事件序列
    const hasRequiredEvents =
      events.message_start === 1 &&
      events.content_block_start > 0 &&
      events.content_block_delta > 0 &&
      events.content_block_stop > 0 &&
      events.message_delta === 1 &&
      events.message_stop === 1;

    if (hasRequiredEvents && textContent.length > 0) {
      console.log('\n✅ 测试通过: 流式响应完整');
      return true;
    } else {
      console.log('\n❌ 测试失败: 事件序列不完整');
      return false;
    }

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    console.error(error.stack);
    return false;
  }
}

async function testStreamingWithSystemPrompt() {
  console.log('\n\n🧪 测试: 流式响应 + 系统提示词');
  console.log('='.repeat(60));

  const request = {
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 150,
    stream: true,
    system: 'You are a pirate. Speak like a pirate in all responses.',
    messages: [
      {
        role: 'user',
        content: 'Tell me about the weather.'
      }
    ]
  };

  try {
    const response = await fetch(`${API_URL}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      console.error('❌ 请求失败');
      return false;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let textContent = '';

    console.log('\n📡 流式输出:\n');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              process.stdout.write(event.delta.text);
              textContent += event.delta.text;
            }
          } catch (e) {}
        }
      }
    }

    console.log('\n\n✅ 测试通过: 流式响应 + 系统提示词');
    console.log(`📝 内容长度: ${textContent.length} 字符`);
    return true;

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    return false;
  }
}

async function runAllTests() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 开始运行流式测试套件');
  console.log('='.repeat(60));

  const results = [];
  results.push(await testStreamingMessage());
  results.push(await testStreamingWithSystemPrompt());

  console.log('\n\n' + '='.repeat(60));
  console.log('📊 测试结果汇总');
  console.log('='.repeat(60));

  const passed = results.filter(r => r).length;
  const total = results.length;

  console.log(`✅ 通过: ${passed}/${total}`);
  console.log(`❌ 失败: ${total - passed}/${total}`);

  if (passed === total) {
    console.log('\n🎉 所有流式测试通过!');
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
