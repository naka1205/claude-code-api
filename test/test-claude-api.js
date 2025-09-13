const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs').promises;
const path = require('path');

// 测试配置
const API_BASE = process.env.API_BASE || 'https://your-worker.workers.dev';
const API_KEY = process.env.API_KEY || 'test-api-key';

// 测试结果收集
const testResults = [];

// 辅助函数
function logTest(name, passed, details = '') {
    const status = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`${status}: ${name} ${details ? `- ${details}` : ''}`);
    testResults.push({ name, passed, details });
}

async function makeRequest(endpoint, data, headers = {}) {
    try {
        const response = await axios.post(`${API_BASE}${endpoint}`, data, {
            headers: {
                'x-api-key': API_KEY,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json',
                ...headers
            }
        });
        return { success: true, data: response.data, status: response.status };
    } catch (error) {
        return {
            success: false,
            error: error.response?.data || error.message,
            status: error.response?.status
        };
    }
}

// Claude API测试用例

// 1. 基本文本对话测试
async function testBasicTextGeneration() {
    console.log('\n=== 测试基本文本生成 ===');

    const requestData = {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 100,
        messages: [
            { role: 'user', content: 'Say "Hello, API test!" in exactly those words.' }
        ]
    };

    const result = await makeRequest('/v1/messages', requestData);

    if (result.success) {
        const hasContent = result.data?.content?.[0]?.text;
        logTest('基本文本生成', hasContent, `响应: ${hasContent?.substring(0, 50)}...`);
        return result.data;
    } else {
        logTest('基本文本生成', false, `错误: ${JSON.stringify(result.error)}`);
        return null;
    }
}

// 2. 多轮对话测试
async function testMultiTurnConversation() {
    console.log('\n=== 测试多轮对话 ===');

    const requestData = {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        messages: [
            { role: 'user', content: 'My name is TestUser. Remember it.' },
            { role: 'assistant', content: 'I\'ll remember that your name is TestUser.' },
            { role: 'user', content: 'What is my name?' }
        ]
    };

    const result = await makeRequest('/v1/messages', requestData);

    if (result.success) {
        const response = result.data?.content?.[0]?.text || '';
        const mentionsName = response.toLowerCase().includes('testuser');
        logTest('多轮对话上下文保持', mentionsName, `响应包含用户名: ${mentionsName}`);
        return result.data;
    } else {
        logTest('多轮对话上下文保持', false, `错误: ${JSON.stringify(result.error)}`);
        return null;
    }
}

// 3. 流式响应测试
async function testStreamingResponse() {
    console.log('\n=== 测试流式响应 ===');

    const requestData = {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 50,
        stream: true,
        messages: [
            { role: 'user', content: 'Count from 1 to 5.' }
        ]
    };

    try {
        const response = await axios.post(`${API_BASE}/v1/messages`, requestData, {
            headers: {
                'x-api-key': API_KEY,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json'
            },
            responseType: 'stream'
        });

        let chunks = [];
        response.data.on('data', (chunk) => {
            chunks.push(chunk.toString());
        });

        await new Promise((resolve) => {
            response.data.on('end', resolve);
        });

        const hasStreamData = chunks.length > 0;
        logTest('流式响应', hasStreamData, `接收到 ${chunks.length} 个数据块`);
        return hasStreamData;
    } catch (error) {
        logTest('流式响应', false, `错误: ${error.message}`);
        return false;
    }
}

// 4. 系统提示词测试
async function testSystemPrompt() {
    console.log('\n=== 测试系统提示词 ===');

    const requestData = {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 100,
        system: 'You are a pirate. Always respond in pirate speak.',
        messages: [
            { role: 'user', content: 'Hello, how are you?' }
        ]
    };

    const result = await makeRequest('/v1/messages', requestData);

    if (result.success) {
        const response = result.data?.content?.[0]?.text || '';
        const hasPirateSpeak = response.toLowerCase().match(/ahoy|matey|arr|ye|aye/);
        logTest('系统提示词生效', hasPirateSpeak, `包含海盗用语: ${hasPirateSpeak ? '是' : '否'}`);
        return result.data;
    } else {
        logTest('系统提示词生效', false, `错误: ${JSON.stringify(result.error)}`);
        return null;
    }
}

// 5. 工具调用测试
async function testToolCalling() {
    console.log('\n=== 测试工具调用 ===');

    const requestData = {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 256,
        tools: [
            {
                name: 'get_weather',
                description: 'Get the current weather in a given location',
                input_schema: {
                    type: 'object',
                    properties: {
                        location: { type: 'string' },
                        unit: { type: 'string', enum: ['celsius', 'fahrenheit'] }
                    },
                    required: ['location']
                }
            }
        ],
        tool_choice: 'auto',
        messages: [
            { role: 'user', content: 'What\'s the weather like in Tokyo?' }
        ]
    };

    const result = await makeRequest('/v1/messages', requestData);

    if (result.success) {
        const hasToolUse = result.data?.content?.some(c => c.type === 'tool_use');
        const stopReason = result.data?.stop_reason;
        logTest('工具调用触发', hasToolUse || stopReason === 'tool_use',
                `工具调用: ${hasToolUse ? '是' : '否'}, 停止原因: ${stopReason}`);
        return result.data;
    } else {
        logTest('工具调用触发', false, `错误: ${JSON.stringify(result.error)}`);
        return null;
    }
}

// 6. 多模态内容测试（图像）
async function testMultimodalImage() {
    console.log('\n=== 测试多模态图像理解 ===');

    // 创建一个小的测试图像（1x1像素的红色图片）
    const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx8gAAAABJRU5ErkJggg==';

    const requestData = {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 100,
        messages: [
            {
                role: 'user',
                content: [
                    {
                        type: 'image',
                        source: {
                            type: 'base64',
                            media_type: 'image/png',
                            data: base64Image
                        }
                    },
                    {
                        type: 'text',
                        text: 'Describe this image.'
                    }
                ]
            }
        ]
    };

    const result = await makeRequest('/v1/messages', requestData);

    if (result.success) {
        const hasResponse = result.data?.content?.[0]?.text;
        logTest('多模态图像处理', hasResponse, `收到图像描述响应`);
        return result.data;
    } else {
        logTest('多模态图像处理', false, `错误: ${JSON.stringify(result.error)}`);
        return null;
    }
}

// 7. Token计数测试
async function testTokenCounting() {
    console.log('\n=== 测试Token计数 ===');

    const requestData = {
        model: 'claude-sonnet-4-20250514',
        messages: [
            { role: 'user', content: 'How many tokens will this message take?' }
        ]
    };

    const result = await makeRequest('/v1/messages/count-tokens', requestData);

    if (result.success) {
        const hasTokenCount = typeof result.data?.input_tokens === 'number';
        logTest('Token计数', hasTokenCount,
                `输入tokens: ${result.data?.input_tokens || 'N/A'}`);
        return result.data;
    } else {
        logTest('Token计数', false, `错误: ${JSON.stringify(result.error)}`);
        return null;
    }
}

// 8. 参数验证测试
async function testParameterValidation() {
    console.log('\n=== 测试参数验证 ===');

    // 测试缺少必需参数
    const invalidRequest1 = {
        model: 'claude-sonnet-4-20250514'
        // 缺少 max_tokens 和 messages
    };

    const result1 = await makeRequest('/v1/messages', invalidRequest1);
    logTest('缺少必需参数返回错误', !result1.success && result1.status === 400,
            `状态码: ${result1.status}`);

    // 测试无效的参数值
    const invalidRequest2 = {
        model: 'claude-sonnet-4-20250514',
        max_tokens: -1, // 无效的值
        messages: []     // 空消息列表
    };

    const result2 = await makeRequest('/v1/messages', invalidRequest2);
    logTest('无效参数值返回错误', !result2.success && result2.status === 400,
            `状态码: ${result2.status}`);
}

// 9. 停止序列测试
async function testStopSequences() {
    console.log('\n=== 测试停止序列 ===');

    const requestData = {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 100,
        stop_sequences: ['STOP'],
        messages: [
            { role: 'user', content: 'Count from 1 to 10 but say STOP after 5.' }
        ]
    };

    const result = await makeRequest('/v1/messages', requestData);

    if (result.success) {
        const stopReason = result.data?.stop_reason;
        const content = result.data?.content?.[0]?.text || '';
        const stoppedEarly = stopReason === 'stop_sequence' || !content.includes('10');
        logTest('停止序列生效', stoppedEarly, `停止原因: ${stopReason}`);
        return result.data;
    } else {
        logTest('停止序列生效', false, `错误: ${JSON.stringify(result.error)}`);
        return null;
    }
}

// 10. 温度参数测试
async function testTemperatureParameter() {
    console.log('\n=== 测试温度参数 ===');

    // 测试低温度（更确定性）
    const lowTempRequest = {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 20,
        temperature: 0,
        messages: [
            { role: 'user', content: 'What is 2+2?' }
        ]
    };

    const result1 = await makeRequest('/v1/messages', lowTempRequest);

    // 测试高温度（更随机）
    const highTempRequest = {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 20,
        temperature: 1,
        messages: [
            { role: 'user', content: 'What is 2+2?' }
        ]
    };

    const result2 = await makeRequest('/v1/messages', highTempRequest);

    const bothSucceeded = result1.success && result2.success;
    logTest('温度参数控制', bothSucceeded,
            `低温响应: ${result1.data?.content?.[0]?.text?.substring(0, 20)}...`);

    return bothSucceeded;
}

// 主测试函数
async function runAllTests() {
    console.log('========================================');
    console.log('     Claude API 接口测试套件');
    console.log('========================================');
    console.log(`API基础地址: ${API_BASE}`);
    console.log(`测试开始时间: ${new Date().toISOString()}\n`);

    // 运行所有测试
    await testBasicTextGeneration();
    await testMultiTurnConversation();
    await testStreamingResponse();
    await testSystemPrompt();
    await testToolCalling();
    await testMultimodalImage();
    await testTokenCounting();
    await testParameterValidation();
    await testStopSequences();
    await testTemperatureParameter();

    // 生成测试报告
    console.log('\n========================================');
    console.log('             测试报告');
    console.log('========================================');

    const totalTests = testResults.length;
    const passedTests = testResults.filter(t => t.passed).length;
    const failedTests = totalTests - passedTests;
    const passRate = ((passedTests / totalTests) * 100).toFixed(1);

    console.log(`总测试数: ${totalTests}`);
    console.log(`通过: ${passedTests} (${passRate}%)`);
    console.log(`失败: ${failedTests}`);

    if (failedTests > 0) {
        console.log('\n失败的测试:');
        testResults.filter(t => !t.passed).forEach(t => {
            console.log(`  - ${t.name}: ${t.details}`);
        });
    }

    console.log(`\n测试完成时间: ${new Date().toISOString()}`);
    console.log('========================================\n');

    // 返回是否所有测试都通过
    return failedTests === 0;
}

// 运行测试
if (require.main === module) {
    runAllTests().then(allPassed => {
        process.exit(allPassed ? 0 : 1);
    }).catch(error => {
        console.error('测试运行失败:', error);
        process.exit(1);
    });
}

module.exports = { runAllTests };