#\!/bin/bash

echo "=== DEPLOYING AGENTS WITH WRITE PERMISSIONS ==="
echo "Starting at: $(date)"
baseline=$(npm run lint 2>&1 | grep "problems" | awk '{print $2}' | head -1)
echo "Baseline errors: $baseline"

# Deploy agents that explicitly request write permissions in their prompts
echo "Deploying high-impact agents with write capability..."

# Agent 1: Prettier fixes (high volume)
nohup claude -p "I need to fix prettier/prettier ESLint errors. I will:
1. Search for prettier violations
2. Fix semicolons, spacing, and formatting issues
3. Validate each fix with npm run lint
4. Report: PRETTIER AGENT COMPLETE: X files fixed
Please grant write permissions to fix these errors." > write_agent1.log 2>&1 &

# Agent 2: Unnecessary conditionals (high volume)
nohup claude -p "I need to fix @typescript-eslint/no-unnecessary-condition errors. I will:
1. Find unnecessary conditionals
2. Simplify: val ?? undefined to val, expr === true to expr
3. Test each change
4. Report: CONDITIONAL AGENT COMPLETE: X conditions fixed
Please grant write permissions to fix these errors." > write_agent2.log 2>&1 &

# Agent 3: Template literals
nohup claude -p "I need to fix @typescript-eslint/prefer-string-starts-ends-with errors. I will:
1. Find substr/substring patterns
2. Replace with startsWith/endsWith
3. Verify functionality preserved
4. Report: TEMPLATE AGENT COMPLETE: X templates fixed
Please grant write permissions to fix these errors." > write_agent3.log 2>&1 &

# Agent 4: Type safety
nohup claude -p "I need to fix @typescript-eslint/no-explicit-any errors. I will:
1. Find 'any' types in code
2. Replace with proper types or unknown
3. Run type checking
4. Report: TYPE AGENT COMPLETE: X types fixed
Please grant write permissions to fix these errors." > write_agent4.log 2>&1 &

echo "4 write-enabled agents deployed"
