#\!/bin/bash
baseline=$(cat baseline_new.txt)
start_time=$(date +%s)

echo "=== ORCHESTRATION MONITORING ==="
echo "Baseline: $baseline errors"
echo "Target: 100+ errors fixed in ~6 minutes"
echo ""

while true; do
  completed=$(find . -name "agent*.log" -exec tail -1 {} \; 2>/dev/null | grep -c "COMPLETE:")
  current_errors=$(npm run lint 2>&1 | grep "problems" | awk '{print $2}' | head -1)
  elapsed=$(( ($(date +%s) - start_time) / 60 ))
  improvement=$((baseline - current_errors))
  
  echo "$(date '+%H:%M:%S') - $completed/16 agents completed | Errors: $current_errors (${improvement} fixed) | ${elapsed}m elapsed"
  
  if [ $completed -eq 16 ]; then
    echo "All 16 agents completed\!"
    break
  fi
  
  sleep 10
done

echo ""
echo "Final Report:"
for i in {1..16}; do
  if [ -f "agent${i}.log" ]; then
    echo -n "Agent $i: "
    tail -1 "agent${i}.log" | grep "COMPLETE:" || echo "Failed/No completion message"
  fi
done
