#!/usr/bin/env bash
set -euo pipefail

STREAMDESK_URL="${STREAMDESK_URL:-__STREAMDESK_URL__}"
STREAMDESK_AGENT_TOKEN="${STREAMDESK_AGENT_TOKEN:-__STREAMDESK_AGENT_TOKEN__}"
STREAMDESK_AGENT_TYPE="${STREAMDESK_AGENT_TYPE:-__STREAMDESK_AGENT_TYPE__}"
STREAMDESK_AGENT_LOCATION="${STREAMDESK_AGENT_LOCATION:-__STREAMDESK_AGENT_LOCATION__}"
STREAMDESK_COMPANY_ID="${STREAMDESK_COMPANY_ID:-__STREAMDESK_COMPANY_ID__}"
STREAMDESK_WORKSPACE_KEY="${STREAMDESK_WORKSPACE_KEY:-__STREAMDESK_WORKSPACE_KEY__}"
STREAMDESK_AGENT_INTERVAL_SEC="${STREAMDESK_AGENT_INTERVAL_SEC:-__STREAMDESK_AGENT_INTERVAL_SEC__}"
STREAMDESK_AGENT_KEY="${STREAMDESK_AGENT_KEY:-}"

if [ -z "$STREAMDESK_AGENT_KEY" ]; then
  STREAMDESK_AGENT_KEY="$(hostname)-$(cat /etc/machine-id 2>/dev/null | cut -c1-12 || date +%s)"
fi

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

get_local_ip() {
  hostname -I 2>/dev/null | awk '{print $1}'
}

get_cpu_percent() {
  local cpu_a cpu_b idle_a idle_b total_a total_b used diff_total diff_used
  read -r _ user_a nice_a sys_a idle_a iowait_a irq_a softirq_a steal_a _ < /proc/stat
  total_a=$((user_a + nice_a + sys_a + idle_a + iowait_a + irq_a + softirq_a + steal_a))
  used_a=$((user_a + nice_a + sys_a + irq_a + softirq_a + steal_a))
  sleep 1
  read -r _ user_b nice_b sys_b idle_b iowait_b irq_b softirq_b steal_b _ < /proc/stat
  total_b=$((user_b + nice_b + sys_b + idle_b + iowait_b + irq_b + softirq_b + steal_b))
  used_b=$((user_b + nice_b + sys_b + irq_b + softirq_b + steal_b))
  diff_total=$((total_b - total_a))
  diff_used=$((used_b - used_a))
  if [ "$diff_total" -le 0 ]; then
    printf '0'
  else
    awk -v used="$diff_used" -v total="$diff_total" 'BEGIN { printf "%.1f", (used / total) * 100 }'
  fi
}

while true; do
  HOSTNAME_VALUE="$(hostname)"
  LOCAL_IP="$(get_local_ip)"
  CPU_PERCENT="$(get_cpu_percent)"
  CPU_NAME="$(awk -F: '/model name/ {gsub(/^[ \t]+/, "", $2); print $2; exit}' /proc/cpuinfo 2>/dev/null || printf 'Linux CPU')"
  CPU_CORES="$(nproc 2>/dev/null || printf '1')"
  MEMORY_TOTAL_MB="$(free -m | awk '/Mem:/ {print $2}')"
  MEMORY_USED_MB="$(free -m | awk '/Mem:/ {print $3}')"
  MEMORY_PERCENT="$(awk -v used="$MEMORY_USED_MB" -v total="$MEMORY_TOTAL_MB" 'BEGIN { if (total > 0) printf "%.1f", (used / total) * 100; else print "0" }')"
  MEMORY_TOTAL_GB="$(awk -v total="$MEMORY_TOTAL_MB" 'BEGIN { printf "%.2f", total / 1024 }')"
  MEMORY_USED_GB="$(awk -v used="$MEMORY_USED_MB" 'BEGIN { printf "%.2f", used / 1024 }')"
  DISK_TOTAL_GB="$(df -BG / | awk 'NR==2 {gsub(/G/, "", $2); print $2}')"
  DISK_USED_GB="$(df -BG / | awk 'NR==2 {gsub(/G/, "", $3); print $3}')"
  DISK_FREE_GB="$(df -BG / | awk 'NR==2 {gsub(/G/, "", $4); print $4}')"
  DISK_PERCENT="$(df -P / | awk 'NR==2 {gsub(/%/, "", $5); print $5}')"
  OS_CAPTION="$(uname -srmo 2>/dev/null || printf 'Linux')"
  UPTIME_SEC="$(cut -d. -f1 /proc/uptime 2>/dev/null || printf '0')"
  PROCESS_COUNT="$(ps -e --no-headers 2>/dev/null | wc -l | awk '{print $1}')"
  COLLECTED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

  PAYLOAD="$(cat <<JSON
{"agentKey":"$(json_escape "$STREAMDESK_AGENT_KEY")","name":"$(json_escape "$HOSTNAME_VALUE")","hostname":"$(json_escape "$HOSTNAME_VALUE")","type":"$(json_escape "$STREAMDESK_AGENT_TYPE")","location":"$(json_escape "$STREAMDESK_AGENT_LOCATION")","companyId":"$(json_escape "$STREAMDESK_COMPANY_ID")","workspaceKey":"$(json_escape "$STREAMDESK_WORKSPACE_KEY")","ipAddress":"$(json_escape "$LOCAL_IP")","localIps":["$(json_escape "$LOCAL_IP")"],"version":"1.0.0","intervalSec":$STREAMDESK_AGENT_INTERVAL_SEC,"capabilities":["monitoring"],"metrics":{"cpuPercent":$CPU_PERCENT,"cpuName":"$(json_escape "$CPU_NAME")","cpuCores":$CPU_CORES,"cpuLogicalProcessors":$CPU_CORES,"memoryPercent":$MEMORY_PERCENT,"memoryUsedGb":$MEMORY_USED_GB,"memoryTotalGb":$MEMORY_TOTAL_GB,"diskPercent":$DISK_PERCENT,"diskFreeGb":$DISK_FREE_GB,"diskTotalGb":$DISK_TOTAL_GB,"osCaption":"$(json_escape "$OS_CAPTION")","uptimeSec":$UPTIME_SEC,"processCount":$PROCESS_COUNT,"gpuNames":[],"sampleIntervalSec":$STREAMDESK_AGENT_INTERVAL_SEC,"collectedAt":"$COLLECTED_AT"},"vmix":{"enabled":false,"connected":false}}
JSON
)"

  if [ -n "$STREAMDESK_AGENT_TOKEN" ]; then
    curl -fsS -X POST "$STREAMDESK_URL/api/agents/heartbeat" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $STREAMDESK_AGENT_TOKEN" \
      --data "$PAYLOAD" >/dev/null || true
  else
    curl -fsS -X POST "$STREAMDESK_URL/api/agents/heartbeat" \
      -H "Content-Type: application/json" \
      --data "$PAYLOAD" >/dev/null || true
  fi

  sleep "$STREAMDESK_AGENT_INTERVAL_SEC"
done
