#!/bin/bash

# Claude API 完整测试套件运行脚本
# 用于运行所有测试并生成综合报告

echo "========================================="
echo "     Claude API 完整测试套件"
echo "========================================="
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 配置
API_URL=${API_URL:-"https://your-worker.workers.dev"}
GEMINI_API_KEY=${GEMINI_API_KEY:-"YOUR_GEMINI_API_KEY"}
VERBOSE=${VERBOSE:-"false"}

# 检查环境变量
if [ "$GEMINI_API_KEY" = "YOUR_GEMINI_API_KEY" ]; then
    echo -e "${YELLOW}警告: 未设置 GEMINI_API_KEY 环境变量${NC}"
    echo "请设置: export GEMINI_API_KEY=your-actual-key"
    echo ""
fi

echo "配置信息:"
echo "  API URL: $API_URL"
echo "  API Key: ${GEMINI_API_KEY:0:10}..."
echo "  详细模式: $VERBOSE"
echo ""

# 测试结果统计
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
SKIPPED_TESTS=0

# 运行单个测试文件
run_test() {
    local test_file=$1
    local test_name=$2

    if [ ! -f "$test_file" ]; then
        echo -e "${YELLOW}⚠️  跳过: $test_name (文件不存在: $test_file)${NC}"
        ((SKIPPED_TESTS++))
        return
    fi

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo -e "🧪 运行: ${GREEN}$test_name${NC}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # 运行测试
    if API_URL=$API_URL GEMINI_API_KEY=$GEMINI_API_KEY VERBOSE=$VERBOSE node "$test_file"; then
        echo -e "${GREEN}✅ $test_name 通过${NC}"
        ((PASSED_TESTS++))
    else
        echo -e "${RED}❌ $test_name 失败${NC}"
        ((FAILED_TESTS++))
    fi

    ((TOTAL_TESTS++))
    echo ""

    # 测试之间添加延迟，避免速率限制
    sleep 2
}

# 开始时间
START_TIME=$(date +%s)

echo "========================================="
echo "          开始运行测试套件"
echo "========================================="
echo ""

# 1. 运行原始兼容性测试
run_test "test.js" "原始兼容性测试"

# 2. 运行基础功能测试
run_test "test/test-claude-basic.js" "Claude API 基础功能测试"

# 3. 运行高级功能测试
run_test "test/test-claude-advanced.js" "Claude API 高级功能测试"

# 4. 运行错误处理测试
run_test "test/test-claude-errors.js" "Claude API 错误处理测试"

# 5. 运行Token计数测试
run_test "test/test-claude-token-count.js" "Claude API Token计数测试"

# 结束时间
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# 生成最终报告
echo "========================================="
echo "           测试套件完成"
echo "========================================="
echo ""
echo "📊 测试统计:"
echo "  总测试数: $TOTAL_TESTS"
echo -e "  ${GREEN}通过: $PASSED_TESTS${NC}"
echo -e "  ${RED}失败: $FAILED_TESTS${NC}"
echo -e "  ${YELLOW}跳过: $SKIPPED_TESTS${NC}"

if [ $TOTAL_TESTS -gt 0 ]; then
    PASS_RATE=$(echo "scale=1; $PASSED_TESTS * 100 / $TOTAL_TESTS" | bc)
    echo "  通过率: ${PASS_RATE}%"
fi

echo "  执行时间: ${DURATION}秒"
echo ""

# 生成建议
echo "💡 建议:"
if [ $FAILED_TESTS -eq 0 ] && [ $TOTAL_TESTS -gt 0 ]; then
    echo -e "  ${GREEN}所有测试通过！API 转换功能正常工作。${NC}"
elif [ $FAILED_TESTS -gt 0 ]; then
    echo -e "  ${RED}有 $FAILED_TESTS 个测试失败，请检查失败的测试用例。${NC}"
    echo "  运行 VERBOSE=true 模式可以查看详细的错误信息:"
    echo "    VERBOSE=true ./run-all-tests.sh"
fi

if [ $SKIPPED_TESTS -gt 0 ]; then
    echo -e "  ${YELLOW}有 $SKIPPED_TESTS 个测试被跳过，可能是测试文件缺失。${NC}"
fi

echo ""
echo "========================================="

# 设置退出码
if [ $FAILED_TESTS -gt 0 ]; then
    exit 1
else
    exit 0
fi