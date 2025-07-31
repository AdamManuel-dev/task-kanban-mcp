#\!/bin/bash
baseline=$(cat baseline.txt)
start_time=$(date +%s)

while true; do
  # Check for completed agents
  completed=0
  for log in agent*.log; do
    if [ -f "$log" ] && grep -q "COMPLETE:" "$log" 2>/dev/null; then
      ((completed++))
    fi
  done
  
  # Get current error count
  current_errors=$(npm run lint 2>&1 | grep "problems" | awk '{print $2}')
  if [ -z "$current_errors" ]; then
    current_errors=$baseline
  fi
  
  # Calculate metrics
  improvement=$((baseline - current_errors))
  elapsed=$(( ($(date +%s) - start_time) / 60 ))
  
  # Display status
  echo "$(date '+%H:%M:%S') - Agents: $completed/16 | Errors: $current_errors (${improvement} fixed) | Time: ${elapsed}m"
  
  # Check if all agents completed
  if [ $completed -eq 16 ]; then
    echo "All agents completed\! Final improvement: $improvement errors fixed"
    break
  fi
  
  sleep 10
done
