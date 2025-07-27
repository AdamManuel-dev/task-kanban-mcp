/**
 * CLI Commands for Task Templates
 * Provides template management and task creation from templates
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { TaskTemplateService } from '@/services/TaskTemplateService';
import { BoardService } from '@/services/BoardService';
import { formatter } from '@/cli/formatter';
import { logger } from '@/utils/logger';
import type { TaskTemplate, TaskTemplateCreateRequest, TaskFromTemplateRequest } from '@/types/templates';

export function createTemplatesCommand(): Command {
  const templates = new Command('templates')
    .alias('tpl')
    .description('Manage and use task templates');

  // List templates
  templates
    .command('list')
    .alias('ls')
    .description('List available templates')
    .option('-c, --category <category>', 'Filter by category')
    .option('-a, --all', 'Include inactive templates')
    .option('-s, --system', 'Show only system templates')
    .action(async (options) => {
      try {
        const templateService = TaskTemplateService.getInstance();
        const templates = await templateService.getTemplates({
          category: options.category,
          includeInactive: options.all,
          onlySystem: options.system,
        });

        if (templates.length === 0) {
          console.log(chalk.yellow('No templates found.'));
          return;
        }

        console.log(chalk.blue.bold('\n📋 Task Templates\n'));
        
        const categories = templateService.getCategories();
        const groupedTemplates = templates.reduce((acc, template) => {
          if (!acc[template.category]) {
            acc[template.category] = [];
          }
          acc[template.category].push(template);
          return acc;
        }, {} as Record<string, TaskTemplate[]>);

        for (const [categoryName, categoryTemplates] of Object.entries(groupedTemplates)) {
          const category = categories.find(c => c.name === categoryName);
          const categoryIcon = category?.icon || '📄';
          const categoryDisplayName = category?.display_name || categoryName;
          
          console.log(chalk.cyan.bold(`${categoryIcon} ${categoryDisplayName}`));
          
          for (const template of categoryTemplates) {
            const statusIcon = template.is_active ? '✅' : '❌';
            const systemIcon = template.is_system ? '🔧' : '👤';
            const usageCount = template.usage_count > 0 ? chalk.gray(`(used ${template.usage_count}x)`) : '';
            
            console.log(`  ${statusIcon} ${systemIcon} ${chalk.white.bold(template.name)} ${usageCount}`);
            if (template.description) {
              console.log(`     ${chalk.gray(template.description)}`);
            }
            console.log(`     ${chalk.dim(`ID: ${template.id}`)}`);
          }
          console.log();
        }
      } catch (error) {
        logger.error('Failed to list templates:', error);
        console.error(chalk.red('❌ Failed to list templates'));
      }
    });

  // Show template details
  templates
    .command('show <id>')
    .description('Show template details')
    .action(async (id: string) => {
      try {
        const templateService = TaskTemplateService.getInstance();
        const template = await templateService.getTemplate(id);

        if (!template) {
          console.error(chalk.red('❌ Template not found'));
          return;
        }

        console.log(chalk.blue.bold('\n📋 Template Details\n'));
        console.log(`${chalk.bold('Name:')} ${template.name}`);
        console.log(`${chalk.bold('Category:')} ${template.category}`);
        console.log(`${chalk.bold('Description:')} ${template.description || 'No description'}`);
        console.log(`${chalk.bold('Priority:')} ${template.priority}`);
        console.log(`${chalk.bold('Estimated Hours:')} ${template.estimated_hours || 'Not set'}`);
        console.log(`${chalk.bold('System Template:')} ${template.is_system ? 'Yes' : 'No'}`);
        console.log(`${chalk.bold('Active:')} ${template.is_active ? 'Yes' : 'No'}`);
        console.log(`${chalk.bold('Usage Count:')} ${template.usage_count}`);
        
        if (template.tags.length > 0) {
          console.log(`${chalk.bold('Tags:')} ${template.tags.join(', ')}`);
        }

        console.log(`\n${chalk.bold('Title Template:')}`);
        console.log(chalk.gray(template.title_template));

        if (template.description_template) {
          console.log(`\n${chalk.bold('Description Template:')}`);
          console.log(chalk.gray(template.description_template));
        }

        if (template.checklist_items.length > 0) {
          console.log(`\n${chalk.bold('Checklist Items:')}`);
          template.checklist_items.forEach((item, index) => {
            console.log(`  ${index + 1}. ${item}`);
          });
        }

        console.log(`\n${chalk.bold('Created:')} ${new Date(template.created_at).toLocaleString()}`);
        console.log(`${chalk.bold('Updated:')} ${new Date(template.updated_at).toLocaleString()}`);
      } catch (error) {
        logger.error('Failed to show template:', error);
        console.error(chalk.red('❌ Failed to show template'));
      }
    });

  // Create new template
  templates
    .command('create')
    .description('Create a new template')
    .option('-n, --name <name>', 'Template name')
    .option('-c, --category <category>', 'Template category')
    .action(async (options) => {
      try {
        const templateService = TaskTemplateService.getInstance();
        const categories = templateService.getCategories();

        // Interactive template creation
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'name',
            message: 'Template name:',
            default: options.name,
            validate: (input) => input.trim().length > 0 || 'Name is required',
          },
          {
            type: 'list',
            name: 'category',
            message: 'Template category:',
            choices: categories.map(cat => ({
              name: `${cat.icon} ${cat.display_name} - ${cat.description}`,
              value: cat.name,
            })),
            default: options.category,
          },
          {
            type: 'input',
            name: 'description',
            message: 'Template description (optional):',
          },
          {
            type: 'input',
            name: 'title_template',
            message: 'Title template (use {{variable}} for placeholders):',
            validate: (input) => input.trim().length > 0 || 'Title template is required',
          },
          {
            type: 'editor',
            name: 'description_template',
            message: 'Description template (optional, will open editor):',
          },
          {
            type: 'number',
            name: 'priority',
            message: 'Default priority (0-5):',
            default: 1,
            validate: (input) => (input >= 0 && input <= 5) || 'Priority must be between 0 and 5',
          },
          {
            type: 'number',
            name: 'estimated_hours',
            message: 'Default estimated hours (optional):',
          },
          {
            type: 'input',
            name: 'tags',
            message: 'Default tags (comma-separated, optional):',
          },
          {
            type: 'input',
            name: 'checklist_items',
            message: 'Checklist items (comma-separated, optional):',
          },
        ]);

        const createRequest: TaskTemplateCreateRequest = {
          name: answers.name,
          description: answers.description || undefined,
          category: answers.category,
          title_template: answers.title_template,
          description_template: answers.description_template || undefined,
          priority: answers.priority,
          estimated_hours: answers.estimated_hours || undefined,
          tags: answers.tags ? answers.tags.split(',').map((tag: string) => tag.trim()) : [],
          checklist_items: answers.checklist_items 
            ? answers.checklist_items.split(',').map((item: string) => item.trim())
            : [],
        };

        const template = await templateService.createTemplate(createRequest);
        console.log(chalk.green(`✅ Template "${template.name}" created successfully!`));
        console.log(chalk.dim(`ID: ${template.id}`));
      } catch (error) {
        logger.error('Failed to create template:', error);
        console.error(chalk.red('❌ Failed to create template'));
      }
    });

  // Use template to create task
  templates
    .command('use <template-id>')
    .description('Create a task from a template')
    .option('-b, --board <board-id>', 'Target board ID')
    .option('-a, --assignee <assignee>', 'Task assignee')
    .option('-d, --due-date <date>', 'Due date (YYYY-MM-DD)')
    .option('-p, --parent <parent-id>', 'Parent task ID')
    .action(async (templateId: string, options) => {
      try {
        const templateService = TaskTemplateService.getInstance();
        const boardService = BoardService.getInstance();

        // Get template
        const template = await templateService.getTemplate(templateId);
        if (!template) {
          console.error(chalk.red('❌ Template not found'));
          return;
        }

        // Get board
        let boardId = options.board;
        if (!boardId) {
          const boards = await boardService.getBoards();
          if (boards.length === 0) {
            console.error(chalk.red('❌ No boards available'));
            return;
          }

          const boardAnswer = await inquirer.prompt([
            {
              type: 'list',
              name: 'boardId',
              message: 'Select target board:',
              choices: boards.map(board => ({
                name: `${board.name} (${board.id})`,
                value: board.id,
              })),
            },
          ]);
          boardId = boardAnswer.boardId;
        }

        // Extract variables from template
        const variables = extractTemplateVariables(template.title_template + ' ' + (template.description_template || ''));
        
        let variableValues: Record<string, any> = {};
        if (variables.length > 0) {
          console.log(chalk.blue('\n📝 Template Variables\n'));
          const variableAnswers = await inquirer.prompt(
            variables.map(variable => ({
              type: 'input',
              name: variable,
              message: `${variable}:`,
            }))
          );
          variableValues = variableAnswers;
        }

        // Create task from template
        const createRequest: TaskFromTemplateRequest = {
          template_id: templateId,
          board_id: boardId,
          variables: variableValues,
          assignee: options.assignee,
          due_date: options.dueDate,
          parent_task_id: options.parent,
        };

        const result = await templateService.createTaskFromTemplate(createRequest);
        
        console.log(chalk.green(`\n✅ Task created from template "${result.template_name}"!`));
        console.log(`${chalk.bold('Task ID:')} ${result.task_id}`);
        console.log(`${chalk.bold('Title:')} ${result.title}`);
        if (result.applied_tags.length > 0) {
          console.log(`${chalk.bold('Tags:')} ${result.applied_tags.join(', ')}`);
        }
        if (result.created_checklist_items > 0) {
          console.log(`${chalk.bold('Checklist Items:')} ${result.created_checklist_items} created`);
        }
      } catch (error) {
        logger.error('Failed to create task from template:', error);
        console.error(chalk.red('❌ Failed to create task from template'));
      }
    });

  // Delete template
  templates
    .command('delete <id>')
    .description('Delete a template')
    .option('-f, --force', 'Skip confirmation')
    .action(async (id: string, options) => {
      try {
        const templateService = TaskTemplateService.getInstance();
        const template = await templateService.getTemplate(id);

        if (!template) {
          console.error(chalk.red('❌ Template not found'));
          return;
        }

        if (template.is_system) {
          console.error(chalk.red('❌ Cannot delete system templates'));
          return;
        }

        if (!options.force) {
          const confirmation = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'delete',
              message: `Are you sure you want to delete template "${template.name}"?`,
              default: false,
            },
          ]);

          if (!confirmation.delete) {
            console.log(chalk.yellow('❌ Template deletion cancelled'));
            return;
          }
        }

        await templateService.deleteTemplate(id);
        console.log(chalk.green(`✅ Template "${template.name}" deleted successfully!`));
      } catch (error) {
        logger.error('Failed to delete template:', error);
        console.error(chalk.red('❌ Failed to delete template'));
      }
    });

  // Template usage statistics
  templates
    .command('stats')
    .description('Show template usage statistics')
    .action(async () => {
      try {
        const templateService = TaskTemplateService.getInstance();
        const stats = await templateService.getUsageStats();

        if (stats.length === 0) {
          console.log(chalk.yellow('No template usage statistics available.'));
          return;
        }

        console.log(chalk.blue.bold('\n📊 Template Usage Statistics\n'));
        
        stats.forEach((stat, index) => {
          console.log(`${index + 1}. ${chalk.bold(stat.template_name)}`);
          console.log(`   Usage Count: ${stat.usage_count}`);
          console.log(`   Last Used: ${new Date(stat.last_used).toLocaleDateString()}`);
          console.log(`   Success Rate: ${(stat.success_rate * 100).toFixed(1)}%`);
          console.log();
        });
      } catch (error) {
        logger.error('Failed to get template stats:', error);
        console.error(chalk.red('❌ Failed to get template statistics'));
      }
    });

  // Initialize system templates
  templates
    .command('init')
    .description('Initialize system templates')
    .action(async () => {
      try {
        const templateService = TaskTemplateService.getInstance();
        await templateService.initializeSystemTemplates();
        console.log(chalk.green('✅ System templates initialized successfully!'));
      } catch (error) {
        logger.error('Failed to initialize system templates:', error);
        console.error(chalk.red('❌ Failed to initialize system templates'));
      }
    });

  return templates;
}

// Helper function to extract template variables
function extractTemplateVariables(template: string): string[] {
  const variableRegex = /\{\{(\w+)\}\}/g;
  const variables = new Set<string>();
  let match;

  while ((match = variableRegex.exec(template)) !== null) {
    variables.add(match[1]);
  }

  return Array.from(variables).sort();
}