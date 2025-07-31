#\!/bin/bash
baseline=$(cat baseline.txt)
start_time=$(date +%s)

echo "=== ORCHESTRATION MONITORING STARTED ==="
echo "Baseline errors: $baseline"
echo "Target: 100+ errors fixed in ~6 minutes"
echo ""

while true; do
  # Count completed agents
  completed=0
  for i in {1..16}; do
    if [ -f "agent${i}.log" ] && grep -q "COMPLETE:" "agent${i}.log" 2>/dev/null; then
      ((completed++))
    fi
  done
  
  # Get current error count
  current_errors=$(npm run lint 2>&1 | grep "problems" | awk '{print $2}' | head -1)
  if [ -z "$current_errors" ]; then
    current_errors=$baseline
  fi
  
  # Calculate metrics
  improvement=$((baseline - current_errors))
  elapsed_sec=$(( $(date +%s) - start_time ))
  elapsed_min=$(( elapsed_sec / 60 ))
  elapsed_remaining=$(( elapsed_sec % 60 ))
  
  # Calculate rate
  if [ $elapsed_sec -gt 0 ]; then
    rate=$(echo "scale=1; $improvement * 60 / $elapsed_sec" | bc 2>/dev/null || echo "0")
  else
    rate="0"
  fi
  
  # Display detailed status
  printf "\r[%s] Agents: %2d/16 | Errors: %4d (-%3d) | Rate: %4s/min | Time: %dm%02ds" \
    "$(date '+%H:%M:%S')" "$completed" "$current_errors" "$improvement" "$rate" "$elapsed_min" "$elapsed_remaining"
  
  # Check completion
  if [ $completed -eq 16 ]; then
    echo ""
    echo "=== ALL AGENTS COMPLETED ==="
    echo "Final statistics:"
    echo "- Errors fixed: $improvement"
    echo "- Time taken: ${elapsed_min}m${elapsed_remaining}s"
    echo "- Average rate: ${rate} errors/min"
    
    # Show agent results
    echo ""
    echo "Agent completion messages:"
    for i in {1..16}; do
      if [ -f "agent${i}.log" ]; then
        grep "COMPLETE:" "agent${i}.log" 2>/dev/null | tail -1
      fi
    done
    break
  fi
  
  sleep 5
done
