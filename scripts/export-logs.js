/**
 * 日志导出脚本
 * 从内存获取数据并保存为文件
 */

const fs = require('fs');
const path = require('path');

const API_BASE = 'http://127.0.0.1:8787';
const DATA_DIR = path.join(__dirname, '..', 'data');

async function exportLogs() {
  try {
    console.log('📥 Fetching logs from memory...');

    // 确保data目录存在
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      console.log(`📁 Created data directory: ${DATA_DIR}`);
    }

    // 获取所有日志
    const response = await fetch(`${API_BASE}/logs`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`📊 Found ${data.logs.length} log entries`);
    console.log(`💾 Memory usage: ${data.stats.memoryUsage}`);

    let savedCount = 0;

    // 为每个请求保存两个文件 - 直接保存原始数据
    for (const log of data.logs) {
      const requestId = log.requestId;

      // 保存客户端原始请求
      if (log.clientRequest) {
        const requestFile = path.join(DATA_DIR, `${requestId}_request.json`);
        fs.writeFileSync(requestFile, JSON.stringify(log.clientRequest, null, 2));
        console.log(`✅ ${requestId}_request.json`);
        savedCount++;
      }

      // 保存GEMINI原始数据
      if (log.geminiData) {
        const responseFile = path.join(DATA_DIR, `${requestId}_response.json`);
        fs.writeFileSync(responseFile, JSON.stringify(log.geminiData, null, 2));
        console.log(`✅ ${requestId}_response.json`);
        savedCount++;
      }
    }

    console.log(`\n🎉 Export complete! Saved ${savedCount} files to ./data/`);

  } catch (error) {
    console.error('❌ Export failed:', error.message);
    console.log('💡 Make sure server is running: npm run dev:debug');
  }
}

if (require.main === module) {
  exportLogs();
}