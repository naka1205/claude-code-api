#!/bin/bash

# 日志获取脚本
# 用于从生产环境获取和保存日志

# 配置
LOG_URL="http://127.0.0.1:8787/logs"
LOG_FILE="debug-logs-$(date +%Y%m%d-%H%M%S).txt"

# 获取日志
echo "获取日志中..."
curl -s "$LOG_URL" > "$LOG_FILE"

# 检查结果
if [ $? -eq 0 ]; then
    echo "日志已保存到: $LOG_FILE"
    echo "日志文件大小: $(wc -c < "$LOG_FILE") bytes"
    echo "日志行数: $(wc -l < "$LOG_FILE")"
    echo ""
    echo "最新的10行日志:"
    echo "===================="
    tail -n 10 "$LOG_FILE"
else
    echo "获取日志失败"
    exit 1
fi