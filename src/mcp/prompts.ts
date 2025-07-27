import type { Prompt, PromptMessage } from '@modelcontextprotocol/sdk/types.js';
import { logger } from '@/utils/logger';
import type { MCPServices } from './tools';

export interface PromptContent {
  description: string;
  messages: PromptMessage[];
}

export class MCPPromptRegistry {
  private readonly services: MCPServices;

  constructor(services: MCPServices) {
    this.services = services;
  }

  async listPrompts(): Promise<Prompt[]> {
    return [
      {
        name: 'task_planning',
        description: 'Help plan and organize tasks with intelligent suggestions',
        arguments: [
          {
            name: 'board_id',
            description: 'ID of the board to plan tasks for',
            required: true,
          },
          {
            name: 'planning_horizon',
            description: 'Time horizon for planning (day, week, sprint, month)',
            required: false,
          },
          {
            name: 'focus_area',
            description: 'Specific area to focus planning on',
            required: false,
          },
        ],
      },
      {
        name: 'task_breakdown',
        description: 'Break down complex tasks into manageable subtasks',
        arguments: [
          {
            name: 'task_description',
            description: 'Description of the complex task to break down',
            required: true,
          },
          {
            name: 'board_id',
            description: 'ID of the board where tasks will be created',
            required: false,
          },
          {
            name: 'complexity_level',
            description: 'Desired complexity level for subtasks',
            required: false,
          },
        ],
      },
      {
        name: 'sprint_planning',
        description: 'Assist with sprint planning and capacity estimation',
        arguments: [
          {
            name: 'board_id',
            description: 'ID of the board for sprint planning',
            required: true,
          },
          {
            name: 'sprint_duration',
            description: 'Duration of the sprint in days',
            required: false,
          },
          {
            name: 'team_capacity',
            description: 'Available team capacity for the sprint',
            required: false,
          },
        ],
      },
      {
        name: 'analyze_project_status',
        description: 'Analyze the current status of a project/board and provide insights',
        arguments: [
          {
            name: 'board_id',
            description: 'ID of the board to analyze',
            required: true,
          },
          {
            name: 'focus_area',
            description:
              'Specific area to focus analysis on (progress, blockers, team_performance, timeline)',
            required: false,
          },
        ],
      },
      {
        name: 'task_breakdown_assistant',
        description: 'Help break down a complex task into smaller, manageable subtasks',
        arguments: [
          {
            name: 'task_description',
            description: 'Description of the complex task to break down',
            required: true,
          },
          {
            name: 'context',
            description: 'Additional context about the project or requirements',
            required: false,
          },
          {
            name: 'timeline',
            description: 'Target timeline for completion',
            required: false,
          },
        ],
      },
      {
        name: 'blocker_resolution_helper',
        description: 'Analyze blocked tasks and suggest resolution strategies',
        arguments: [
          {
            name: 'board_id',
            description: 'ID of the board to analyze blocked tasks for',
            required: false,
          },
          {
            name: 'task_id',
            description: 'Specific task ID if analyzing a single blocked task',
            required: false,
          },
        ],
      },
      {
        name: 'sprint_planning_assistant',
        description: 'Help plan a sprint based on current board state and team capacity',
        arguments: [
          {
            name: 'board_id',
            description: 'ID of the board for sprint planning',
            required: true,
          },
          {
            name: 'sprint_duration',
            description: 'Duration of the sprint in days/weeks',
            required: false,
          },
          {
            name: 'team_capacity',
            description: 'Available team capacity or constraints',
            required: false,
          },
        ],
      },
      {
        name: 'priority_recommendation',
        description: 'Get recommendations for task prioritization based on current workload',
        arguments: [
          {
            name: 'board_id',
            description: 'ID of the board to analyze',
            required: true,
          },
          {
            name: 'criteria',
            description: 'Prioritization criteria (deadline, impact, effort, dependencies)',
            required: false,
          },
        ],
      },
      {
        name: 'progress_report_generator',
        description: 'Generate a comprehensive progress report for stakeholders',
        arguments: [
          {
            name: 'board_id',
            description: 'ID of the board to generate report for',
            required: true,
          },
          {
            name: 'timeframe',
            description: 'Timeframe for the report (week, month, sprint)',
            required: false,
          },
          {
            name: 'audience',
            description: 'Target audience (team, management, client)',
            required: false,
          },
        ],
      },
      {
        name: 'task_estimation_helper',
        description: 'Help estimate effort and timeline for tasks based on historical data',
        arguments: [
          {
            name: 'task_description',
            description: 'Description of the task to estimate',
            required: true,
          },
          {
            name: 'board_id',
            description: 'Board ID for historical context',
            required: false,
          },
          {
            name: 'complexity',
            description: 'Perceived complexity level (low, medium, high)',
            required: false,
          },
        ],
      },
      {
        name: 'workflow_optimization',
        description: 'Analyze workflow patterns and suggest optimizations',
        arguments: [
          {
            name: 'board_id',
            description: 'ID of the board to analyze workflow for',
            required: true,
          },
          {
            name: 'optimization_goal',
            description: 'Goal for optimization (speed, quality, efficiency, collaboration)',
            required: false,
          },
        ],
      },
      {
        name: 'standup_preparation',
        description: 'Prepare content for daily standup meetings based on recent activity',
        arguments: [
          {
            name: 'board_id',
            description: 'ID of the board for standup',
            required: true,
          },
          {
            name: 'team_member',
            description: 'Specific team member to prepare updates for',
            required: false,
          },
          {
            name: 'since_date',
            description: 'Date to include updates since (ISO format)',
            required: false,
          },
        ],
      },
      {
        name: 'retrospective_insights',
        description: 'Generate insights and talking points for retrospective meetings',
        arguments: [
          {
            name: 'board_id',
            description: 'ID of the board for retrospective',
            required: true,
          },
          {
            name: 'timeframe',
            description: 'Period to analyze (sprint, month, quarter)',
            required: false,
          },
          {
            name: 'focus_areas',
            description:
              'Specific areas to focus on (what went well, what could improve, action items)',
            required: false,
          },
        ],
      },
    ];
  }

  async getPrompt(name: string, args: Record<string, any>): Promise<PromptContent> {
    logger.info('MCP prompt request', { promptName: name, args });

    try {
      switch (name) {
        case 'task_planning':
          return await this.generateTaskPlanningPrompt(args);
        case 'task_breakdown':
          return await this.generateTaskBreakdownBasicPrompt(args);
        case 'sprint_planning':
          return await this.generateSprintPlanningBasicPrompt(args);
        case 'analyze_project_status':
          return await this.generateProjectStatusPrompt(args);
        case 'task_breakdown_assistant':
          return await this.generateTaskBreakdownPrompt(args);
        case 'blocker_resolution_helper':
          return await this.generateBlockerResolutionPrompt(args);
        case 'sprint_planning_assistant':
          return await this.generateSprintPlanningPrompt(args);
        case 'priority_recommendation':
          return await this.generatePriorityRecommendationPrompt(args);
        case 'progress_report_generator':
          return await this.generateProgressReportPrompt(args);
        case 'task_estimation_helper':
          return await this.generateTaskEstimationPrompt(args);
        case 'workflow_optimization':
          return await this.generateWorkflowOptimizationPrompt(args);
        case 'standup_preparation':
          return await this.generateStandupPreparationPrompt(args);
        case 'retrospective_insights':
          return await this.generateRetrospectiveInsightsPrompt(args);
        default:
          throw new Error(`Unknown prompt: ${String(name)}`);
      }
    } catch (error) {
      logger.error('Prompt generation error', { promptName: name, args, error });
      throw error;
    }
  }

  // Prompt generators
  private async generateProjectStatusPrompt(args: any): Promise<PromptContent> {
    const { board_id, focus_area } = args;

    if (!board_id) {
      throw new Error('board_id is required');
    }

    const context = await this.services.contextService.getProjectContext({
      include_completed: true,
      days_back: 30,
      max_items: 200,
      include_metrics: true,
      detail_level: 'comprehensive',
    });

    const analytics = await this.services.boardService.getBoardWithStats(board_id);

    let focusInstruction = '';
    if (focus_area) {
      focusInstruction = `Focus specifically on: ${String(focus_area)}. `;
    }

    return {
      description: 'Analyze project status and provide actionable insights',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please analyze the current status of this project and provide insights. ${String(focusInstruction)}

Project Context:
${String(context)}

Analytics Data:
${String(String(JSON.stringify(analytics, null, 2)))}

Provide a comprehensive analysis including:
1. Current progress and completion rate
2. Key accomplishments and milestones reached
3. Active blockers and risks
4. Team performance and workload distribution
5. Timeline assessment and potential delays
6. Recommendations for improvement
7. Next steps and priorities

Format your response in a clear, actionable manner suitable for stakeholders.`,
          },
        },
      ],
    };
  }

  private async generateTaskBreakdownPrompt(args: any): Promise<PromptContent> {
    const { task_description, context, timeline } = args;

    if (!task_description) {
      throw new Error('task_description is required');
    }

    let additionalContext = '';
    if (context) {
      additionalContext = `\n\nAdditional Context:\n${String(context)}`;
    }

    let timelineInfo = '';
    if (timeline) {
      timelineInfo = `\n\nTarget Timeline: ${String(timeline)}`;
    }

    return {
      description: 'Break down complex task into manageable subtasks',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please help me break down this complex task into smaller, manageable subtasks:

Task Description:
${String(task_description)}${String(additionalContext)}${String(timelineInfo)}

Please provide:
1. A list of 3-8 subtasks that logically break down the main task
2. For each subtask:
   - Clear, actionable description
   - Estimated effort/complexity (S/M/L/XL)
   - Any dependencies between subtasks
   - Suggested priority level (1-5)
   - Potential risks or considerations
3. Recommended order of execution
4. Any missing information or clarifications needed

Format the subtasks in a way that can be easily added to a kanban board.`,
          },
        },
      ],
    };
  }

  private async generateBlockerResolutionPrompt(args: any): Promise<PromptContent> {
    const { board_id, task_id } = args;

    let blockedTasks;
    let contextInfo = '';

    if (task_id) {
      // Single task analysis
      const task = await this.services.taskService.getTaskById(task_id);
      if (!task) {
        throw new Error(`Task not found: ${String(task_id)}`);
      }
      blockedTasks = [task];

      const taskContext = await this.services.contextService.getTaskContext(task_id, {
        include_completed: true,
        days_back: 30,
        max_items: 100,
        include_metrics: true,
        detail_level: 'detailed',
      });
      contextInfo = `\nTask Context:\n${String(taskContext)}`;
    } else {
      // Board-wide analysis
      blockedTasks = await this.services.taskService.getBlockedTasks(board_id);

      if (board_id) {
        const projectContext = await this.services.contextService.getProjectContext({
          include_completed: false,
          days_back: 30,
          max_items: 100,
          include_metrics: false,
          detail_level: 'summary',
        });
        contextInfo = `\nProject Context:\n${String(projectContext)}`;
      }
    }

    return {
      description: 'Analyze blocked tasks and suggest resolution strategies',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please analyze these blocked tasks and provide resolution strategies:

Blocked Tasks:
${String(String(JSON.stringify(blockedTasks, null, 2)))}${String(contextInfo)}

For each blocked task, please provide:
1. Root cause analysis of the blocker
2. Immediate actions that can be taken
3. Who should be involved in resolution
4. Alternative approaches or workarounds
5. Prevention strategies for similar future blockers
6. Estimated time to resolution
7. Impact if blocker is not resolved quickly

Also provide:
- Priority order for addressing blockers
- Any patterns or systemic issues
- Recommendations for process improvements`,
          },
        },
      ],
    };
  }

  private async generateSprintPlanningPrompt(args: any): Promise<PromptContent> {
    const { board_id, sprint_duration, team_capacity } = args;

    if (!board_id) {
      throw new Error('board_id is required');
    }

    const context = await this.services.contextService.getProjectContext({
      include_completed: false,
      days_back: 30,
      max_items: 200,
      include_metrics: true,
      detail_level: 'detailed',
    });

    const analytics = await this.services.boardService.getBoardWithStats(board_id);

    const durationInfo = sprint_duration ? `\nSprint Duration: ${String(sprint_duration)}` : '';
    const capacityInfo = team_capacity ? `\nTeam Capacity: ${String(team_capacity)}` : '';

    return {
      description: 'Plan sprint based on current board state and team capacity',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please help plan the next sprint based on the current project state:

Project Context:
${String(context)}

Analytics:
${String(String(JSON.stringify(analytics, null, 2)))}${String(durationInfo)}${String(capacityInfo)}

Please provide:
1. Recommended tasks for the sprint based on:
   - Priority and business value
   - Team capacity and skills
   - Dependencies and blockers
   - Sprint duration
2. Sprint goals and objectives
3. Risk assessment and mitigation strategies
4. Resource allocation recommendations
5. Definition of done for the sprint
6. Potential stretch goals if time permits
7. Backlog prioritization for future sprints

Format the recommendations in a way that can guide sprint planning meetings.`,
          },
        },
      ],
    };
  }

  private async generatePriorityRecommendationPrompt(args: any): Promise<PromptContent> {
    const { board_id, criteria } = args;

    if (!board_id) {
      throw new Error('board_id is required');
    }

    const context = await this.services.contextService.getProjectContext({
      include_completed: false,
      days_back: 30,
      max_items: 100,
      include_metrics: true,
      detail_level: 'detailed',
    });

    const criteriaInfo = criteria ? `\nPrioritization Criteria: ${String(criteria)}` : '';

    return {
      description: 'Get task prioritization recommendations',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please analyze the current tasks and provide prioritization recommendations:

Project Context:
${String(context)}${String(criteriaInfo)}

Please provide:
1. Task prioritization recommendations with reasoning
2. High-impact, low-effort tasks (quick wins)
3. Critical path items that could block progress
4. Tasks that can be deprioritized or deferred
5. Recommendations for priority level adjustments (1-5 scale)
6. Dependencies that affect prioritization
7. Risk-based prioritization considerations
8. Resource optimization suggestions

Consider factors like:
- Business impact and value
- Technical dependencies
- Team capacity and skills
- Deadlines and time constraints
- Risk and complexity
- Customer/stakeholder needs`,
          },
        },
      ],
    };
  }

  private async generateProgressReportPrompt(args: any): Promise<PromptContent> {
    const { board_id, timeframe, audience } = args;

    if (!board_id) {
      throw new Error('board_id is required');
    }

    const context = await this.services.contextService.getProjectContext({
      include_completed: true,
      days_back: 30,
      max_items: 200,
      include_metrics: true,
      detail_level: 'comprehensive',
    });

    const analytics = await this.services.boardService.getBoardWithStats(board_id);

    const timeframeInfo = timeframe ? `\nTimeframe: ${String(timeframe)}` : '';
    const audienceInfo = audience ? `\nTarget Audience: ${String(audience)}` : '';

    return {
      description: 'Generate comprehensive progress report',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please generate a comprehensive progress report for this project:

Project Context:
${String(context)}

Analytics:
${String(String(JSON.stringify(analytics, null, 2)))}${String(timeframeInfo)}${String(audienceInfo)}

Please create a report including:
1. Executive Summary
   - Overall progress percentage
   - Key achievements
   - Major challenges
   - Timeline status
2. Detailed Progress Analysis
   - Completed vs planned work
   - Quality metrics
   - Team performance
   - Resource utilization
3. Key Metrics and KPIs
   - Velocity trends
   - Cycle time
   - Defect rates
   - Customer satisfaction
4. Risks and Issues
   - Current blockers
   - Potential risks
   - Mitigation strategies
5. Upcoming Milestones
   - Next deliverables
   - Key dates
   - Resource requirements
6. Recommendations
   - Process improvements
   - Resource adjustments
   - Timeline modifications

Tailor the language and detail level for the specified audience.`,
          },
        },
      ],
    };
  }

  private async generateTaskEstimationPrompt(args: any): Promise<PromptContent> {
    const { task_description, board_id, complexity } = args;

    if (!task_description) {
      throw new Error('task_description is required');
    }

    let historicalContext = '';
    if (board_id) {
      const recentTasks = await this.services.taskService.getTasks({
        board_id,
        limit: 50,
        sortBy: 'updated_at',
        sortOrder: 'desc',
      });

      historicalContext = `\nRecent Similar Tasks:\n${String(String(JSON.stringify(recentTasks.slice(0, 10), null, 2)))}`;
    }

    const complexityInfo = complexity ? `\nPerceived Complexity: ${String(complexity)}` : '';

    return {
      description: 'Help estimate task effort and timeline',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please help estimate the effort and timeline for this task:

Task Description:
${String(task_description)}${String(complexityInfo)}${String(historicalContext)}

Please provide:
1. Effort Estimation
   - Story points or time estimate
   - Confidence level (low/medium/high)
   - Factors affecting the estimate
2. Timeline Estimation
   - Optimistic scenario
   - Most likely scenario
   - Pessimistic scenario
3. Breakdown of Work
   - Major components or phases
   - Dependencies and prerequisites
   - Testing and review time
4. Risk Factors
   - Technical risks
   - Resource risks
   - External dependencies
5. Estimation Methodology
   - Comparison to similar tasks
   - Bottom-up vs top-down approach
   - Assumptions made
6. Recommendations
   - Ways to reduce uncertainty
   - Prototype or spike work needed
   - Alternative approaches

Base your estimates on the historical data provided and industry best practices.`,
          },
        },
      ],
    };
  }

  private async generateWorkflowOptimizationPrompt(args: any): Promise<PromptContent> {
    const { board_id, optimization_goal } = args;

    if (!board_id) {
      throw new Error('board_id is required');
    }

    const context = await this.services.contextService.getProjectContext({
      include_completed: true,
      days_back: 30,
      max_items: 200,
      include_metrics: true,
      detail_level: 'comprehensive',
    });

    const analytics = await this.services.boardService.getBoardWithStats(board_id);

    const goalInfo = optimization_goal ? `\nOptimization Goal: ${String(optimization_goal)}` : '';

    return {
      description: 'Analyze workflow and suggest optimizations',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please analyze the current workflow and suggest optimizations:

Project Context:
${String(context)}

Analytics:
${String(String(JSON.stringify(analytics, null, 2)))}${String(goalInfo)}

Please provide:
1. Current Workflow Analysis
   - Process flow mapping
   - Bottlenecks and delays
   - Inefficiencies identified
   - Time spent in each stage
2. Optimization Opportunities
   - Process improvements
   - Automation possibilities
   - Tool and technology upgrades
   - Skill development needs
3. Specific Recommendations
   - Short-term improvements (quick wins)
   - Medium-term optimizations
   - Long-term strategic changes
4. Implementation Plan
   - Priority order of changes
   - Resource requirements
   - Timeline for implementation
   - Success metrics
5. Risk Assessment
   - Potential disruptions
   - Change management considerations
   - Rollback strategies
6. Expected Benefits
   - Quantified improvements
   - ROI estimation
   - Quality improvements

Focus on the specified optimization goal while considering overall workflow efficiency.`,
          },
        },
      ],
    };
  }

  private async generateStandupPreparationPrompt(args: any): Promise<PromptContent> {
    const { board_id, team_member, since_date } = args;

    if (!board_id) {
      throw new Error('board_id is required');
    }

    const sinceDate = since_date
      ? new Date(since_date)
      : new Date(Date.now() - 24 * 60 * 60 * 1000);

    const recentTasks = await this.services.taskService.getTasks({
      board_id,
      limit: 100,
      sortBy: 'updated_at',
      sortOrder: 'desc',
    });

    // Filter tasks updated since the specified date
    const updatedTasks = recentTasks.filter(task => new Date(task.updated_at) >= sinceDate);

    // Filter by team member if specified
    const relevantTasks = team_member
      ? updatedTasks.filter(task => task.assignee === team_member)
      : updatedTasks;

    const memberInfo = team_member ? `\nTeam Member: ${String(team_member)}` : '';

    return {
      description: 'Prepare content for daily standup meeting',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please help prepare standup content based on recent activity:

Recent Task Updates (since ${String(String(sinceDate.toISOString()))}):
${String(String(JSON.stringify(relevantTasks, null, 2)))}${String(memberInfo)}

Please provide standup talking points for:

1. YESTERDAY/RECENT ACCOMPLISHMENTS
   - Tasks completed
   - Significant progress made
   - Milestones reached
   - Problems solved

2. TODAY'S PLAN
   - Tasks to work on
   - Priorities for the day
   - Expected deliverables
   - Key focus areas

3. BLOCKERS AND IMPEDIMENTS
   - Current blockers
   - Help needed from team
   - External dependencies
   - Risks or concerns

4. TEAM UPDATES
   - Cross-team dependencies
   - Important announcements
   - Schedule changes
   - Resource needs

Format the content to be concise and suitable for a brief standup meeting (2-3 minutes per person).`,
          },
        },
      ],
    };
  }

  private async generateRetrospectiveInsightsPrompt(args: any): Promise<PromptContent> {
    const { board_id, timeframe, focus_areas } = args;

    if (!board_id) {
      throw new Error('board_id is required');
    }

    const context = await this.services.contextService.getProjectContext({
      include_completed: true,
      days_back: 30,
      max_items: 200,
      include_metrics: true,
      detail_level: 'comprehensive',
    });

    const analytics = await this.services.boardService.getBoardWithStats(board_id);

    const timeframeInfo = timeframe ? `\nTimeframe: ${String(timeframe)}` : '';
    const focusInfo = focus_areas ? `\nFocus Areas: ${String(focus_areas)}` : '';

    return {
      description: 'Generate insights for retrospective meeting',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please generate insights and talking points for a retrospective meeting:

Project Context:
${String(context)}

Analytics:
${String(String(JSON.stringify(analytics, null, 2)))}${String(timeframeInfo)}${String(focusInfo)}

Please provide retrospective insights organized by:

1. WHAT WENT WELL
   - Successful deliveries and achievements
   - Effective processes and practices
   - Team collaboration highlights
   - Tool and technology wins
   - Quality improvements

2. WHAT COULD BE IMPROVED
   - Process bottlenecks and pain points
   - Communication challenges
   - Technical debt or quality issues
   - Resource or capacity constraints
   - Tool or technology limitations

3. WHAT WE LEARNED
   - New insights about the project
   - Technical discoveries
   - Process learnings
   - Team dynamics observations
   - Customer feedback insights

4. ACTION ITEMS
   - Specific, actionable improvements
   - Process changes to implement
   - Tools or training needed
   - Experiments to try
   - Metrics to track

5. METRICS AND TRENDS
   - Velocity and throughput analysis
   - Quality metrics
   - Team satisfaction indicators
   - Customer satisfaction trends

Format the insights to encourage constructive discussion and actionable outcomes.`,
          },
        },
      ],
    };
  }

  private async generateTaskPlanningPrompt(args: any): Promise<PromptContent> {
    const board_id = args.board_id ?? args.boardId;
    const planning_horizon = args.planning_horizon ?? args.planningHorizon;
    const focus_area = args.focus_area ?? args.focusArea;

    if (!board_id) {
      throw new Error('board_id (or boardId) is required');
    }

    const context = await this.services.contextService.getProjectContext({
      include_completed: false,
      days_back: 14,
      max_items: 100,
    });

    const horizon = planning_horizon ?? 'sprint';
    const focus = focus_area ? ` with focus on ${String(focus_area)}` : '';

    return {
      description: 'Generate a comprehensive task planning strategy',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `You are a project planning assistant. Help create an effective task plan for the ${String(horizon)}${String(focus)}.

Current Context:
${String(context)}

Create a comprehensive task plan that includes:
1. Priority assessment of existing tasks
2. Recommended task sequencing
3. Capacity planning considerations
4. Risk assessment and mitigation
5. Dependencies and blocking factors

Focus on actionable recommendations that will improve team productivity and project outcomes.`,
          },
        },
      ],
    };
  }

  private async generateTaskBreakdownBasicPrompt(args: any): Promise<PromptContent> {
    // Handle both task_description and taskId (if taskId is provided, create a generic description)
    const task_description =
      args.task_description ||
      (args.taskId ? `Task ID: ${String(String(args.taskId))}` : args.description);
    const complexity_level = args.complexity_level ?? args.complexity;

    if (!task_description) {
      throw new Error('task_description (or taskId) is required');
    }

    const complexity = complexity_level ?? 'medium';

    return {
      description: 'Break down complex tasks into manageable subtasks',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `You are a task breakdown specialist. Help break down this complex task into manageable subtasks.

Task to Break Down: "${String(task_description)}"
Target Complexity Level: ${String(complexity)}

Please provide:
1. A logical breakdown of the task into 3-7 subtasks
2. Estimated effort for each subtask
3. Dependencies between subtasks
4. Acceptance criteria for each subtask
5. Recommended order of execution

Make sure each subtask is:
- Specific and actionable
- Testable with clear completion criteria
- Appropriately sized for the target complexity
- Independent where possible`,
          },
        },
      ],
    };
  }

  private async generateSprintPlanningBasicPrompt(args: any): Promise<PromptContent> {
    const board_id = args.board_id ?? args.boardId;
    const sprint_duration = args.sprint_duration ?? args.sprintDuration;
    const team_capacity = args.team_capacity ?? args.teamCapacity;

    if (!board_id) {
      throw new Error('board_id (or boardId) is required');
    }

    const duration = sprint_duration ?? 14;
    const capacity = team_capacity ?? 'standard team capacity';

    const context = await this.services.contextService.getProjectContext({
      include_completed: false,
      days_back: 30,
      max_items: 100,
    });

    return {
      description: 'Generate sprint planning recommendations',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `You are a sprint planning facilitator. Help plan an effective ${String(duration)}-day sprint.

Current Project State:
${String(context)}

Team Capacity: ${String(capacity)}

Please provide:
1. Sprint goal recommendation
2. Task prioritization for the sprint
3. Capacity allocation suggestions
4. Risk assessment for the sprint
5. Success metrics to track
6. Recommended scope adjustments if needed

Focus on creating a realistic, achievable sprint plan that balances ambition with deliverability.`,
          },
        },
      ],
    };
  }
}
