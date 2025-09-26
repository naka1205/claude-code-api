#!/usr/bin/env node
/**
 * 数据导出脚本 - 从调试接口获取数据并保存到data目录
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

class DataExporter {
  constructor(serverUrl = 'http://127.0.0.1:8787') {
    this.serverUrl = serverUrl;
    this.dataDir = './data';
  }

  /**
   * 初始化数据目录
   */
  initDataDir() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
      console.log(`📁 Created data directory: ${this.dataDir}`);
    }
  }

  /**
   * 发送HTTP GET请求
   */
  async httpGet(url) {
    return new Promise((resolve, reject) => {
      const req = http.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              resolve(JSON.parse(data));
            } catch (error) {
              reject(new Error(`Failed to parse JSON: ${error.message}`));
            }
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          }
        });
      });
      req.on('error', reject);
      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  /**
   * 获取所有请求数据概览
   */
  async getAllRequests() {
    console.log('🔍 Fetching all requests from debug API...');
    const url = `${this.serverUrl}/debug/data`;
    return await this.httpGet(url);
  }

  /**
   * 获取特定请求的详细数据
   */
  async getRequestData(requestId) {
    const url = `${this.serverUrl}/debug/data?requestId=${requestId}`;
    return await this.httpGet(url);
  }

  /**
   * 保存单个文件
   */
  saveFile(requestId, type, data) {
    try {
      const fileName = `${requestId}_${type}.json`;
      const filePath = path.join(this.dataDir, fileName);

      const fileContent = {
        requestId,
        type,
        timestamp: new Date().toISOString(),
        data: data
      };

      fs.writeFileSync(filePath, JSON.stringify(fileContent, null, 2), 'utf8');
      console.log(`   ✅ ${fileName}`);
      return filePath;
    } catch (error) {
      console.error(`   ❌ Failed to save ${requestId}_${type}: ${error.message}`);
      return null;
    }
  }

  /**
   * 导出单个请求的所有数据
   */
  async exportRequest(requestId) {
    try {
      console.log(`\n📦 Exporting data for request: ${requestId}`);
      const requestData = await this.getRequestData(requestId);

      if (!requestData) {
        console.log(`   ⚠️ No data found for request: ${requestId}`);
        return 0;
      }

      let fileCount = 0;

      // 保存Claude请求数据
      if (requestData.claude?.request) {
        this.saveFile(requestId, 'claude_request', requestData.claude.request);
        fileCount++;
      }

      // 保存Claude响应数据
      if (requestData.claude?.response) {
        this.saveFile(requestId, 'claude_response', requestData.claude.response);
        fileCount++;
      }

      // 保存Gemini请求数据
      if (requestData.gemini?.request) {
        this.saveFile(requestId, 'gemini_request', requestData.gemini.request);
        fileCount++;
      }

      // 保存Gemini响应数据
      if (requestData.gemini?.response) {
        this.saveFile(requestId, 'gemini_response', requestData.gemini.response);
        fileCount++;
      }

      console.log(`   📊 Saved ${fileCount} files for ${requestId}`);
      return fileCount;

    } catch (error) {
      console.error(`❌ Error exporting ${requestId}: ${error.message}`);
      return 0;
    }
  }

  /**
   * 导出所有数据
   */
  async exportAll() {
    console.log('🚀 Starting data export...\n');

    try {
      this.initDataDir();

      // 获取所有请求列表
      const allData = await this.getAllRequests();
      console.log(`📋 Found ${allData.total} requests to export`);

      if (allData.total === 0) {
        console.log('ℹ️ No data to export');
        return;
      }

      let totalFiles = 0;
      let successCount = 0;

      // 导出每个请求
      for (const request of allData.requests) {
        const fileCount = await this.exportRequest(request.requestId);
        if (fileCount > 0) {
          totalFiles += fileCount;
          successCount++;
        }
      }

      console.log('\n🎉 Export completed!');
      console.log(`📊 Summary:`);
      console.log(`   • ${successCount}/${allData.total} requests exported successfully`);
      console.log(`   • ${totalFiles} files saved to ${this.dataDir}/`);

      // 显示保存的文件列表
      const savedFiles = fs.readdirSync(this.dataDir)
        .filter(f => f.endsWith('.json'))
        .sort();

      if (savedFiles.length > 0) {
        console.log(`\n📁 Files in ${this.dataDir}/:`);
        savedFiles.forEach(file => {
          const filePath = path.join(this.dataDir, file);
          const stats = fs.statSync(filePath);
          const sizeKB = (stats.size / 1024).toFixed(1);
          console.log(`   ${file} (${sizeKB} KB)`);
        });
      }

    } catch (error) {
      console.error(`❌ Export failed: ${error.message}`);

      if (error.message.includes('ECONNREFUSED')) {
        console.log('\n💡 Make sure the development server is running:');
        console.log('   npm run dev');
      }
    }
  }

  /**
   * 清理旧文件
   */
  cleanup(keepCount = 50) {
    try {
      const files = fs.readdirSync(this.dataDir)
        .filter(f => f.endsWith('.json'))
        .map(f => {
          const filePath = path.join(this.dataDir, f);
          const stats = fs.statSync(filePath);
          return { file: f, filePath, mtime: stats.mtime };
        })
        .sort((a, b) => b.mtime - a.mtime);

      if (files.length > keepCount) {
        const filesToDelete = files.slice(keepCount);
        console.log(`\n🗑️ Cleaning up ${filesToDelete.length} old files...`);

        filesToDelete.forEach(({ filePath, file }) => {
          fs.unlinkSync(filePath);
          console.log(`   Deleted: ${file}`);
        });
      }
    } catch (error) {
      console.error(`❌ Cleanup failed: ${error.message}`);
    }
  }
}

// 命令行参数处理
async function main() {
  const args = process.argv.slice(2);
  const serverUrl = args.find(arg => arg.startsWith('--server='))?.split('=')[1] || 'http://127.0.0.1:8787';
  const cleanup = args.includes('--cleanup');
  const keepCount = parseInt(args.find(arg => arg.startsWith('--keep='))?.split('=')[1]) || 50;

  const exporter = new DataExporter(serverUrl);

  if (cleanup) {
    console.log('🧹 Cleanup mode');
    exporter.cleanup(keepCount);
    return;
  }

  // 检查特定请求ID
  const requestIdArg = args.find(arg => arg.startsWith('--request='))?.split('=')[1];
  if (requestIdArg) {
    console.log(`🎯 Exporting specific request: ${requestIdArg}`);
    exporter.initDataDir();
    await exporter.exportRequest(requestIdArg);
    return;
  }

  // 默认导出所有数据
  await exporter.exportAll();
}

// 显示帮助信息
function showHelp() {
  console.log(`
📊 Data Export Script - Export debug data to files

Usage:
  node export-data.js [options]

Options:
  --server=URL          Server URL (default: http://127.0.0.1:8787)
  --request=ID          Export specific request ID only
  --cleanup             Clean up old files
  --keep=N              Keep N newest files when cleaning up (default: 50)
  --help                Show this help

Examples:
  node export-data.js                          # Export all data
  node export-data.js --request=req_abc123     # Export specific request
  node export-data.js --cleanup --keep=20      # Keep only 20 newest files
  node export-data.js --server=http://localhost:3000  # Custom server URL
`);
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  showHelp();
} else {
  main().catch(error => {
    console.error('💥 Unexpected error:', error.message);
    process.exit(1);
  });
}