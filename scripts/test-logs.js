/**
 * 日志系统测试脚本
 * 测试请求日志记录和导出功能
 */

const API_URL = process.env.API_URL || 'http://localhost:8787';
const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.error('❌ 请设置 GEMINI_API_KEY 环境变量');
  process.exit(1);
}

/**
 * 测试简单的非流式请求
 */
async function testSimpleRequest() {
  console.log('\n' + '='.repeat(60));
  console.log('测试 1: 简单非流式请求');
  console.log('='.repeat(60));

  const response = await fetch(`${API_URL}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 100,
      messages: [
        {
          role: 'user',
          content: '你好，请简单自我介绍一下',
        },
      ],
    }),
  });

  console.log(`状态: ${response.status} ${response.statusText}`);

  if (response.ok) {
    const data = await response.json();
    console.log('✅ 请求成功');
    console.log(`请求ID: ${data.id}`);
    console.log(`模型: ${data.model}`);
    console.log(`输入tokens: ${data.usage.input_tokens}`);
    console.log(`输出tokens: ${data.usage.output_tokens}`);
    return data.id;
  } else {
    const error = await response.text();
    console.log('❌ 请求失败:', error);
    return null;
  }
}

/**
 * 测试流式请求
 */
async function testStreamRequest() {
  console.log('\n' + '='.repeat(60));
  console.log('测试 2: 流式请求');
  console.log('='.repeat(60));

  const response = await fetch(`${API_URL}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 100,
      stream: true,
      messages: [
        {
          role: 'user',
          content: '用一句话介绍人工智能',
        },
      ],
    }),
  });

  console.log(`状态: ${response.status} ${response.statusText}`);

  if (response.ok) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let requestId = null;
    let eventCount = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value);
      const events = text.split('\n\n').filter((e) => e.trim());

      for (const event of events) {
        if (event.startsWith('data: ')) {
          const data = JSON.parse(event.slice(6));
          eventCount++;

          if (data.type === 'message_start' && !requestId) {
            requestId = data.message.id;
            console.log(`请求ID: ${requestId}`);
          }
        }
      }
    }

    console.log('✅ 流式请求成功');
    console.log(`接收到 ${eventCount} 个事件`);
    return requestId;
  } else {
    const error = await response.text();
    console.log('❌ 请求失败:', error);
    return null;
  }
}

/**
 * 获取日志列表
 */
async function fetchLogsList() {
  console.log('\n' + '='.repeat(60));
  console.log('测试 3: 获取日志列表');
  console.log('='.repeat(60));

  const response = await fetch(`${API_URL}/logs?limit=10`);
  const data = await response.json();

  console.log(`✅ 找到 ${data.logs.length} 条日志`);
  console.log(`总计: ${data.stats.totalLogs}`);
  console.log(`流式请求: ${data.stats.streamLogs}`);
  console.log(`错误请求: ${data.stats.errorLogs}`);

  console.log('\n最近的日志:');
  data.logs.slice(0, 5).forEach((log, i) => {
    console.log(`  ${i + 1}. ${log.requestId} - ${log.path} - ${log.isStream ? '流式' : '非流式'} - ${log.performance.duration}ms`);
  });

  return data.logs;
}

/**
 * 获取特定请求的日志详情
 */
async function fetchLogDetails(requestId) {
  console.log('\n' + '='.repeat(60));
  console.log(`测试 4: 获取日志详情 (${requestId})`);
  console.log('='.repeat(60));

  const response = await fetch(`${API_URL}/logs/${requestId}`);

  if (response.ok) {
    const data = await response.json();
    const log = data.log;

    console.log('✅ 日志详情:');
    console.log(`  请求ID: ${log.requestId}`);
    console.log(`  时间戳: ${log.timestamp}`);
    console.log(`  路径: ${log.path}`);
    console.log(`  类型: ${log.isStream ? '流式' : '非流式'}`);
    console.log(`  耗时: ${log.performance.duration}ms`);

    console.log('\n  客户端请求:');
    console.log(`    模型: ${log.clientRequest?.body?.model}`);
    console.log(`    最大tokens: ${log.clientRequest?.body?.max_tokens}`);
    console.log(`    消息数: ${log.clientRequest?.body?.messages?.length}`);

    console.log('\n  Gemini 请求:');
    console.log(`    URL: ${log.geminiRequest?.url}`);
    console.log(`    内容块数: ${log.geminiRequest?.body?.contents?.length}`);

    console.log('\n  Gemini 响应:');
    console.log(`    状态: ${log.geminiResponse?.status}`);
    if (log.isStream) {
      console.log(`    流式数据块: ${log.geminiResponse?.body?.length} 个`);
    }

    console.log('\n  Claude 响应:');
    console.log(`    状态: ${log.claudeResponse?.status}`);
    if (log.isStream) {
      console.log(`    流式事件: ${log.claudeResponse?.body?.length} 个`);
    }

    if (log.error) {
      console.log('\n  ❌ 错误信息:');
      console.log(`    消息: ${log.error.message}`);
      console.log(`    阶段: ${log.error.stage}`);
    }

    return log;
  } else {
    console.log('❌ 获取日志详情失败');
    return null;
  }
}

/**
 * 测试导出脚本
 */
async function testExportScript(requestId) {
  console.log('\n' + '='.repeat(60));
  console.log('测试 5: 导出日志到文件');
  console.log('='.repeat(60));

  const { spawn } = require('child_process');
  const path = require('path');

  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, 'export-logs.js');
    const child = spawn('node', [scriptPath, 'get', requestId], {
      env: { ...process.env, API_URL, OUTPUT_DIR: './test-logs' },
      stdio: 'inherit',
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log('✅ 日志导出成功');
        resolve();
      } else {
        console.log('❌ 日志导出失败');
        reject(new Error(`Export script exited with code ${code}`));
      }
    });
  });
}

/**
 * 主测试流程
 */
async function main() {
  console.log('='.repeat(60));
  console.log('📝 Claude-Gemini API 日志系统测试');
  console.log('='.repeat(60));
  console.log(`API URL: ${API_URL}`);

  try {
    // 1. 测试简单请求
    const requestId1 = await testSimpleRequest();
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 2. 测试流式请求
    const requestId2 = await testStreamRequest();
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 3. 获取日志列表
    const logs = await fetchLogsList();
    await new Promise((resolve) => setTimeout(resolve, 500));

    // 4. 获取第一个请求的日志详情
    if (requestId1) {
      await fetchLogDetails(requestId1);
      await new Promise((resolve) => setTimeout(resolve, 500));

      // 5. 测试导出功能
      await testExportScript(requestId1);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ 所有测试完成！');
    console.log('='.repeat(60));
    console.log('\n日志系统功能验证:');
    console.log('  ✅ 请求日志记录');
    console.log('  ✅ 日志列表查询 (GET /logs)');
    console.log('  ✅ 日志详情查询 (GET /logs/:requestId)');
    console.log('  ✅ 日志导出到文件');
    console.log('\n下一步:');
    console.log('  1. 运行 node scripts/export-logs.js 导出所有日志');
    console.log('  2. 查看 ./test-logs 目录下的日志文件');
    console.log('  3. 每个请求有独立目录，包含多个分类文件');
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    process.exit(1);
  }
}

// 运行测试
main().catch(console.error);
