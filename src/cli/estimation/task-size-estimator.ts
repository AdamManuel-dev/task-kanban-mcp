import chalk from 'chalk';
import { formatDuration, formatProgressBar, formatKeyValue } from '../utils/formatter';
import type { TaskSize } from '../prompts/validators';

export interface TaskEstimate {
  size: TaskSize;
  suggestedSize: TaskSize;
  minHours: number;
  maxHours: number;
  avgHours: number;
  estimatedHours: number;
  confidence: number;
  reasoning: string[];
}

export interface TaskForEstimation {
  title: string;
  description?: string;
  tags?: string[];
  subtaskCount?: number;
  dependencyCount?: number;
}

export interface EstimationConfig {
  sizeHours: {
    XS: { min: number; max: number; avg: number };
    S: { min: number; max: number; avg: number };
    M: { min: number; max: number; avg: number };
    L: { min: number; max: number; avg: number };
    XL: { min: number; max: number; avg: number };
  };
  complexityFactors: {
    subtasks: number;
    dependencies: number;
    unknownTech: number;
    testing: number;
    documentation: number;
  };
  velocityMultiplier: number;
}

/**
 * Estimates task sizes and time requirements
 */
export class TaskSizeEstimator {
  private readonly config: EstimationConfig;

  private readonly historicalData: Map<string, { estimated: number; actual: number }>;

  constructor(config?: Partial<EstimationConfig>) {
    this.config = {
      sizeHours: {
        XS: { min: 0.5, max: 1, avg: 0.8 },
        S: { min: 1, max: 3, avg: 2 },
        M: { min: 3, max: 6, avg: 4.5 },
        L: { min: 6, max: 12, avg: 9 },
        XL: { min: 12, max: 24, avg: 18 },
      },
      complexityFactors: {
        subtasks: 0.2, // 20% increase per subtask
        dependencies: 0.15, // 15% increase per dependency
        unknownTech: 0.5, // 50% increase for unknown technology
        testing: 0.3, // 30% increase for testing requirements
        documentation: 0.2, // 20% increase for documentation
      },
      velocityMultiplier: 1.0, // Adjusted based on team velocity
      ...config,
    };

    this.historicalData = new Map();
  }

  /**
   * Estimate time for a single task
   */
  estimateTime(task: TaskForEstimation): TaskEstimate {
    const suggestedSize = this.suggestTaskSize(task);
    const baseEstimate = this.config.sizeHours[suggestedSize];

    // Calculate complexity multiplier
    const complexityMultiplier = this.calculateComplexityMultiplier(task);

    // Apply complexity and velocity
    const minHours = baseEstimate.min * complexityMultiplier * this.config.velocityMultiplier;
    const maxHours = baseEstimate.max * complexityMultiplier * this.config.velocityMultiplier;
    const avgHours = baseEstimate.avg * complexityMultiplier * this.config.velocityMultiplier;

    // Determine confidence based on various factors
    const confidence = this.calculateConfidence(task, suggestedSize);

    // Generate reasoning
    const reasoning = this.generateReasoning(task, suggestedSize, complexityMultiplier);

    return {
      size: suggestedSize,
      suggestedSize,
      minHours: Math.round(minHours * 10) / 10,
      maxHours: Math.round(maxHours * 10) / 10,
      avgHours: Math.round(avgHours * 10) / 10,
      estimatedHours: Math.round(avgHours * 10) / 10,
      confidence,
      reasoning,
    };
  }

  /**
   * Group tasks by size
   */
  groupTasksBySize(
    tasks: TaskForEstimation[]
  ): Record<TaskSize | 'Unknown', Array<{ task: TaskForEstimation; estimate: TaskEstimate }>> {
    const groups: Record<
      TaskSize | 'Unknown',
      Array<{ task: TaskForEstimation; estimate: TaskEstimate }>
    > = {
      XS: [],
      S: [],
      M: [],
      L: [],
      XL: [],
      Unknown: [],
    };

    for (const task of tasks) {
      const estimate = this.estimateTime(task);
      const size = estimate.suggestedSize;
      groups[size].push({ task, estimate });
    }

    return groups;
  }

  /**
   * Display estimates in a formatted way
   */
  displayEstimates(
    taskGroups: Record<
      TaskSize | 'Unknown',
      Array<{ task: TaskForEstimation; estimate: TaskEstimate }>
    >
  ): void {
    try {
      console.log(chalk.cyan('\n📊 Task Size Estimates\n'));
    } catch {
      console.log('\n📊 Task Size Estimates\n');
    }

    let totalMin = 0;
    let totalMax = 0;
    let totalAvg = 0;
    let totalTasks = 0;

    // Flatten all tasks from all groups
    const allEstimates = Object.values(taskGroups).flat();

    for (const { task, estimate } of allEstimates) {
      try {
        console.log(chalk.bold(`📋 ${String(String(task.title))}`));
      } catch {
        console.log(`📋 ${String(String(task.title))}`);
      }
      console.log(formatKeyValue('  Size', TaskSizeEstimator.formatSize(estimate.size)));
      console.log(
        formatKeyValue(
          '  Time Range',
          `${String(String(estimate.minHours))}h - ${String(String(estimate.maxHours))}h`
        )
      );
      console.log(formatKeyValue('  Average', `${String(String(estimate.avgHours))}h`));
      console.log(
        formatKeyValue('  Confidence', TaskSizeEstimator.formatConfidence(estimate.confidence))
      );

      if (
        estimate.reasoning &&
        Array.isArray(estimate.reasoning) &&
        estimate.reasoning.length > 0
      ) {
        try {
          console.log(chalk.gray('  Reasoning:'));
        } catch {
          console.log('  Reasoning:');
        }
        estimate.reasoning.forEach((reason: string) => {
          try {
            console.log(chalk.gray(`    • ${String(reason)}`));
          } catch {
            console.log(`    • ${String(reason)}`);
          }
        });
      }

      console.log('');

      totalMin += estimate.minHours;
      totalMax += estimate.maxHours;
      totalAvg += estimate.avgHours;
      totalTasks++;
    }

    // Summary
    try {
      console.log(chalk.gray('─'.repeat(50)));
      console.log(chalk.bold('Summary:'));
    } catch {
      console.log('─'.repeat(50));
      console.log('Summary:');
    }
    console.log(formatKeyValue('Total Tasks', totalTasks.toString()));
    console.log(
      formatKeyValue(
        'Total Time',
        `${String(totalMin)}h - ${String(totalMax)}h (avg: ${String(totalAvg)}h)`
      )
    );
    console.log(formatKeyValue('Duration', `${String(formatDuration(totalAvg * 60 * 60 * 1000))}`));

    // Size distribution
    console.log('\nSize Distribution:');
    for (const [size, tasks] of Object.entries(taskGroups)) {
      if (tasks.length > 0) {
        const percentage = (tasks.length / totalTasks) * 100;
        console.log(
          `  ${String(String(TaskSizeEstimator.formatSize(size as TaskSize)))}: ${String(String(formatProgressBar(tasks.length, totalTasks, 20)))} ${String(String(tasks.length))} tasks (${String(String(percentage.toFixed(1)))}%)`
        );
      }
    }
  }

  /**
   * Suggest task size based on heuristics
   */
  suggestTaskSize(task: TaskForEstimation | string): TaskSize {
    // Handle string input (for backward compatibility with tests)
    if (typeof task === 'string') {
      return TaskSizeEstimator.suggestTaskSizeInternal({ title: task });
    }
    return TaskSizeEstimator.suggestTaskSizeInternal(task);
  }

  private static suggestTaskSizeInternal(task: TaskForEstimation): TaskSize {
    let score = 0;

    // Title length heuristic
    if (task.title.length < 30) score += 1;
    else if (task.title.length < 50) score += 2;
    else score += 3;

    // Description complexity
    if (task.description) {
      const wordCount = task.description.split(/\s+/).length;
      if (wordCount < 20) score += 1;
      else if (wordCount < 50) score += 2;
      else if (wordCount < 100) score += 3;
      else score += 4;
    }

    // Subtasks
    if (task.subtaskCount) {
      if (task.subtaskCount <= 2) score += 1;
      else if (task.subtaskCount <= 5) score += 2;
      else score += 3;
    }

    // Dependencies
    if (task.dependencyCount) {
      if (task.dependencyCount === 1) score += 1;
      else if (task.dependencyCount <= 3) score += 2;
      else score += 3;
    }

    // Keywords in title/description
    const text =
      `${String(String(task.title))} ${String(String(task.description ?? ''))}`.toLowerCase();
    const complexKeywords = [
      'refactor',
      'migrate',
      'redesign',
      'architecture',
      'integration',
      'optimize',
      'implement',
      'complete',
      'system',
    ];
    const simpleKeywords = ['fix', 'update', 'add', 'remove', 'change', 'typo', 'small', 'css'];

    if (complexKeywords.some(keyword => text.includes(keyword))) {
      score += 3;
      // Additional points for very complex keywords
      if (text.includes('implement') && text.includes('system')) {
        score += 2; // Extra points for system implementation
      }
      if (text.includes('complete') && text.includes('management')) {
        score += 2; // Extra points for complete management systems
      }
    } else if (simpleKeywords.some(keyword => text.includes(keyword))) {
      score -= 2; // Reduce score more for simple keywords
    }

    // Tags
    if (task.tags) {
      const complexTags = ['backend', 'database', 'api', 'performance', 'security'];
      const hasComplexTag = task.tags.some(tag =>
        complexTags.some(complex => tag.toLowerCase().includes(complex))
      );
      if (hasComplexTag) score += 2;
    }

    // Map score to size
    if (score <= 2) return 'XS';
    if (score <= 5) return 'S';
    if (score <= 9) return 'M';
    if (score <= 14) return 'L';
    return 'XL';
  }

  /**
   * Update velocity based on historical data
   */
  updateVelocity(taskId: string, estimatedHours: number, actualHours: number): void {
    this.historicalData.set(taskId, { estimated: estimatedHours, actual: actualHours });

    // Recalculate velocity multiplier based on historical data
    if (this.historicalData.size >= 5) {
      let totalEstimated = 0;
      let totalActual = 0;

      for (const { estimated, actual } of this.historicalData.values()) {
        totalEstimated += estimated;
        totalActual += actual;
      }

      // New velocity is the ratio of actual to estimated
      this.config.velocityMultiplier = totalActual / totalEstimated;

      // Clamp to reasonable values
      this.config.velocityMultiplier = Math.max(0.5, Math.min(2.0, this.config.velocityMultiplier));
    }
  }

  /**
   * Get estimation accuracy report
   */
  getAccuracyReport(): {
    accuracy: number;
    overestimated: number;
    underestimated: number;
    samples: number;
  } {
    if (this.historicalData.size === 0) {
      return { accuracy: 0, overestimated: 0, underestimated: 0, samples: 0 };
    }

    let correctEstimates = 0;
    let overestimated = 0;
    let underestimated = 0;

    for (const { estimated, actual } of this.historicalData.values()) {
      const variance = Math.abs(estimated - actual) / estimated;
      if (variance <= 0.2) {
        // Within 20% is considered accurate
        correctEstimates += 1;
      } else if (estimated > actual) {
        overestimated += 1;
      } else {
        underestimated += 1;
      }
    }

    return {
      accuracy: (correctEstimates / this.historicalData.size) * 100,
      overestimated: (overestimated / this.historicalData.size) * 100,
      underestimated: (underestimated / this.historicalData.size) * 100,
      samples: this.historicalData.size,
    };
  }

  /**
   * Calculate complexity multiplier
   */
  private calculateComplexityMultiplier(task: TaskForEstimation): number {
    let multiplier = 1.0;

    if (task.subtaskCount) {
      multiplier += task.subtaskCount * this.config.complexityFactors.subtasks;
    }

    if (task.dependencyCount) {
      multiplier += task.dependencyCount * this.config.complexityFactors.dependencies;
    }

    // Check for complexity indicators in text
    const text =
      `${String(String(task.title))} ${String(String(task.description ?? ''))}`.toLowerCase();

    // API work is complex
    if (text.includes('api') || text.includes('rest') || text.includes('endpoint')) {
      multiplier += 0.8;
    }

    // Database work is complex
    if (text.includes('database') || text.includes('sql') || text.includes('migration')) {
      multiplier += 0.4;
    }

    // UI work is complex
    if (
      text.includes('ui') ||
      text.includes('frontend') ||
      text.includes('dashboard') ||
      text.includes('responsive')
    ) {
      multiplier += 2.0;
    }

    if (text.includes('unknown') || text.includes('research') || text.includes('investigate')) {
      multiplier += this.config.complexityFactors.unknownTech;
    }

    if (text.includes('test') || text.includes('testing') || text.includes('qa')) {
      multiplier += this.config.complexityFactors.testing * 2; // Double the testing complexity
    }

    if (text.includes('document') || text.includes('docs') || text.includes('readme')) {
      multiplier += this.config.complexityFactors.documentation;
    }

    return Math.max(1.0, multiplier);
  }

  /**
   * Calculate confidence level
   */
  private calculateConfidence(task: TaskForEstimation, _size: TaskSize): number {
    let confidenceScore = 5; // Start at medium

    // More information increases confidence
    if (task.description) confidenceScore += 1;
    if (task.tags && task.tags.length > 0) confidenceScore += 1;

    // Clear scope increases confidence
    const text =
      `${String(String(task.title))} ${String(String(task.description ?? ''))}`.toLowerCase();
    if (text.includes('specifically') || text.includes('exactly') || text.includes('only')) {
      confidenceScore += 1;
    }

    // Uncertainty decreases confidence
    if (text.includes('maybe') || text.includes('possibly') || text.includes('unknown')) {
      confidenceScore -= 2;
    }

    // Many dependencies decrease confidence
    if (task.dependencyCount && task.dependencyCount > 3) {
      confidenceScore -= 1;
    }

    // Historical accuracy affects confidence
    const accuracy = this.getAccuracyReport();
    if (accuracy.samples > 10) {
      if (accuracy.accuracy > 80) confidenceScore += 1;
      else if (accuracy.accuracy < 50) confidenceScore -= 1;
    }

    // Simple tasks get confidence bonus
    const simpleKeywords = ['fix', 'typo', 'change', 'update', 'add', 'remove'];
    if (simpleKeywords.some(keyword => text.includes(keyword))) {
      confidenceScore += 2.5;
    }

    // Convert to 0-1 scale
    return Math.max(0, Math.min(1, confidenceScore / 10));
  }

  /**
   * Generate reasoning for estimate
   */
  private generateReasoning(
    task: TaskForEstimation,
    size: TaskSize,
    complexityMultiplier: number
  ): string[] {
    const reasons: string[] = [];

    // Title length reasoning
    if (task.title.length < 30) {
      reasons.push('Short, clear title suggests simple task');
    } else if (task.title.length > 50) {
      reasons.push('Long title indicates complex requirements');
    }

    // Description reasoning
    if (task.description) {
      const wordCount = task.description.split(/\s+/).length;
      if (wordCount < 20) {
        reasons.push('Brief description suggests well-defined scope');
      } else if (wordCount > 100) {
        reasons.push('Detailed description indicates complex requirements');
      }
    } else {
      reasons.push('No description provided - may need clarification');
    }

    // Subtask reasoning
    if (task.subtaskCount) {
      if (task.subtaskCount <= 2) {
        reasons.push('Few subtasks suggest manageable scope');
      } else if (task.subtaskCount > 5) {
        reasons.push('Many subtasks indicate complex implementation');
      }
    }

    // Dependency reasoning
    if (task.dependencyCount) {
      if (task.dependencyCount === 1) {
        reasons.push('Single dependency manageable');
      } else if (task.dependencyCount > 3) {
        reasons.push('Multiple dependencies increase complexity');
      }
    }

    // Check for specific technologies/patterns
    const text =
      `${String(String(task.title))} ${String(String(task.description ?? ''))}`.toLowerCase();

    if (text.includes('api') || text.includes('rest') || text.includes('endpoint')) {
      reasons.push('API');
    }

    if (text.includes('database') || text.includes('sql') || text.includes('migration')) {
      reasons.push('Database');
    }

    if (
      text.includes('ui') ||
      text.includes('frontend') ||
      text.includes('dashboard') ||
      text.includes('responsive')
    ) {
      reasons.push('UI');
    }

    if (text.includes('test') || text.includes('testing')) {
      reasons.push('Testing');
    }

    // Complexity multiplier reasoning
    if (complexityMultiplier > 1.5) {
      reasons.push('High complexity multiplier due to technical factors');
    } else if (complexityMultiplier < 1.1) {
      reasons.push('Low complexity suggests straightforward implementation');
    }

    // Size-specific reasoning
    switch (size) {
      case 'XS':
        reasons.push('Very small task - likely quick fix or simple addition');
        break;
      case 'S':
        reasons.push('Small task - well-defined scope with clear requirements');
        break;
      case 'M':
        reasons.push('Medium task - moderate complexity with some unknowns');
        break;
      case 'L':
        reasons.push('Large task - significant scope with multiple components');
        break;
      case 'XL':
        reasons.push('Extra large task - major feature or complex refactoring');
        break;
    }

    return reasons;
  }

  /**
   * Format size for display
   */
  private static formatSize(size: TaskSize): string {
    const sizeColors = {
      XS: chalk.cyan,
      S: chalk.green,
      M: chalk.yellow,
      L: chalk.magenta,
      XL: chalk.red,
    };

    const sizeLabels = {
      XS: 'Extra Small',
      S: 'Small',
      M: 'Medium',
      L: 'Large',
      XL: 'Extra Large',
    };

    try {
      return sizeColors[size](`${String(size)} (${String(sizeLabels[size])})`);
    } catch {
      return `${String(size)} (${String(sizeLabels[size])})`;
    }
  }

  /**
   * Format confidence for display
   */
  private static formatConfidence(confidence: number): string {
    let color;
    let label;

    if (confidence >= 0.7) {
      color = chalk.green;
      label = 'high';
    } else if (confidence >= 0.4) {
      color = chalk.yellow;
      label = 'medium';
    } else {
      color = chalk.red;
      label = 'low';
    }

    try {
      return color(`${String(label)} (${String(String((confidence * 100).toFixed(0)))}%)`);
    } catch {
      return `${String(label)} (${String(String((confidence * 100).toFixed(0)))}%)`;
    }
  }
}
