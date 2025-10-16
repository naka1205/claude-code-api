/**
 * 日志导出脚本
 * 从 /logs 端点获取请求日志并按照请求ID和类型分类保存到本地文件
 */

const fs = require('fs');
const path = require('path');

const API_URL = process.env.API_URL || 'http://localhost:8787';
const OUTPUT_DIR = process.env.OUTPUT_DIR || './logs';

/**
 * 确保目录存在
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 创建目录: ${dir}`);
  }
}

/**
 * 获取所有日志
 */
async function fetchLogs(limit = 100) {
  const url = `${API_URL}/logs?limit=${limit}`;
  console.log(`\n🔍 获取日志: ${url}`);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('❌ 获取日志失败:', error.message);
    throw error;
  }
}

/**
 * 获取单个请求的日志（使用新的 /logs/:requestId 端点）
 */
async function fetchLogByRequestId(requestId) {
  const url = `${API_URL}/logs/${requestId}`;
  console.log(`\n🔍 获取日志: ${url}`);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data.log;
  } catch (error) {
    console.error('❌ 获取日志失败:', error.message);
    throw error;
  }
}

/**
 * 按类型保存日志文件
 * 为每个请求ID创建一个目录，包含多个文件：
 * - client-request.json: 客户端原始请求
 * - gemini-request.json: 转换后的 Gemini 请求
 * - gemini-response.json: Gemini 原始响应
 * - claude-response.json: 转换后的 Claude 响应
 * - metadata.json: 元数据（性能指标、错误等）
 */
function saveLogByType(log, baseDir) {
  const requestDir = path.join(baseDir, log.requestId);
  ensureDir(requestDir);

  const savedFiles = [];

  // 1. 保存客户端原始请求
  if (log.clientRequest) {
    const file = path.join(requestDir, 'client-request.json');
    fs.writeFileSync(file, JSON.stringify(log.clientRequest, null, 2), 'utf8');
    savedFiles.push('client-request.json');
  }

  // 2. 保存 Gemini 请求
  if (log.geminiRequest) {
    const file = path.join(requestDir, 'gemini-request.json');
    fs.writeFileSync(file, JSON.stringify(log.geminiRequest, null, 2), 'utf8');
    savedFiles.push('gemini-request.json');
  }

  // 3. 保存 Gemini 响应
  if (log.geminiResponse) {
    const file = path.join(requestDir, 'gemini-response.json');
    const responseData = {
      status: log.geminiResponse.status,
      statusText: log.geminiResponse.statusText,
      headers: log.geminiResponse.headers,
      body: log.geminiResponse.body,
    };

    // 如果有原始响应字符串，也保存
    if (log.geminiResponse.rawBody) {
      fs.writeFileSync(path.join(requestDir, 'gemini-response-raw.txt'), log.geminiResponse.rawBody, 'utf8');
      savedFiles.push('gemini-response-raw.txt');
    }

    fs.writeFileSync(file, JSON.stringify(responseData, null, 2), 'utf8');
    savedFiles.push('gemini-response.json');
  }

  // 4. 保存 Claude 响应
  if (log.claudeResponse) {
    const file = path.join(requestDir, 'claude-response.json');

    // 如果有原始响应字符串，也保存
    if (log.claudeResponse.rawBody) {
      fs.writeFileSync(path.join(requestDir, 'claude-response-raw.txt'), log.claudeResponse.rawBody, 'utf8');
      savedFiles.push('claude-response-raw.txt');
    }

    fs.writeFileSync(file, JSON.stringify(log.claudeResponse, null, 2), 'utf8');
    savedFiles.push('claude-response.json');
  }

  // 5. 保存元数据
  const metadata = {
    requestId: log.requestId,
    timestamp: log.timestamp,
    path: log.path,
    method: log.method,
    isStream: log.isStream,
    performance: log.performance,
    error: log.error,
  };
  const metaFile = path.join(requestDir, 'metadata.json');
  fs.writeFileSync(metaFile, JSON.stringify(metadata, null, 2), 'utf8');
  savedFiles.push('metadata.json');

  console.log(`  ✅ ${log.requestId}/ (${savedFiles.length} files: ${savedFiles.join(', ')})`);

  return requestDir;
}

/**
 * 保存汇总日志
 */
function saveSummary(logs, stats, outputDir) {
  const summaryPath = path.join(outputDir, `summary_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);

  const summary = {
    exportTime: new Date().toISOString(),
    stats,
    logs: logs.map(log => ({
      requestId: log.requestId,
      timestamp: log.timestamp,
      path: log.path,
      isStream: log.isStream,
      duration: log.performance.duration,
      hasError: !!log.error,
      clientModel: log.clientRequest?.body?.model,
      geminiUrl: log.geminiRequest?.url,
    })),
  };

  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
  console.log(`\n📊 汇总: ${path.basename(summaryPath)}`);
}

/**
 * 清空服务器日志
 */
async function clearLogs() {
  const url = `${API_URL}/logs?clear=true`;
  console.log(`\n🗑️  清空服务器日志: ${url}`);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`  ✅ ${data.message}`);
  } catch (error) {
    console.error('❌ 清空日志失败:', error.message);
    throw error;
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('='.repeat(60));
  console.log('📝 Claude-Gemini API 日志导出工具');
  console.log('='.repeat(60));

  const args = process.argv.slice(2);
  const command = args[0];

  try {
    // 确保输出目录存在
    ensureDir(OUTPUT_DIR);

    if (command === 'clear') {
      // 清空日志
      await clearLogs();
      return;
    }

    if (command === 'get' && args[1]) {
      // 获取单个请求的日志
      const requestId = args[1];
      const log = await fetchLogByRequestId(requestId);

      if (log) {
        saveLogByType(log, OUTPUT_DIR);
        console.log('\n✅ 导出完成!');
      } else {
        console.log(`\n❌ 未找到日志: ${requestId}`);
      }
      return;
    }

    // 获取所有日志
    const limit = args[0] ? parseInt(args[0]) : 100;
    const data = await fetchLogs(limit);

    if (!data.logs || data.logs.length === 0) {
      console.log('\n📭 没有可用的日志');
      return;
    }

    console.log(`\n📦 找到 ${data.logs.length} 条日志 (总计: ${data.stats.totalLogs})`);
    console.log(`   流式请求: ${data.stats.streamLogs}`);
    console.log(`   错误请求: ${data.stats.errorLogs}`);
    console.log(`\n💾 开始保存 (按类型分文件)...`);

    // 保存每个日志
    let savedCount = 0;
    for (const log of data.logs) {
      try {
        saveLogByType(log, OUTPUT_DIR);
        savedCount++;
      } catch (error) {
        console.error(`  ❌ 保存失败 (${log.requestId}):`, error.message);
      }
    }

    // 保存汇总
    saveSummary(data.logs, data.stats, OUTPUT_DIR);

    console.log('\n' + '='.repeat(60));
    console.log(`✅ 导出完成: ${savedCount}/${data.logs.length} 条日志`);
    console.log(`📂 输出目录: ${path.resolve(OUTPUT_DIR)}`);
    console.log('\n每个请求的日志包含:');
    console.log('  - client-request.json: 客户端原始请求');
    console.log('  - gemini-request.json: 转换后的 Gemini 请求');
    console.log('  - gemini-response.json: Gemini 原始响应');
    console.log('  - claude-response.json: 转换后的 Claude 响应');
    console.log('  - metadata.json: 元数据（性能、错误等）');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('\n❌ 导出失败:', error.message);
    process.exit(1);
  }
}

// 显示使用说明
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
使用方法:
  node scripts/export-logs.js [limit]          # 导出最近的 N 条日志 (默认 100)
  node scripts/export-logs.js get <requestId>  # 导出指定请求的日志
  node scripts/export-logs.js clear            # 清空服务器日志缓存

环境变量:
  API_URL       API服务器地址 (默认: http://localhost:8787)
  OUTPUT_DIR    输出目录 (默认: ./logs)

示例:
  # 导出所有日志
  node scripts/export-logs.js

  # 导出最近50条日志
  node scripts/export-logs.js 50

  # 导出特定请求（使用新的 REST 端点）
  node scripts/export-logs.js get req_abc123

  # 使用自定义输出目录
  OUTPUT_DIR=./debug-logs node scripts/export-logs.js

  # 清空日志
  node scripts/export-logs.js clear

日志文件结构:
  logs/
    req_abc123/
      client-request.json       # 客户端原始请求
      gemini-request.json       # 转换后的 Gemini 请求
      gemini-response.json      # Gemini 原始响应
      gemini-response-raw.txt   # Gemini 原始响应字符串
      claude-response.json      # 转换后的 Claude 响应
      claude-response-raw.txt   # Claude 原始响应字符串
      metadata.json             # 元数据（性能、错误等）
    req_def456/
      ...
    summary_2025-10-16.json     # 汇总信息
`);
  process.exit(0);
}

// 运行主函数
main().catch(console.error);
