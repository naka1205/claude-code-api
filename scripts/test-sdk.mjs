/**
 * Anthropic SDK 兼容性测试脚本
 * 使用官方 @anthropic-ai/sdk 通过本网关调用，验证 SDK 兼容性
 * 同时记录原始请求头和请求体到文件
 *
 * 用法:
 *   GEMINI_API_KEY=your_key node scripts/test-sdk.mjs
 *   GEMINI_API_KEY=your_key node scripts/test-sdk.mjs "你的提问"
 */

import Anthropic from '@anthropic-ai/sdk';
import { createServer } from 'http';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = join(__dirname, 'sdk-logs');
mkdirSync(LOG_DIR, { recursive: true });

const GATEWAY_URL = ' ';
const GEMINI_API_KEY = ' ';
const PROMPT = process.argv[3] || '你好，请用一句话介绍你自己';

if (!GEMINI_API_KEY) {
  console.error('错误: 请提供 Gemini API 密钥');
  console.error('  GEMINI_API_KEY=your_key node scripts/test-sdk.mjs');
  process.exit(1);
}

// ── 请求记录代理 ──────────────────────────────────────
// 在本地起一个代理，拦截 SDK 发出的请求，记录后转发到网关

let requestLog = null;

function createLoggingProxy(targetUrl) {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const rawBody = Buffer.concat(chunks).toString();

      // 记录请求
      const headers = { ...req.headers };
      delete headers.host;
      // 移除 SDK 自动注入的 Authorization 头，避免与 x-api-key 冲突
      // 实际使用中 Claude Code 的 ANTHROPIC_API_KEY 就是 Gemini Key，两者一致不会冲突
      // 但测试环境中 SDK 可能从环境变量读取到不同的 key
      if (headers['x-api-key'] && headers['authorization']) {
        delete headers['authorization'];
      }
      let parsedBody = null;
      try { parsedBody = JSON.parse(rawBody); } catch {}

      requestLog = {
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.url,
        headers,
        body: parsedBody || rawBody,
      };

      // 转发到实际网关
      const targetPath = new URL(req.url, targetUrl);
      const proxyHeaders = { ...headers };
      proxyHeaders.host = targetPath.host;

      try {
        const upstream = await fetch(targetPath.toString(), {
          method: req.method,
          headers: proxyHeaders,
          body: req.method !== 'GET' ? rawBody : undefined,
        });

        // 转发响应头
        res.writeHead(upstream.status, {
          'content-type': upstream.headers.get('content-type') || 'application/json',
          'cache-control': upstream.headers.get('cache-control') || '',
        });

        // 流式转发响应体并记录
        const responseChunks = [];
        const reader = upstream.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          responseChunks.push(Buffer.from(value));
          res.write(value);
        }
        res.end();

        // 保存响应到日志
        const responseRaw = Buffer.concat(responseChunks).toString();
        requestLog.response = {
          status: upstream.status,
          headers: Object.fromEntries(upstream.headers.entries()),
          body: responseRaw,
        };
      } catch (err) {
        res.writeHead(502);
        res.end(JSON.stringify({ error: err.message }));
        requestLog.response = { status: 502, error: err.message };
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ server, port, url: `http://127.0.0.1:${port}` });
    });
  });
}

function saveLog(testName, log) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${ts}_${testName}.json`;
  const filepath = join(LOG_DIR, filename);
  writeFileSync(filepath, JSON.stringify(log, null, 2), 'utf-8');
  console.log(`  日志已保存: scripts/sdk-logs/${filename}`);
}

// ── 测试用例 ──────────────────────────────────────────

async function testBasicMessage(client) {
  console.log('\n[测试 1] 基础消息 (非流式)');
  console.log('-'.repeat(50));
  requestLog = null;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 256,
      messages: [{ role: 'user', content: PROMPT }],
    });

    console.log(`  模型: ${response.model}`);
    console.log(`  停止原因: ${response.stop_reason}`);
    console.log(`  Token: 输入=${response.usage.input_tokens}, 输出=${response.usage.output_tokens}`);
    console.log(`  内容: ${response.content[0]?.text?.substring(0, 100) || response.content.find(b => b.type === 'text')?.text?.substring(0, 100)}...`);

    if (requestLog) {
      requestLog.sdkResponse = response;
      saveLog('basic-message', requestLog);
    }
    return true;
  } catch (err) {
    console.error(`  失败: ${err.message}`);
    if (requestLog) {
      requestLog.error = err.message;
      saveLog('basic-message-error', requestLog);
    }
    return false;
  }
}

async function testStreamMessage(client) {
  console.log('\n[测试 2] 流式消息');
  console.log('-'.repeat(50));
  requestLog = null;

  try {
    const stream = client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 256,
      messages: [{ role: 'user', content: '从1数到5，每个数字换一行' }],
    });

    let text = '';
    process.stdout.write('  输出: ');
    stream.on('text', (t) => {
      process.stdout.write(t);
      text += t;
    });

    const finalMessage = await stream.finalMessage();
    console.log();
    console.log(`  停止原因: ${finalMessage.stop_reason}`);
    console.log(`  Token: 输入=${finalMessage.usage.input_tokens}, 输出=${finalMessage.usage.output_tokens}`);

    if (requestLog) {
      requestLog.sdkResponse = finalMessage;
      saveLog('stream-message', requestLog);
    }
    return true;
  } catch (err) {
    console.error(`\n  失败: ${err.message}`);
    if (requestLog) {
      requestLog.error = err.message;
      saveLog('stream-message-error', requestLog);
    }
    return false;
  }
}

async function testSystemPrompt(client) {
  console.log('\n[测试 3] 系统提示词');
  console.log('-'.repeat(50));
  requestLog = null;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 256,
      system: '你是一个海盗，用海盗的语气说话。',
      messages: [{ role: 'user', content: '介绍一下天气' }],
    });

    console.log(`  内容: ${response.content.find(b => b.type === 'text')?.text?.substring(0, 150)}`);

    if (requestLog) {
      requestLog.sdkResponse = response;
      saveLog('system-prompt', requestLog);
    }
    return true;
  } catch (err) {
    console.error(`  失败: ${err.message}`);
    if (requestLog) {
      requestLog.error = err.message;
      saveLog('system-prompt-error', requestLog);
    }
    return false;
  }
}

async function testMultiTurn(client) {
  console.log('\n[测试 4] 多轮对话');
  console.log('-'.repeat(50));
  requestLog = null;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 256,
      messages: [
        { role: 'user', content: '我叫小明' },
        { role: 'assistant', content: '你好小明！有什么可以帮你的？' },
        { role: 'user', content: '我叫什么名字？' },
      ],
    });

    const text = response.content.find(b => b.type === 'text')?.text || '';
    console.log(`  内容: ${text.substring(0, 150)}`);
    console.log(`  包含"小明": ${text.includes('小明') ? '是' : '否'}`);

    if (requestLog) {
      requestLog.sdkResponse = response;
      saveLog('multi-turn', requestLog);
    }
    return text.includes('小明');
  } catch (err) {
    console.error(`  失败: ${err.message}`);
    if (requestLog) {
      requestLog.error = err.message;
      saveLog('multi-turn-error', requestLog);
    }
    return false;
  }
}

async function testThinking(client) {
  console.log('\n[测试 5] 思维推理 (thinking)');
  console.log('-'.repeat(50));
  requestLog = null;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      thinking: { type: 'enabled', budget_tokens: 512 },
      messages: [{ role: 'user', content: '3+5等于几？' }],
    });

    for (const block of response.content) {
      if (block.type === 'thinking') {
        console.log(`  推理: ${block.thinking.substring(0, 100)}...`);
      } else if (block.type === 'text') {
        console.log(`  回答: ${block.text.substring(0, 100)}`);
      }
    }

    if (requestLog) {
      requestLog.sdkResponse = response;
      saveLog('thinking', requestLog);
    }
    return true;
  } catch (err) {
    console.error(`  失败: ${err.message}`);
    if (requestLog) {
      requestLog.error = err.message;
      saveLog('thinking-error', requestLog);
    }
    return false;
  }
}

// ── 主流程 ──────────────────────────────────────────

async function main() {
  console.log('='.repeat(50));
  console.log('Anthropic SDK 兼容性测试');
  console.log('='.repeat(50));
  console.log(`网关地址: ${GATEWAY_URL}`);
  console.log(`日志目录: scripts/sdk-logs/`);

  // 启动记录代理
  const proxy = await createLoggingProxy(GATEWAY_URL);
  console.log(`代理端口: ${proxy.port}`);

  const client = new Anthropic({
    apiKey: GEMINI_API_KEY,
    baseURL: `${proxy.url}`,
  });

  const results = [];
  results.push({ name: '基础消息', pass: await testBasicMessage(client) });
  results.push({ name: '流式消息', pass: await testStreamMessage(client) });
  results.push({ name: '系统提示词', pass: await testSystemPrompt(client) });
  results.push({ name: '多轮对话', pass: await testMultiTurn(client) });
  results.push({ name: '思维推理', pass: await testThinking(client) });

  // 汇总
  console.log('\n' + '='.repeat(50));
  console.log('测试结果汇总');
  console.log('='.repeat(50));
  for (const r of results) {
    console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name}`);
  }
  const passed = results.filter(r => r.pass).length;
  console.log(`\n  ${passed}/${results.length} 通过`);

  proxy.server.close();
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error('运行出错:', err);
  process.exit(1);
});
