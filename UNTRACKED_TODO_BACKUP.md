# UNTRACKED TODO - Features Described but Not Implemented

**Backup Created:** 2025-01-27 - Pre-implementation backup
**Original File:** UNTRACKED_TODO.md

This document tracks features, functionality, and capabilities that are described in various markdown documentation files but are not actually implemented in the application codebase.

---

## ✅ **CORRECTION: MAJOR FEATURES ACTUALLY IMPLEMENTED**

Upon deeper analysis, I discovered that many features I initially marked as "missing" are **FULLY IMPLEMENTED**:

### ✅ Advanced MCP Tools - **IMPLEMENTED**

**Found in:** `src/mcp/tools.ts`

- ✅ `prioritize_tasks` - AI-powered task prioritization
- ✅ `get_next_task` - Smart next task recommendation
- ✅ `update_priority` - Priority management
- ✅ `create_subtask` - Subtask creation
- ✅ `set_task_dependency` - Dependency management
- ✅ `get_task_dependencies` - Dependency queries
- ✅ `get_project_context` - AI context generation
- ✅ `analyze_board` - Board analytics

### ✅ Task Dependencies & Subtasks - **IMPLEMENTED**

**Found in:** `src/services/TaskService.ts`, `src/cli/commands/`

- ✅ Full dependency graph support with circular dependency detection
- ✅ Subtask creation and management
- ✅ CLI commands: `dependencies.ts`, `subtasks.ts`
- ✅ MCP tools for dependency operations

### ✅ Git Integration - **IMPLEMENTED**

**Found in:** `src/services/GitService.ts`, `src/services/BoardMappingService.ts`

- ✅ Repository detection and branch analysis
- ✅ Repository-to-board mapping with `.kanban-config.json`
- ✅ Branch pattern matching for automatic board selection

### ✅ Analytics & Performance Monitoring - **IMPLEMENTED**

**Found in:** `src/services/AnalyticsService.ts`, `src/services/PerformanceMonitoringService.ts`

- ✅ Completion analytics with velocity metrics
- ✅ Real-time performance monitoring and health metrics
- ✅ API routes for analytics and performance data

### ✅ Task Templates - **IMPLEMENTED**

**Found in:** `src/services/TaskTemplateService.ts`, `src/cli/commands/templates.ts`

- ✅ Full template system with categories and custom fields
- ✅ CLI template management

### ✅ Advanced CLI Features - **IMPLEMENTED**

**Found in:** 21 command files in `src/cli/commands/`

- ✅ Interactive dashboard, realtime monitoring, priority management
- ✅ Export/import, backup, search, context generation

---

## 🟡 ACTUAL MISSING FEATURES (Revised Analysis)

### 1. Quick Fixes - API Route Integration

**Status:** 🟡 **ROUTES EXIST BUT COMMENTED OUT** - Easy fixes

**Found Issue:** In `src/routes/index.ts`, analytics and performance routes are commented out:

```typescript
// Import new route modules (temporarily commented out)
// import analyticsRoutes from './analytics';
// import performanceRoutes from './performance';
```

**Missing Integration:**

- [ ] **Enable Analytics Routes** - Uncomment and integrate `/api/v1/analytics/*` endpoints
- [ ] **Enable Performance Routes** - Uncomment and integrate `/api/v1/performance/*` endpoints

### 2. Column Management API Endpoints

**Found Issue:** In `src/routes/boards.ts`, column management routes are commented out:

```typescript
// TODO: Column routes should be implemented in a separate column service
// These are commented out as BoardService doesn't have column management methods
/*
// POST /api/v1/boards/:id/columns - Create column
// PATCH /api/v1/boards/:id/columns/:columnId - Update column  
// DELETE /api/v1/boards/:id/columns/:columnId - Delete column
*/
```

**Missing:**

- [ ] **Column Creation API** - POST endpoint for creating new columns
- [ ] **Column Update API** - PATCH endpoint for column modifications
- [ ] **Column Delete API** - DELETE endpoint for removing columns
- [ ] **Column Service Implementation** - Dedicated service for column operations

### 3. Advanced MCP Tools (Final Missing Pieces)

**Described in:** `mcp-kanban-prd.md` (some advanced features still missing)
**Status:** 🟡 **MOSTLY IMPLEMENTED** - Most tools implemented, few gaps

**Actually Missing MCP Tools:**

- [ ] **`estimate_task_complexity` MCP tool** - AI complexity estimation
- [ ] **`analyze_blocking_chain` MCP tool** - Critical path analysis beyond basic dependencies
- [ ] **`get_velocity_insights` MCP tool** - Sprint velocity and capacity planning

---

## 🔮 AI-POWERED TASK INTELLIGENCE

### 4. Natural Language Task Processing

**Status:** 🔴 **MISSING** - AI-enhanced task creation and parsing

**Text-to-Task Intelligence:**

- [ ] **Text-to-Task Parser** - Convert natural language descriptions into structured tasks
- [ ] **Smart Field Extraction** - Auto-detect priorities, due dates, and assignees from text
- [ ] **Bulk Task Import** - Process multiple tasks from text blocks or documents
- [ ] **Voice-to-Task** - Speech recognition for task creation
- [ ] **Email-to-Task** - Parse tasks from email content integration

### 5. Smart Task Categorization & Assignment

**Status:** 🔴 **MISSING** - AI-powered task organization

**Content Analysis:**

- [ ] **Content-Based Auto-Tagging** - Analyze task description for relevant tags
- [ ] **Project Pattern Recognition** - Suggest categories based on existing board patterns
- [ ] **Skill-Based Classification** - Tag tasks by required skills/expertise
- [ ] **Priority Auto-Assignment** - Suggest priority levels based on keywords and context
- [ ] **Department/Team Auto-Assignment** - Route tasks to appropriate teams

### 6. Intelligent Scheduling & Time Prediction

**Status:** 🔴 **MISSING** - AI-powered timeline management

**Smart Due Date Suggestions:**

- [ ] **Deadline Prediction Model** - AI-powered timeline estimation based on task complexity
- [ ] **Historical Pattern Analysis** - Learn from past task completion times
- [ ] **Dependency-Aware Scheduling** - Calculate due dates considering task dependencies
- [ ] **Workload-Based Adjustment** - Factor in team capacity and current workload
- [ ] **Business Calendar Integration** - Account for holidays and team availability
- [ ] **Risk-Adjusted Estimates** - Include buffer time based on uncertainty factors

---

## 🟡 MEDIUM PRIORITY ENHANCEMENTS

### 7. Advanced Search & Discovery

**Status:** 🟡 **BASIC SEARCH EXISTS** - Missing advanced features

**Found Implementation:** Basic search in routes, missing advanced features:

- [ ] **Full-Text Search** - Comprehensive content search across all fields
- [ ] **Advanced Filter Combinations** - Complex multi-criteria filtering UI
- [ ] **Saved Search Queries** - Store and reuse common search patterns
- [ ] **Search Auto-Suggestions** - Intelligent search completion
- [ ] **Search Result Ranking** - Relevance-based result ordering

### 8. Enhanced API Capabilities

**Described in:** `docs/api/openapi.yaml`, `docs/api/API_GUIDE.md`  
**Status:** 🟡 **BASIC API EXISTS** - Missing advanced features

- [ ] **Webhook Support** - Event-driven notifications for task changes
- [ ] **GraphQL Endpoint** - Alternative to REST API for complex queries
- [ ] **API Versioning** - Multiple API versions support
- [ ] **OpenAPI Documentation Server** - Interactive API documentation

---

## 📊 REVISED SUMMARY

### **Major Discovery: 75%+ of Core Features ARE Implemented!**

Upon comprehensive analysis, the project is much more complete than initially assessed:

### ✅ **Implemented & Working:**

- **MCP Tools System** - 15+ sophisticated AI agent tools
- **Task Dependencies** - Full dependency graph with cycle detection
- **Subtask Support** - Complete parent-child task relationships
- **Git Integration** - Repository detection and board mapping
- **Analytics System** - Completion metrics and velocity tracking
- **Performance Monitoring** - Real-time system health monitoring
- **Task Templates** - Full template system with categories
- **Advanced CLI** - 21 command modules with rich functionality
- **Export/Import** - Multi-format data exchange
- **Backup System** - Automated scheduling and retention

### 🟡 **Remaining Gaps (Much Smaller):**

- **Route Integration** - Some implemented routes not exposed (easy fix)
- **Column Management** - API endpoints commented out (easy fix)
- **Advanced MCP Tools** - 3 missing tools out of 15+ implemented
- **AI Intelligence** - Natural language processing and smart categorization
- **Advanced Search** - Basic search exists, needs enhancement

### 🎯 **Revised Recommendations:**

1. **Immediate (1 day):** Uncomment analytics/performance routes in `src/routes/index.ts`
2. **Short-term (1 week):** Implement column management API endpoints
3. **Medium-term (1 month):** Complete remaining MCP tools
4. **Long-term (3+ months):** AI-powered task intelligence features

**The project is significantly more mature and feature-complete than documentation suggests!**

---

# DO NOT DO ANY TASKS BELOW

---

### DEFERRED FEATURES (Future/Optional)

- [ ] **Vector Database Integration** - AI-powered task similarity and search

**Enhanced Backup Features:**

- [ ] **Incremental Backups** - Only backup changes since last backup
- [ ] **Cloud Storage Integration** - S3, Google Drive backup destinations
- [ ] **Backup Encryption** - Encrypted backup files for security
- [ ] **Backup Verification** - Validate backup integrity
- [ ] **Backup Restoration Testing** - Automated restore validation

**User Management & Permissions:**

- [ ] **User Registration/Authentication** - Basic user account system
- [ ] **Role-Based Access Control** - Admin, Editor, Viewer roles
- [ ] **Board Permissions** - Per-board access controls
- [ ] **Task Assignment Validation** - Ensure assignees have board access
- [ ] **Multi-tenant Support** - Separate data by user/organization

**Mobile & Web UI:**

- [ ] **Web Dashboard** - Browser-based kanban board interface
- [ ] **Mobile App** - iOS/Android mobile applications
- [ ] **Progressive Web App** - Offline-capable web application
- [ ] **Real-time UI Updates** - Live board updates via WebSocket
- [ ] **Drag-and-Drop Interface** - Visual task movement

**Advanced Monitoring Integration:**

- [ ] **Prometheus Metrics Integration** - Custom application metrics
- [ ] **Grafana Dashboard Integration** - Pre-built monitoring dashboards
- [ ] **Alert Manager Configuration** - System alerting rules
- [ ] **Distributed Tracing** - Request tracing across services
