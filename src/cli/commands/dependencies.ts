/**
 * CLI Commands for Task Dependencies
 * Provides dependency visualization and analysis tools
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { getCLIService } from '@/cli/services/ServiceContainer';
import { logger } from '@/utils/logger';
import type { GraphFormatOptions } from '@/services/DependencyVisualizationService';

interface DependencyOptions {
  board?: string;
  format?: 'tree' | 'dot' | 'ascii';
  details?: boolean;
  output?: string;
}

interface CriticalPathOptions {
  board?: string;
  json?: boolean;
}

interface BoardSelection {
  boardId: string | null;
}

// Helper functions
function getStatusIcon(status: string): string {
  switch (status) {
    case 'todo':
      return '⭕';
    case 'in_progress':
      return '🔄';
    case 'done':
      return '✅';
    case 'blocked':
      return '🚫';
    case 'archived':
      return '📦';
    default:
      return '❓';
  }
}

function getPriorityBadge(priority?: number): string {
  if (!priority) return chalk.gray('📝');
  if (priority >= 8) return chalk.red.bold('🔥');
  if (priority >= 6) return chalk.yellow.bold('⚡');
  if (priority >= 4) return chalk.blue.bold('📈');
  return chalk.gray('📝');
}

export function createDependenciesCommand(): Command {
  const deps = new Command('deps')
    .alias('dependencies')
    .description('Manage and visualize task dependencies');

  // Visualize dependency graph
  deps
    .command('graph')
    .description('Display dependency graph visualization')
    .option('-b, --board <board-id>', 'Filter by board ID')
    .option('-f, --format <format>', 'Output format (tree, dot, ascii)', 'tree')
    .option('-d, --details', 'Show task details in visualization')
    .option('-o, --output <file>', 'Save output to file')
    .action(async (options: DependencyOptions) => {
      try {
        const depService = await getCLIService('dependencyVisualizationService');

        let boardId: string | undefined | null = options.board;
        if (!boardId) {
          const boardService = await getCLIService('boardService');
          const boards = await boardService.getBoards();

          if (boards.length === 0) {
            logger.info('No boards available for dependency visualization');
            return;
          }

          if (boards.length > 1) {
            const boardAnswer = await inquirer.prompt<BoardSelection>([
              {
                type: 'list',
                name: 'boardId',
                message: 'Select board:',
                choices: [
                  { name: 'All boards', value: null },
                  ...boards.map(board => ({
                    name: `${board.name} (${board.id})`,
                    value: board.id,
                  })),
                ],
              },
            ]);
            boardId = boardAnswer.boardId;
          }
        }

        const formatOptions: GraphFormatOptions = {
          format: options.format as 'tree' | 'dot' | 'ascii',
          ...(options.details !== undefined && { showTaskDetails: options.details }),
        };

        logger.info('Starting dependency visualization generation', {
          boardId,
          format: formatOptions.format,
        });

        const visualization = await depService.generateAsciiVisualization(
          boardId ?? undefined,
          formatOptions
        );

        if (options.output) {
          const fs = await import('fs').then(m => m.promises);
          await fs.writeFile(options.output, visualization);
          logger.info('Dependency visualization saved to file', { outputFile: options.output });
        } else {
          logger.info(visualization);
        }
      } catch (error) {
        logger.error('Failed to generate dependency graph:', error);
      }
    });

  // Show critical path
  deps
    .command('critical-path')
    .alias('critical')
    .description('Find and display the critical path')
    .option('-b, --board <board-id>', 'Filter by board ID')
    .option('--json', 'Output as JSON')
    .action(async (options: CriticalPathOptions) => {
      try {
        const depService = await getCLIService('dependencyVisualizationService');

        logger.info('Starting critical path analysis', { boardId: options.board });

        const result = await depService.findCriticalPath(options.board ?? undefined);

        if (options.json) {
          logger.debug('Critical path result', {
            resultLength: result.critical_path.length,
            totalDuration: result.total_duration,
          });
          logger.info(JSON.stringify(result, null, 2));
          return;
        }

        if (result.critical_path.length === 0) {
          logger.info('No critical path found - no dependencies exist', { boardId: options.board });
          return;
        }

        logger.info('Critical Path (Longest Chain):');

        result.critical_path.forEach((task, index) => {
          const isLast = index === result.critical_path.length - 1;
          const connector = isLast ? '└─' : '├─';
          const statusIcon = getStatusIcon(task.status);
          const priorityBadge = getPriorityBadge(task.priority);

          logger.info(`${connector} ${statusIcon} ${priorityBadge} ${task.title}`);
          logger.info(`   ID: ${task.id} | Status: ${task.status}`);

          if (task.estimated_hours) {
            logger.info(`   Estimated: ${task.estimated_hours}h`);
          }

          if (task.due_date) {
            const dueDate = new Date(task.due_date);
            const isOverdue = dueDate < new Date();
            const dueDateStr = dueDate.toLocaleDateString();
            logger.info(`   Due: ${dueDateStr}${isOverdue ? ' (OVERDUE)' : ''}`);
          }

          if (!isLast) {
            logger.info('   │');
          }
        });

        logger.info('Critical Path Summary:');
        logger.info(`   Total Duration: ${result.total_duration.toFixed(1)} hours`);
        logger.info(`   Tasks in Path: ${result.critical_path.length}`);
        logger.info(`   Dependencies: ${result.dependency_count}`);

        if (result.bottlenecks.length > 0) {
          logger.info('Bottleneck Tasks:');
          result.bottlenecks.forEach(task => {
            logger.info(`   • ${task.title} (${task.id})`);
          });
        }

        if (result.starting_tasks.length > 0) {
          logger.info('Starting Tasks (No Dependencies):');
          result.starting_tasks.forEach(task => {
            logger.info(`   • ${task.title} (${task.id})`);
          });
        }
      } catch (error) {
        logger.error('Failed to find critical path:', error);
      }
    });

  // Analyze task impact
  deps
    .command('impact <task-id>')
    .description('Analyze the impact of a specific task')
    .option('--json', 'Output as JSON')
    .action(async (taskId: string, options: { json?: boolean }) => {
      try {
        const depService = await getCLIService('dependencyVisualizationService');
        const taskService = await getCLIService('taskService');

        // Verify task exists
        const task = await taskService.getTaskById(taskId);
        if (!task) {
          logger.error(`Task not found: ${taskId}`);
          return;
        }

        logger.info(`Analyzing impact of task: ${task.title}`);

        const impact = await depService.analyzeTaskImpact(taskId);

        if (options.json) {
          logger.info(JSON.stringify(impact, null, 2));
          return;
        }

        logger.info(`Task: ${task.title}`);
        logger.info(`   ID: ${task.id}`);
        logger.info(`   Status: ${task.status}`);

        logger.info(`Direct Impact (${impact.directDependents.length} tasks):`);
        if (impact.directDependents.length === 0) {
          logger.info('   No tasks directly depend on this task.');
        } else {
          impact.directDependents.forEach(depTask => {
            const statusIcon = getStatusIcon(depTask.status);
            logger.info(`   ${statusIcon} ${depTask.title} (${depTask.id})`);
          });
        }

        logger.info(`Indirect Impact (${impact.indirectDependents.length} tasks):`);
        if (impact.indirectDependents.length === 0) {
          logger.info('   No tasks indirectly depend on this task.');
        } else {
          impact.indirectDependents.forEach(depTask => {
            const statusIcon = getStatusIcon(depTask.status);
            logger.info(`   ${statusIcon} ${depTask.title} (${depTask.id})`);
          });
        }

        logger.info('Impact Summary:');
        logger.info(`   Total Impacted Tasks: ${impact.totalImpact}`);
        logger.info(`   Would Block: ${impact.wouldBlockCount} tasks`);

        let riskLevel: string;
        if (impact.totalImpact > 5) {
          riskLevel = 'HIGH';
        } else if (impact.totalImpact > 2) {
          riskLevel = 'MEDIUM';
        } else {
          riskLevel = 'LOW';
        }

        logger.info(`   Risk Level: ${riskLevel}`);

        if (impact.totalImpact > 0) {
          logger.info('Recommendations:');
          if (impact.wouldBlockCount > 3) {
            logger.info('   • High blocking risk - Consider breaking this task into smaller parts');
          }
          if (task.status === 'blocked') {
            logger.info('   • Currently blocked - Prioritize unblocking this task');
          }
          if (impact.totalImpact > 5) {
            logger.info('   • High impact task - Monitor progress closely');
          }
        }
      } catch (error) {
        logger.error('Failed to analyze task impact:', error);
      }
    });

  // Add dependency between tasks
  deps
    .command('add <task-id> <depends-on-id>')
    .description('Add a dependency between tasks')
    .option('-t, --type <type>', 'Dependency type (blocks, relates_to, duplicates)', 'blocks')
    .action(async (taskId: string, dependsOnId: string, _options) => {
      try {
        const taskService = await getCLIService('taskService');

        // Verify both tasks exist
        const [task, dependsOnTask] = await Promise.all([
          taskService.getTaskById(taskId),
          taskService.getTaskById(dependsOnId),
        ]);

        if (!task) {
          logger.error(chalk.red(`❌ Task not found: ${taskId}`));
          return;
        }

        if (!dependsOnTask) {
          logger.error(chalk.red(`❌ Dependency task not found: ${dependsOnId}`));
          return;
        }

        // Check for cycles
        const depService = await getCLIService('dependencyVisualizationService');
        const impact = await depService.analyzeTaskImpact(dependsOnId);

        if (
          impact.directDependents.some(t => t.id === taskId) ||
          impact.indirectDependents.some(t => t.id === taskId)
        ) {
          logger.error(chalk.red('❌ Cannot add dependency: would create a cycle'));
          return;
        }

        // Add the dependency (this would need to be implemented in TaskService)
        logger.info(
          chalk.blue(`🔗 Adding dependency: ${task.title} depends on ${dependsOnTask.title}`)
        );

        // TODO: Implement addDependency method in TaskService
        logger.warn(chalk.yellow('⚠️  Dependency addition not yet implemented in TaskService'));
      } catch (error) {
        logger.error('Failed to add dependency:', error);
        logger.error(chalk.red('❌ Failed to add dependency'));
      }
    });

  // List dependencies for a task
  deps
    .command('list <task-id>')
    .description('List dependencies for a task')
    .option('--incoming', 'Show tasks that depend on this task')
    .option('--outgoing', 'Show tasks this task depends on')
    .action(async (taskId: string, options) => {
      try {
        const taskService = await getCLIService('taskService');
        const depService = await getCLIService('dependencyVisualizationService');

        const task = await taskService.getTaskById(taskId);
        if (!task) {
          logger.error(chalk.red(`❌ Task not found: ${taskId}`));
          return;
        }

        logger.info(chalk.blue.bold(`🔗 Dependencies for: ${task.title}\n`));

        const impact = await depService.analyzeTaskImpact(taskId);
        const graph = await depService.getDependencyGraph();
        const node = graph.nodes.get(taskId);

        if (!node) {
          logger.info(chalk.yellow('Task not found in dependency graph.'));
          return;
        }

        const displayOptions = { ...options };
        if (!options.incoming && !options.outgoing) {
          displayOptions.incoming = true;
          displayOptions.outgoing = true;
        }

        if (displayOptions.outgoing) {
          logger.info(chalk.red.bold('📤 This task depends on:'));
          if (node.dependencies.length === 0) {
            logger.info(chalk.dim('   No dependencies'));
          } else {
            for (const depId of node.dependencies) {
              const depNode = graph.nodes.get(depId)!;
              const statusIcon = getStatusIcon(depNode.task.status);
              logger.info(`   ${statusIcon} ${depNode.task.title} (${depId})`);
            }
          }
          logger.info('');
        }

        if (displayOptions.incoming) {
          logger.info(chalk.yellow.bold('📥 Tasks that depend on this:'));
          if (impact.directDependents.length === 0) {
            logger.info(chalk.dim('   No dependents'));
          } else {
            impact.directDependents.forEach(depTask => {
              const statusIcon = getStatusIcon(depTask.status);
              logger.info(`   ${statusIcon} ${depTask.title} (${depTask.id})`);
            });
          }
        }
      } catch (error) {
        logger.error('Failed to list dependencies:', error);
        logger.error(chalk.red('❌ Failed to list dependencies'));
      }
    });

  return deps;
}
