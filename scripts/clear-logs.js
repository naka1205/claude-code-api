/**
 * 清空内存日志
 */

async function clearLogs() {
  try {
    const response = await fetch('http://127.0.0.1:8787/logs', { method: 'DELETE' });
    const result = await response.json();
    console.log('✅', result.message);
  } catch (error) {
    console.error('❌ Failed:', error.message);
  }
}

if (require.main === module) {
  clearLogs();
}