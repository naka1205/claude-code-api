/**
 * 完整测试套件运行脚本
 * 按顺序运行所有测试
 */

const { spawn } = require('child_process');
const path = require('path');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.argv[2];

if (!GEMINI_API_KEY) {
  console.error('❌ 错误: 请提供 Gemini API 密钥');
  console.error('方法 1: 设置环境变量 GEMINI_API_KEY');
  console.error('方法 2: 命令行参数 node scripts/test-all.js YOUR_KEY');
  process.exit(1);
}

const tests = [
  { name: '基础功能测试', script: 'test-basic.js' },
  { name: '流式响应测试', script: 'test-stream.js' },
  { name: '工具调用测试', script: 'test-tools.js' },
];

async function runTest(testName, scriptPath) {
  return new Promise((resolve) => {
    console.log('\n' + '='.repeat(80));
    console.log(`🚀 运行: ${testName}`);
    console.log('='.repeat(80));

    const child = spawn('node', [scriptPath], {
      env: { ...process.env, GEMINI_API_KEY },
      stdio: 'inherit',
      shell: true
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log(`\n✅ ${testName} 完成\n`);
        resolve(true);
      } else {
        console.log(`\n❌ ${testName} 失败 (退出码: ${code})\n`);
        resolve(false);
      }
    });

    child.on('error', (error) => {
      console.error(`\n❌ ${testName} 错误:`, error.message);
      resolve(false);
    });
  });
}

async function runAllTests() {
  console.log('\n' + '█'.repeat(80));
  console.log('🧪 Claude API 兼容层 - 完整测试套件');
  console.log('█'.repeat(80));

  const results = [];
  const scriptsDir = __dirname;

  for (const test of tests) {
    const scriptPath = path.join(scriptsDir, test.script);
    const result = await runTest(test.name, scriptPath);
    results.push({ name: test.name, passed: result });

    // 测试间短暂延迟
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n' + '█'.repeat(80));
  console.log('📊 完整测试套件结果汇总');
  console.log('█'.repeat(80));

  results.forEach((result, index) => {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${index + 1}. ${status} - ${result.name}`);
  });

  const passed = results.filter(r => r.passed).length;
  const total = results.length;

  console.log('\n' + '─'.repeat(80));
  console.log(`总计: ${passed}/${total} 测试套件通过`);
  console.log('─'.repeat(80));

  if (passed === total) {
    console.log('\n🎉🎉🎉 所有测试通过! 项目运行正常! 🎉🎉🎉\n');
    process.exit(0);
  } else {
    console.log('\n⚠️  部分测试失败，请检查日志并修复问题\n');
    process.exit(1);
  }
}

// 检查 API 服务是否运行
async function checkServer() {
  console.log('🔍 检查开发服务器...');
  try {
    const response = await fetch('http://localhost:8787/health');
    if (response.ok) {
      console.log('✅ 开发服务器运行正常\n');
      return true;
    }
  } catch (error) {
    console.error('❌ 无法连接到开发服务器 (http://localhost:8787)');
    console.error('请先运行: npm run dev');
    console.error('');
    process.exit(1);
  }
}

checkServer().then(() => {
  runAllTests().catch(error => {
    console.error('💥 测试套件运行出错:', error);
    process.exit(1);
  });
});
