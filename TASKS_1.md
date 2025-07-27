# TASKS_1.md - Critical PRD Features & Code Quality

**Task Group**: 2 of 4  
**Focus**: Missing PRD Features, Code Quality, Core Functionality  
**Priority**: P0-P1 (Critical to High)  
**Estimated Effort**: 3-4 weeks

## 🎯 CRITICAL PRD FEATURE GAPS (14 tasks)

### 1. Missing MCP Tools (AI Agent Integration)
1. **Implement create_subtask MCP tool**
   - **Priority**: P0 - Required for AI agents
   - **Action**: Create MCP tool to handle subtask creation
   - **Integration**: Link with existing TaskService subtask logic
   - **Validation**: Parent task existence, permission checks

2. **Implement set_task_dependency MCP tool**
   - **Priority**: P0 - Core dependency management
   - **Action**: Create tool for setting task dependencies
   - **Features**: Circular dependency detection, validation
   - **Integration**: Use existing dependency validation logic

3. **Implement get_task_dependencies MCP tool**
   - **Priority**: P0 - Dependency querying
   - **Action**: Tool to retrieve task dependency graph
   - **Output**: Dependency tree, blocking/blocked tasks
   - **Format**: Structured data for AI processing

4. **Implement prioritize_tasks MCP tool**
   - **Priority**: P0 - AI-powered prioritization
   - **Action**: Tool for AI to trigger priority recalculation
   - **Algorithm**: Context-aware priority scoring
   - **Parameters**: Optional context filters, urgency factors

5. **Implement get_next_task MCP tool**
   - **Priority**: P0 - Task recommendation
   - **Action**: Get next best task for current context
   - **Logic**: Priority score, dependencies, user context
   - **Output**: Single task with reasoning

6. **Implement update_priority MCP tool**
   - **Priority**: P0 - Priority management
   - **Action**: Update task priority with reasoning
   - **Validation**: Priority range, business rules
   - **Audit**: Track priority changes

### 2. Backend Dependencies & Subtasks (FR9)
7. **Enhance task dependencies backend**
   - **Status**: Partially implemented
   - **Missing**: Advanced dependency queries, critical path
   - **Action**: Add dependency graph analysis
   - **Features**: Impact analysis, blocking chain resolution

8. **Complete subtasks backend implementation**
   - **Status**: Basic implementation exists
   - **Missing**: Progress calculation, completion cascading
   - **Action**: Enhance parent task progress calculation
   - **Logic**: Weighted completion based on subtask status

### 3. AI-Powered Prioritization System
9. **Design priority scoring algorithm**
   - **Factors**: Urgency, importance, dependencies, deadlines
   - **Context**: User patterns, project phase, blockers
   - **Machine Learning**: Pattern recognition for similar tasks
   - **Adaptation**: Learn from user priority adjustments

10. **Implement context-aware prioritization**
    - **Git Integration**: Current branch, commit patterns
    - **Time Context**: Deadlines, sprints, time of day
    - **User Context**: Work patterns, preferences
    - **Project Context**: Milestones, dependencies

### 4. Missing CLI Commands
11. **Add kanban task depend command**
    - **Usage**: `kanban task depend <task-id> <dependency-id>`
    - **Features**: Add/remove dependencies, view graph
    - **Validation**: Circular dependency prevention

12. **Add kanban task deps command**
    - **Usage**: `kanban task deps <task-id>`
    - **Output**: Dependency tree visualization
    - **Format**: Text tree, JSON for scripting

13. **Add kanban subtask commands**
    - **Create**: `kanban subtask create <parent-id> <title>`
    - **List**: `kanban subtask list <parent-id>`
    - **Status**: Progress indicators, completion tracking

14. **Add kanban next command**
    - **Usage**: `kanban next [context]`
    - **Output**: Next recommended task with reasoning
    - **Context**: Optional board, priority, skill filters

## 🔧 CODE QUALITY IMPROVEMENTS (18 tasks)

### 5. Naming Convention Fixes
15. **Fix camelCase naming issues**
    - **Count**: 100+ errors
    - **Pattern**: `board_id` → `boardId`
    - **Scope**: Variables, functions, properties
    - **Database**: Update column mappings

16. **Fix dot notation issues**
    - **Count**: 50+ errors
    - **Pattern**: `obj["property"]` → `obj.property`
    - **Scope**: All property access
    - **Exception**: Dynamic property names only

17. **Fix underscore dangle issues**
    - **Count**: 30+ errors
    - **Pattern**: Remove leading/trailing underscores
    - **Exception**: Private members (use proper conventions)

### 6. Logical Operations & Control Flow
18. **Replace logical OR with nullish coalescing**
    - **Count**: 30+ warnings
    - **Pattern**: `||` → `??` for null/undefined checks
    - **Safety**: Prevents falsy value bugs (0, "", false)

19. **Fix continue statements**
    - **Count**: 15+ errors
    - **Action**: Refactor loops to avoid continue
    - **Pattern**: Use early returns, conditional logic

20. **Fix restricted syntax (for...in, for...of)**
    - **Count**: 40+ errors
    - **Replacement**: Array methods (map, filter, reduce)
    - **Benefits**: Functional programming, better performance

21. **Fix nested ternary expressions**
    - **Count**: 3+ errors
    - **Action**: Convert to if/else or switch statements
    - **Readability**: Improve code clarity

### 7. Class & Method Issues
22. **Fix class methods not using this**
    - **Count**: 30+ errors
    - **Options**: Convert to static or add this usage
    - **Decision**: Move to utility functions if no class context

23. **Fix max classes per file**
    - **Count**: 5+ errors
    - **Action**: Split files, move classes to separate files
    - **Principle**: Single responsibility

24. **Remove useless constructors**
    - **Count**: 10+ errors
    - **Action**: Remove empty constructors
    - **Alternative**: Use default parameters

### 8. Switch Statement & Control Flow
25. **Add default cases to switch statements**
    - **Count**: 10+ errors
    - **Action**: Handle unexpected values
    - **Pattern**: Throw error or log warning

26. **Fix case declarations**
    - **Count**: 15+ errors
    - **Action**: Wrap case blocks in braces
    - **Pattern**: Block scoping for case contents

### 9. Function & Declaration Issues
27. **Fix no-use-before-define**
    - **Count**: 10+ errors
    - **Action**: Move declarations before usage
    - **Pattern**: Function expressions over hoisted declarations

28. **Fix variable shadowing**
    - **Count**: 5+ errors
    - **Action**: Rename shadowed variables
    - **Pattern**: Different names in nested scopes

29. **Replace var with let/const**
    - **Count**: 2+ errors
    - **Pattern**: Use const for immutable, let for mutable
    - **Benefit**: Block scoping, prevent hoisting issues

### 10. Template & String Issues
30. **Fix template expression restrictions**
    - **Count**: 10+ errors
    - **Action**: Convert non-string types before template usage
    - **Pattern**: Explicit toString() calls

31. **Add proper toString methods**
    - **Count**: 1+ error
    - **Action**: Add toString() for object string conversion
    - **Alternative**: JSON.stringify for complex objects

32. **Remove empty functions**
    - **Count**: 5+ errors
    - **Action**: Add meaningful implementation or remove
    - **Placeholder**: Add TODO comments for future work

## 🛠️ IMPLEMENTATION APPROACH

### Week 1: MCP Tools Foundation
- Days 1-2: Implement create_subtask and set_task_dependency tools
- Days 3-4: Add get_task_dependencies and prioritize_tasks tools
- Day 5: Implement get_next_task and update_priority tools

### Week 2: Backend Enhancements
- Days 1-2: Enhance dependencies backend, critical path analysis
- Days 3-4: Complete subtasks implementation
- Day 5: Design AI prioritization algorithm

### Week 3: CLI Commands & Quality
- Days 1-2: Add missing CLI commands (depend, deps, subtask, next)
- Days 3-4: Fix camelCase and dot notation issues
- Day 5: Fix control flow and logical operations

### Week 4: Class & Function Quality
- Days 1-2: Fix class methods and constructor issues
- Days 3-4: Fix switch statements and variable declarations
- Day 5: Fix template strings and remaining quality issues

## 🎯 SUCCESS METRICS

- **All MCP tools implemented** and tested
- **Dependencies & subtasks** fully functional
- **AI prioritization** working with context
- **CLI commands** available and documented
- **Code quality score** above 90%
- **No P0/P1 ESLint errors** remaining

## 📋 CHECKLIST

### MCP Tools
- [ ] create_subtask tool implemented
- [ ] set_task_dependency tool implemented  
- [ ] get_task_dependencies tool implemented
- [ ] prioritize_tasks tool implemented
- [ ] get_next_task tool implemented
- [ ] update_priority tool implemented

### Backend Features
- [ ] Dependencies backend enhanced
- [ ] Subtasks backend completed
- [ ] AI prioritization designed
- [ ] Context-aware features added

### CLI Commands
- [ ] kanban task depend command
- [ ] kanban task deps command
- [ ] kanban subtask commands
- [ ] kanban next command

### Code Quality
- [ ] CamelCase naming fixed
- [ ] Dot notation issues fixed
- [ ] Control flow improved
- [ ] Class methods fixed
- [ ] Switch statements corrected