import { Prompt, PromptMessage } from '@modelcontextprotocol/sdk/types.js';
import { logger } from '@/utils/logger';
import { MCPServices } from './tools';

export interface PromptContent {
  description: string;
  messages: PromptMessage[];
}

export class MCPPromptRegistry {
  private services: MCPServices;

  constructor(services: MCPServices) {
    this.services = services;
  }

  async listPrompts(): Promise<Prompt[]> {
    return [
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
            description: 'Specific area to focus analysis on (progress, blockers, team_performance, timeline)',
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
            description: 'Specific areas to focus on (what went well, what could improve, action items)',
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
          throw new Error(`Unknown prompt: ${name}`);
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

    const context = await this.services.contextService.generateProjectContext(board_id, {
      includeCompletedTasks: true,
      includeNotes: true,
      includeTags: true,
      maxTasks: 200,
      maxNotes: 100,
    });

    const analytics = await this.services.boardService.getBoardAnalytics(board_id);

    let focusInstruction = '';
    if (focus_area) {
      focusInstruction = `Focus specifically on: ${focus_area}. `;
    }

    return {
      description: 'Analyze project status and provide actionable insights',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please analyze the current status of this project and provide insights. ${focusInstruction}

Project Context:
${context}

Analytics Data:
${JSON.stringify(analytics, null, 2)}

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
      additionalContext = `\n\nAdditional Context:\n${context}`;
    }

    let timelineInfo = '';
    if (timeline) {
      timelineInfo = `\n\nTarget Timeline: ${timeline}`;
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
${task_description}${additionalContext}${timelineInfo}

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
        throw new Error(`Task not found: ${task_id}`);
      }
      blockedTasks = [task];
      
      const taskContext = await this.services.contextService.generateTaskContext(task_id, {
        includeSubtasks: true,
        includeDependencies: true,
        includeNotes: true,
        includeTags: true,
      });
      contextInfo = `\nTask Context:\n${taskContext}`;
    } else {
      // Board-wide analysis
      blockedTasks = await this.services.taskService.getBlockedTasks(board_id);
      
      if (board_id) {
        const projectContext = await this.services.contextService.generateProjectContext(board_id, {
          includeCompletedTasks: false,
          includeNotes: true,
          includeTags: true,
          maxTasks: 100,
        });
        contextInfo = `\nProject Context:\n${projectContext}`;
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
${JSON.stringify(blockedTasks, null, 2)}${contextInfo}

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

    const context = await this.services.contextService.generateProjectContext(board_id, {
      includeCompletedTasks: false,
      includeNotes: true,
      includeTags: true,
      maxTasks: 200,
    });

    const analytics = await this.services.boardService.getBoardAnalytics(board_id);

    let durationInfo = sprint_duration ? `\nSprint Duration: ${sprint_duration}` : '';
    let capacityInfo = team_capacity ? `\nTeam Capacity: ${team_capacity}` : '';

    return {
      description: 'Plan sprint based on current board state and team capacity',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please help plan the next sprint based on the current project state:

Project Context:
${context}

Analytics:
${JSON.stringify(analytics, null, 2)}${durationInfo}${capacityInfo}

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

    const context = await this.services.contextService.generateProjectContext(board_id, {
      includeCompletedTasks: false,
      includeNotes: true,
      includeTags: true,
      maxTasks: 100,
    });

    const criteriaInfo = criteria ? `\nPrioritization Criteria: ${criteria}` : '';

    return {
      description: 'Get task prioritization recommendations',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please analyze the current tasks and provide prioritization recommendations:

Project Context:
${context}${criteriaInfo}

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

    const context = await this.services.contextService.generateProjectContext(board_id, {
      includeCompletedTasks: true,
      includeNotes: true,
      includeTags: true,
      maxTasks: 200,
    });

    const analytics = await this.services.boardService.getBoardAnalytics(board_id);

    let timeframeInfo = timeframe ? `\nTimeframe: ${timeframe}` : '';
    let audienceInfo = audience ? `\nTarget Audience: ${audience}` : '';

    return {
      description: 'Generate comprehensive progress report',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please generate a comprehensive progress report for this project:

Project Context:
${context}

Analytics:
${JSON.stringify(analytics, null, 2)}${timeframeInfo}${audienceInfo}

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
        sort_by: 'updated_at',
        sort_order: 'desc',
      });
      
      historicalContext = `\nRecent Similar Tasks:\n${JSON.stringify(recentTasks.slice(0, 10), null, 2)}`;
    }

    let complexityInfo = complexity ? `\nPerceived Complexity: ${complexity}` : '';

    return {
      description: 'Help estimate task effort and timeline',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please help estimate the effort and timeline for this task:

Task Description:
${task_description}${complexityInfo}${historicalContext}

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

    const context = await this.services.contextService.generateProjectContext(board_id, {
      includeCompletedTasks: true,
      includeNotes: true,
      includeTags: true,
      maxTasks: 200,
    });

    const analytics = await this.services.boardService.getBoardAnalytics(board_id);

    let goalInfo = optimization_goal ? `\nOptimization Goal: ${optimization_goal}` : '';

    return {
      description: 'Analyze workflow and suggest optimizations',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please analyze the current workflow and suggest optimizations:

Project Context:
${context}

Analytics:
${JSON.stringify(analytics, null, 2)}${goalInfo}

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

    const sinceDate = since_date ? new Date(since_date) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const recentTasks = await this.services.taskService.getTasks({
      board_id,
      limit: 100,
      sort_by: 'updated_at',
      sort_order: 'desc',
    });

    // Filter tasks updated since the specified date
    const updatedTasks = recentTasks.filter(task => 
      new Date(task.updated_at) >= sinceDate
    );

    // Filter by team member if specified
    const relevantTasks = team_member 
      ? updatedTasks.filter(task => task.assignee === team_member)
      : updatedTasks;

    let memberInfo = team_member ? `\nTeam Member: ${team_member}` : '';

    return {
      description: 'Prepare content for daily standup meeting',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please help prepare standup content based on recent activity:

Recent Task Updates (since ${sinceDate.toISOString()}):
${JSON.stringify(relevantTasks, null, 2)}${memberInfo}

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

    const context = await this.services.contextService.generateProjectContext(board_id, {
      includeCompletedTasks: true,
      includeNotes: true,
      includeTags: true,
      maxTasks: 200,
    });

    const analytics = await this.services.boardService.getBoardAnalytics(board_id);

    let timeframeInfo = timeframe ? `\nTimeframe: ${timeframe}` : '';
    let focusInfo = focus_areas ? `\nFocus Areas: ${focus_areas}` : '';

    return {
      description: 'Generate insights for retrospective meeting',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please generate insights and talking points for a retrospective meeting:

Project Context:
${context}

Analytics:
${JSON.stringify(analytics, null, 2)}${timeframeInfo}${focusInfo}

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
}