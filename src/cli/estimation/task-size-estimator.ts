import chalk from 'chalk';
import { formatDuration, formatProgressBar, formatKeyValue } from '../utils/formatter';
import type { TaskSize } from '../prompts/validators';

export interface TaskEstimate {
  size: TaskSize;
  minHours: number;
  maxHours: number;
  avgHours: number;
  confidence: 'low' | 'medium' | 'high';
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
        S: { min: 0.5, max: 2, avg: 1 },
        M: { min: 2, max: 4, avg: 3 },
        L: { min: 4, max: 8, avg: 6 },
        XL: { min: 8, max: 16, avg: 12 },
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
      minHours: Math.round(minHours * 10) / 10,
      maxHours: Math.round(maxHours * 10) / 10,
      avgHours: Math.round(avgHours * 10) / 10,
      confidence,
      reasoning,
    };
  }

  /**
   * Group tasks by size
   */
  groupTasksBySize<T extends { size?: TaskSize }>(tasks: T[]): Map<TaskSize | 'Unknown', T[]> {
    const groups = new Map<TaskSize | 'Unknown', T[]>();

    for (const task of tasks) {
      const size = task.size || 'Unknown';
      if (!groups.has(size)) {
        groups.set(size, []);
      }
      groups.get(size)!.push(task);
    }

    return groups;
  }

  /**
   * Display estimates in a formatted way
   */
  displayEstimates(estimates: Array<{ task: TaskForEstimation; estimate: TaskEstimate }>): void {
    console.log(chalk.cyan('\n📊 Task Size Estimates\n'));

    let totalMin = 0;
    let totalMax = 0;
    let totalAvg = 0;

    for (const { task, estimate } of estimates) {
      console.log(chalk.bold(`📋 ${task.title}`));
      console.log(formatKeyValue('  Size', this.formatSize(estimate.size)));
      console.log(formatKeyValue('  Time Range', `${estimate.minHours}h - ${estimate.maxHours}h`));
      console.log(formatKeyValue('  Average', `${estimate.avgHours}h`));
      console.log(formatKeyValue('  Confidence', this.formatConfidence(estimate.confidence)));

      if (estimate.reasoning.length > 0) {
        console.log(chalk.gray('  Reasoning:'));
        estimate.reasoning.forEach(reason => {
          console.log(chalk.gray(`    • ${reason}`));
        });
      }

      console.log();

      totalMin += estimate.minHours;
      totalMax += estimate.maxHours;
      totalAvg += estimate.avgHours;
    }

    // Summary
    console.log(chalk.gray('─'.repeat(50)));
    console.log(chalk.bold('Summary:'));
    console.log(formatKeyValue('Total Tasks', estimates.length.toString()));
    console.log(formatKeyValue('Total Time', `${totalMin}h - ${totalMax}h (avg: ${totalAvg}h)`));
    console.log(formatKeyValue('Duration', `${formatDuration(totalAvg * 60 * 60 * 1000)}`));

    // Size distribution
    const sizeGroups = this.groupTasksBySize(estimates.map(e => ({ size: e.estimate.size })));
    console.log('\nSize Distribution:');
    for (const [size, tasks] of sizeGroups) {
      const percentage = (tasks.length / estimates.length) * 100;
      console.log(
        `  ${this.formatSize(size as TaskSize)}: ${formatProgressBar(tasks.length, estimates.length, 20)} ${tasks.length} tasks`
      );
    }
  }

  /**
   * Suggest task size based on heuristics
   */
  suggestTaskSize(task: TaskForEstimation): TaskSize {
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
    const text = `${task.title} ${task.description || ''}`.toLowerCase();
    const complexKeywords = [
      'refactor',
      'migrate',
      'redesign',
      'architecture',
      'integration',
      'optimize',
    ];
    const simpleKeywords = ['fix', 'update', 'add', 'remove', 'change', 'typo'];

    if (complexKeywords.some(keyword => text.includes(keyword))) {
      score += 3;
    } else if (simpleKeywords.some(keyword => text.includes(keyword))) {
      score += 1;
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
    if (score <= 3) return 'S';
    if (score <= 7) return 'M';
    if (score <= 12) return 'L';
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
        correctEstimates++;
      } else if (estimated > actual) {
        overestimated++;
      } else {
        underestimated++;
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
    const text = `${task.title} ${task.description || ''}`.toLowerCase();

    if (text.includes('unknown') || text.includes('research') || text.includes('investigate')) {
      multiplier += this.config.complexityFactors.unknownTech;
    }

    if (text.includes('test') || text.includes('testing') || text.includes('qa')) {
      multiplier += this.config.complexityFactors.testing;
    }

    if (text.includes('document') || text.includes('docs') || text.includes('readme')) {
      multiplier += this.config.complexityFactors.documentation;
    }

    return multiplier;
  }

  /**
   * Calculate confidence level
   */
  private calculateConfidence(task: TaskForEstimation, size: TaskSize): 'low' | 'medium' | 'high' {
    let confidenceScore = 5; // Start at medium

    // More information increases confidence
    if (task.description) confidenceScore += 1;
    if (task.tags && task.tags.length > 0) confidenceScore += 1;

    // Clear scope increases confidence
    const text = `${task.title} ${task.description || ''}`.toLowerCase();
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

    if (confidenceScore >= 7) return 'high';
    if (confidenceScore >= 4) return 'medium';
    return 'low';
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

    // Size reasoning
    reasons.push(`Base size ${size} based on task complexity analysis`);

    // Complexity factors
    if (task.subtaskCount) {
      reasons.push(
        `${task.subtaskCount} subtask${task.subtaskCount > 1 ? 's' : ''} add complexity`
      );
    }

    if (task.dependencyCount) {
      reasons.push(`${task.dependencyCount} dependencies may cause delays`);
    }

    if (complexityMultiplier > 1.3) {
      reasons.push(`Complexity multiplier of ${complexityMultiplier.toFixed(1)}x applied`);
    }

    // Historical data
    if (this.historicalData.size > 5) {
      const accuracy = this.getAccuracyReport();
      if (accuracy.overestimated > 50) {
        reasons.push('Historical data shows tendency to overestimate');
      } else if (accuracy.underestimated > 50) {
        reasons.push('Historical data shows tendency to underestimate');
      }
    }

    // Velocity adjustment
    if (this.config.velocityMultiplier !== 1.0) {
      reasons.push(`Team velocity factor of ${this.config.velocityMultiplier.toFixed(1)}x applied`);
    }

    return reasons;
  }

  /**
   * Format size for display
   */
  private formatSize(size: TaskSize): string {
    const sizeColors = {
      S: chalk.green,
      M: chalk.yellow,
      L: chalk.magenta,
      XL: chalk.red,
    };

    const sizeLabels = {
      S: 'Small',
      M: 'Medium',
      L: 'Large',
      XL: 'Extra Large',
    };

    return sizeColors[size](`${size} (${sizeLabels[size]})`);
  }

  /**
   * Format confidence for display
   */
  private formatConfidence(confidence: 'low' | 'medium' | 'high'): string {
    const confidenceColors = {
      low: chalk.red,
      medium: chalk.yellow,
      high: chalk.green,
    };

    return confidenceColors[confidence](confidence);
  }
}
