#!/usr/bin/env bash
# claude-collab-patroller v0.4.1 patrol sub-agent
# 紧轮询 5s collab-mcp inbox, 检测新 msg → 通知 main, 不做业务处理
# 跑满 480s 后退出 (Bash cap 安全)
set -u

PATROL_DURATION=480
POLL_INTERVAL=5
NOTIFIED_IDS_FILE="/tmp/ccp-patrol-notified-$$.txt"
MCP_COLLAB="bash D:/myopenclaw/scripts/mcp-collab.sh"
LOG_PREFIX="[patrol]"

start_ts=$(date +%s)
end_ts=$((start_ts + PATROL_DURATION))
touch "$NOTIFIED_IDS_FILE"

echo "$LOG_PREFIX $(date +%H:%M:%S) start, duration=${PATROL_DURATION}s, interval=${POLL_INTERVAL}s, pid=$$"

while [ "$(date +%s)" -lt "$end_ts" ]; do
  iter_start=$(date +%s)
  iter_no=$((iter_start - start_ts))
  iter_no=$((iter_no / POLL_INTERVAL + 1))

  # 1. 读 inbox (直查 collab-mcp API via wrapper)
  raw=$("$MCP_COLLAB" read --from baobei --limit 10 2>/dev/null)
  rc=$?

  if [ $rc -ne 0 ]; then
    echo "$LOG_PREFIX iter#${iter_no} $(date +%H:%M:%S) read rc=$rc, fail-open skip"
    sleep "$POLL_INTERVAL"
    continue
  fi

  if [ -z "$raw" ] || [ "$raw" = "[]" ]; then
    # silent: no msgs
    sleep "$POLL_INTERVAL"
    continue
  fi

  # 2. 解析 + 过滤: to_user=claude && !acked && from != claude
  new_count=0
  echo "$raw" | jq -c '.[]' 2>/dev/null | while IFS= read -r msg; do
    [ -z "$msg" ] && continue

    msg_id=$(echo "$msg" | jq -r '.id // empty')
    [ -z "$msg_id" ] && continue

    msg_from=$(echo "$msg" | jq -r '.from_user // .from // empty')
    msg_to=$(echo "$msg" | jq -r '.to_user // .to // empty')
    msg_acked=$(echo "$msg" | jq -r '.acked // false')
    msg_category=$(echo "$msg" | jq -r '.category // "info"')
    msg_content=$(echo "$msg" | jq -r '.content // ""')
    msg_ts=$(echo "$msg" | jq -r '.timestamp // .created_at // empty')

    # 过滤条件
    if [ "$msg_to" != "claude" ]; then continue; fi
    if [ "$msg_acked" = "true" ]; then continue; fi
    if [ "$msg_from" = "claude" ]; then continue; fi

    # 去重 (已通知过的不再通知)
    if grep -qxF "$msg_id" "$NOTIFIED_IDS_FILE" 2>/dev/null; then
      continue
    fi

    # 标记已通知
    echo "$msg_id" >> "$NOTIFIED_IDS_FILE"
    new_count=$((new_count + 1))

    # === SendMessage to main (sub-agent → main 通知) ===
    # 在真实 sub-agent context 这里调 SendMessage to main
    # 当前 inline 模式: 写 stdout 作为通知输出
    echo "===NOTIFY=== ts=$(date +%H:%M:%S) msg_id=$msg_id from=$msg_from to=$msg_to category=$msg_category created=$msg_ts"
    echo "===CONTENT=== ${msg_content:0:500}"
    echo "===END==="
  done

  # 3. sleep 到下个 interval
  iter_end=$(date +%s)
  iter_elapsed=$((iter_end - iter_start))
  sleep_for=$((POLL_INTERVAL - iter_elapsed))
  [ "$sleep_for" -gt 0 ] && sleep "$sleep_for"
done

elapsed=$(($(date +%s) - start_ts))
notified_total=$(wc -l < "$NOTIFIED_IDS_FILE" 2>/dev/null || echo 0)
echo "$LOG_PREFIX $(date +%H:%M:%S) duration reached (${elapsed}s), notified=${notified_total}, exiting"
rm -f "$NOTIFIED_IDS_FILE"
exit 0