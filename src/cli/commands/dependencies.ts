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
    .action(async options => {
      try {
        const depService = await getCLIService('dependencyVisualizationService');

        let boardId = options.board;
        if (!boardId) {
          const boardService = await getCLIService('boardService');
          const boards = await boardService.getBoards();

          if (boards.length === 0) {
            logger.info('No boards available for dependency visualization');
            console.log(chalk.yellow('No boards found.'));
            return;
          }

          if (boards.length > 1) {
            const boardAnswer = await inquirer.prompt([
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
          showTaskDetails: options.details,
        };

        logger.info('Starting dependency visualization generation', {
          boardId,
          format: formatOptions.format,
        });
        console.log(chalk.blue.bold('🔗 Generating dependency visualization...\n'));

        const visualization = await depService.generateAsciiVisualization(boardId, formatOptions);

        if (options.output) {
          const fs = await import('fs').then(m => m.promises);
          await fs.writeFile(options.output, visualization);
          logger.info('Dependency visualization saved to file', { outputFile: options.output });
          console.log(chalk.green(`✅ Visualization saved to ${options.output}`));
        } else {
          console.log(visualization);
        }
      } catch (error) {
        logger.error('Failed to generate dependency graph:', error);
        console.error(chalk.red('❌ Failed to generate dependency graph'));
      }
    });

  // Show critical path
  deps
    .command('critical-path')
    .alias('critical')
    .description('Find and display the critical path')
    .option('-b, --board <board-id>', 'Filter by board ID')
    .option('--json', 'Output as JSON')
    .action(async options => {
      try {
        const depService = await getCLIService('dependencyVisualizationService');

        logger.info('Starting critical path analysis', { boardId: options.board });
        console.log(chalk.blue.bold('🎯 Analyzing critical path...\n'));

        const result = await depService.findCriticalPath(options.board);

        if (options.json) {
          logger.debug('Critical path result', {
            resultLength: result.critical_path.length,
            totalDuration: result.total_duration,
          });
          console.log(JSON.stringify(result, null, 2));
          return;
        }

        if (result.critical_path.length === 0) {
          logger.info('No critical path found - no dependencies exist', { boardId: options.board });
          console.log(chalk.yellow('No critical path found. No dependencies exist.'));
          return;
        }

        console.log(chalk.red.bold('🔥 Critical Path (Longest Chain):\n'));

        result.critical_path.forEach((task, index) => {
          const isLast = index === result.critical_path.length - 1;
          const connector = isLast ? '└─' : '├─';
          const statusIcon = getStatusIcon(task.status);
          const priorityBadge = getPriorityBadge(task.priority);

          console.log(`${connector} ${statusIcon} ${priorityBadge} ${chalk.bold(task.title)}`);
          console.log(`   ${chalk.dim(`ID: ${task.id} | Status: ${task.status}`)}`);

          if (task.estimated_hours) {
            console.log(`   ${chalk.dim(`Estimated: ${task.estimated_hours}h`)}`);
          }

          if (task.due_date) {
            const dueDate = new Date(task.due_date);
            const isOverdue = dueDate < new Date();
            const dueDateStr = dueDate.toLocaleDateString();
            const dueColor = isOverdue ? chalk.red : chalk.blue;
            console.log(`   ${chalk.dim(`Due: ${dueColor(dueDateStr)}`)}`);
          }

          if (!isLast) {
            console.log('   │');
          }
        });

        console.log(chalk.blue.bold('\n📊 Critical Path Summary:'));
        console.log(`   Total Duration: ${chalk.bold(result.total_duration.toFixed(1))} hours`);
        console.log(`   Tasks in Path: ${chalk.bold(result.critical_path.length)}`);
        console.log(`   Dependencies: ${chalk.bold(result.dependency_count)}`);

        if (result.bottlenecks.length > 0) {
          console.log(chalk.yellow.bold('\n⚠️  Bottleneck Tasks:'));
          result.bottlenecks.forEach(task => {
            console.log(`   • ${task.title} (${task.id})`);
          });
        }

        if (result.starting_tasks.length > 0) {
          console.log(chalk.green.bold('\n🟢 Starting Tasks (No Dependencies):'));
          result.starting_tasks.forEach(task => {
            console.log(`   • ${task.title} (${task.id})`);
          });
        }
      } catch (error) {
        logger.error('Failed to find critical path:', error);
        console.error(chalk.red('❌ Failed to find critical path'));
      }
    });

  // Analyze task impact
  deps
    .command('impact <task-id>')
    .description('Analyze the impact of a specific task')
    .option('--json', 'Output as JSON')
    .action(async (taskId: string, options) => {
      try {
        const depService = await getCLIService('dependencyVisualizationService');
        const taskService = await getCLIService('taskService');

        // Verify task exists
        const task = await taskService.getTaskById(taskId);
        if (!task) {
          console.error(chalk.red(`❌ Task not found: ${taskId}`));
          return;
        }

        console.log(chalk.blue.bold(`🔍 Analyzing impact of task: ${task.title}\n`));

        const impact = await depService.analyzeTaskImpact(taskId);

        if (options.json) {
          console.log(JSON.stringify(impact, null, 2));
          return;
        }

        console.log(chalk.bold(`📋 Task: ${task.title}`));
        console.log(chalk.dim(`   ID: ${task.id}`));
        console.log(chalk.dim(`   Status: ${task.status}`));
        console.log();

        console.log(chalk.red.bold(`🚫 Direct Impact (${impact.directDependents.length} tasks):`));
        if (impact.directDependents.length === 0) {
          console.log(chalk.dim('   No tasks directly depend on this task.'));
        } else {
          impact.directDependents.forEach(depTask => {
            const statusIcon = getStatusIcon(depTask.status);
            console.log(`   ${statusIcon} ${depTask.title} (${depTask.id})`);
          });
        }
        console.log();

        console.log(
          chalk.yellow.bold(`🔗 Indirect Impact (${impact.indirectDependents.length} tasks):`)
        );
        if (impact.indirectDependents.length === 0) {
          console.log(chalk.dim('   No tasks indirectly depend on this task.'));
        } else {
          impact.indirectDependents.forEach(depTask => {
            const statusIcon = getStatusIcon(depTask.status);
            console.log(`   ${statusIcon} ${depTask.title} (${depTask.id})`);
          });
        }
        console.log();

        console.log(chalk.blue.bold('📊 Impact Summary:'));
        console.log(`   Total Impacted Tasks: ${chalk.bold(impact.totalImpact)}`);
        console.log(`   Would Block: ${chalk.bold(impact.wouldBlockCount)} tasks`);

        const riskLevel =
          impact.totalImpact > 5 ? 'HIGH' : impact.totalImpact > 2 ? 'MEDIUM' : 'LOW';
        const riskColor =
          riskLevel === 'HIGH' ? chalk.red : riskLevel === 'MEDIUM' ? chalk.yellow : chalk.green;
        console.log(`   Risk Level: ${riskColor.bold(riskLevel)}`);

        if (impact.totalImpact > 0) {
          console.log(chalk.blue.bold('\n💡 Recommendations:'));
          if (impact.wouldBlockCount > 3) {
            console.log(
              `   • ${chalk.yellow('High blocking risk')} - Consider breaking this task into smaller parts`
            );
          }
          if (task.status === 'blocked') {
            console.log(`   • ${chalk.red('Currently blocked')} - Prioritize unblocking this task`);
          }
          if (impact.totalImpact > 5) {
            console.log(
              `   • ${chalk.yellowBright('High impact task')} - Monitor progress closely`
            );
          }
        }
      } catch (error) {
        logger.error('Failed to analyze task impact:', error);
        console.error(chalk.red('❌ Failed to analyze task impact'));
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
          console.error(chalk.red(`❌ Task not found: ${taskId}`));
          return;
        }

        if (!dependsOnTask) {
          console.error(chalk.red(`❌ Dependency task not found: ${dependsOnId}`));
          return;
        }

        // Check for cycles
        const depService = await getCLIService('dependencyVisualizationService');
        const impact = await depService.analyzeTaskImpact(dependsOnId);

        if (
          impact.directDependents.some(t => t.id === taskId) ||
          impact.indirectDependents.some(t => t.id === taskId)
        ) {
          console.error(chalk.red('❌ Cannot add dependency: would create a cycle'));
          return;
        }

        // Add the dependency (this would need to be implemented in TaskService)
        console.log(
          chalk.blue(`🔗 Adding dependency: ${task.title} depends on ${dependsOnTask.title}`)
        );

        // TODO: Implement addDependency method in TaskService
        console.log(chalk.yellow('⚠️  Dependency addition not yet implemented in TaskService'));
      } catch (error) {
        logger.error('Failed to add dependency:', error);
        console.error(chalk.red('❌ Failed to add dependency'));
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
          console.error(chalk.red(`❌ Task not found: ${taskId}`));
          return;
        }

        console.log(chalk.blue.bold(`🔗 Dependencies for: ${task.title}\n`));

        const impact = await depService.analyzeTaskImpact(taskId);
        const graph = await depService.getDependencyGraph();
        const node = graph.nodes.get(taskId);

        if (!node) {
          console.log(chalk.yellow('Task not found in dependency graph.'));
          return;
        }

        const displayOptions = { ...options };
        if (!options.incoming && !options.outgoing) {
          displayOptions.incoming = true;
          displayOptions.outgoing = true;
        }

        if (displayOptions.outgoing) {
          console.log(chalk.red.bold('📤 This task depends on:'));
          if (node.dependencies.length === 0) {
            console.log(chalk.dim('   No dependencies'));
          } else {
            for (const depId of node.dependencies) {
              const depNode = graph.nodes.get(depId)!;
              const statusIcon = getStatusIcon(depNode.task.status);
              console.log(`   ${statusIcon} ${depNode.task.title} (${depId})`);
            }
          }
          console.log();
        }

        if (displayOptions.incoming) {
          console.log(chalk.yellow.bold('📥 Tasks that depend on this:'));
          if (impact.directDependents.length === 0) {
            console.log(chalk.dim('   No dependents'));
          } else {
            impact.directDependents.forEach(depTask => {
              const statusIcon = getStatusIcon(depTask.status);
              console.log(`   ${statusIcon} ${depTask.title} (${depTask.id})`);
            });
          }
        }
      } catch (error) {
        logger.error('Failed to list dependencies:', error);
        console.error(chalk.red('❌ Failed to list dependencies'));
      }
    });

  return deps;
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
