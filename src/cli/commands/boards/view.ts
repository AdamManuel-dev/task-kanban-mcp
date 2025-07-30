/**
 * @fileoverview Board view command implementation
 * @lastmodified 2025-07-28T12:30:00Z
 *
 * Features: Interactive board visualization with React components and real-time updates
 * Main APIs: registerViewCommand() - registers view subcommand with interactive controls
 * Constraints: Requires Ink/React for interactive mode, complex state management
 * Patterns: React component integration, auto-refresh, keyboard controls
 */

import * as React from 'react';
// Dynamic import for ink to avoid ESM/CommonJS conflicts
import type { Command } from 'commander';
import type { CliComponents } from '../../types';
import type { Task, Board, Column } from '../../../types';
import BoardView from '../../ui/components/BoardView';
import { SpinnerManager } from '../../utils/spinner';
import { logger } from '../../../utils/logger';
import { extractErrorMessage } from '../../../utils/type-guards';

interface ViewBoardOptions {
  interactive?: boolean;
  wipLimits?: boolean;
  refresh?: string;
  maxHeight?: string;
  columnWidth?: string;
}

interface BoardData {
  id: string;
  name: string;
  description?: string | undefined;
  archived: boolean;
  createdAt: string;
  updatedAt?: string | undefined;
  columns?: Column[] | undefined;
  tasks?: Task[] | undefined;
}

interface ApiBoardResponse {
  id: string;
  name: string;
  description?: string;
  columns?: Array<{
    id: string;
    name: string;
    wip_limit?: number;
    tasks?: Array<{
      id: string;
      title: string;
      status: string;
      priority: string;
      assignee?: string;
      tags?: string[];
      due_date?: string;
    }>;
  }>;
}

/**
 * Register the view command
 */
export function registerViewCommand(boardCmd: Command): void {
  const getComponents = (): CliComponents => {
    if (!global.cliComponents) {
      throw new Error('CLI components not initialized. Please initialize the CLI first.');
    }
    return global.cliComponents;
  };

  /**
   * Interactive board view with real-time updates.
   *
   * @command view [id]
   *
   * @param id - Board ID (uses default board if not specified)
   * @option -i, --interactive - Enable interactive mode (default: true)
   * @option --no-interactive - Disable interactive mode
   * @option --wip-limits - Show Work-In-Progress limits (default: true)
   * @option --refresh <seconds> - Auto-refresh interval in seconds (default: 30)
   * @option --max-height <number> - Maximum tasks shown per column (default: 8)
   * @option --column-width <number> - Column display width (default: 25)
   *
   * Interactive controls:
   * - ←/→ or h/l: Switch columns
   * - ↑/↓ or j/k: Navigate tasks
   * - Enter: Select task/column
   * - r: Manual refresh
   * - n: New task in column
   * - e: Edit selected task
   * - d: Delete selected task
   * - ?: Show help
   * - q: Quit
   */
  boardCmd
    .command('view [id]')
    .description('Interactive board view with live updates')
    .option('-i, --interactive', 'enable interactive mode (default)', true)
    .option('--no-interactive', 'disable interactive mode')
    .option('--wip-limits', 'show WIP limits', true)
    .option('--refresh <seconds>', 'auto-refresh interval', '30')
    .option('--max-height <number>', 'maximum column height', '8')
    .option('--column-width <number>', 'column width', '25')
    .action(async (id?: string, options?: ViewBoardOptions): Promise<void> => {
      const { config, apiClient, formatter } = getComponents();

      try {
        // Determine board ID
        const boardId = id ?? config.getDefaultBoard();
        if (!boardId) {
          formatter.error(
            'Board ID is required. Specify an ID or set default board with "kanban board use <id>"'
          );
          process.exit(1);
        }

        // Fetch board data with spinner
        const spinner = new SpinnerManager();
        const boardData = await spinner.withSpinner(
          `Loading board: ${String(boardId)}`,
          apiClient.getBoard(boardId),
          {
            successText: 'Board loaded successfully',
            failText: 'Failed to load board',
          }
        );

        if (!boardData) {
          formatter.error(`Board ${String(boardId)} not found`);
          process.exit(1);
        }

        // Transform API data to component format
        const apiResponse = boardData as ApiBoardResponse;
        const board: Board = {
          id: apiResponse.id,
          name: apiResponse.name,
          description: apiResponse.description,
          color: '#007acc',
          created_at: new Date(),
          updated_at: new Date(),
          archived: false,
        };

        if (!options?.interactive) {
          // Non-interactive mode - just show board data
          formatter.output(board);
          return;
        }

        // Interactive mode with React component
        spinner.info(`Starting interactive board view for: ${board.name}`);

        let refreshInterval: NodeJS.Timeout | null = null;
        let shouldRefresh = false;

        const InteractiveBoardView = (): React.ReactElement => {
          const [currentBoard, setCurrentBoard] = React.useState<BoardData>({
            id: board.id,
            name: board.name,
            description: board.description ?? undefined,
            archived: board.archived,
            createdAt: board.created_at.toISOString(),
            updatedAt: board.updated_at.toISOString(),
            columns: [],
            tasks: [],
          });

          // Auto-refresh functionality
          React.useEffect(() => {
            if (options.refresh && parseInt(options.refresh, 10) > 0) {
              const interval = parseInt(options.refresh, 10) * 1000;
              refreshInterval = setInterval(() => {
                if (!shouldRefresh) return;

                (async (): Promise<void> => {
                  try {
                    const refreshedData = await apiClient.getBoard(boardId);
                    if (refreshedData) {
                      const refreshedApiResponse = refreshedData as ApiBoardResponse;
                      const refreshedBoard: Board = {
                        id: refreshedApiResponse.id,
                        name: refreshedApiResponse.name,
                        description: refreshedApiResponse.description,
                        color: '#2196F3', // Default color
                        created_at: new Date(),
                        updated_at: new Date(),
                        archived: false,
                      };

                      // Process refreshed board data with proper typing
                      const boardWithContent: BoardData = {
                        id: refreshedBoard.id,
                        name: refreshedBoard.name,
                        description: refreshedBoard.description ?? undefined,
                        archived: refreshedBoard.archived,
                        createdAt: refreshedBoard.created_at.toISOString(),
                        updatedAt: refreshedBoard.updated_at.toISOString(),
                        columns: (refreshedApiResponse.columns ?? []) as Column[],
                        tasks: [],
                      };
                      setCurrentBoard(boardWithContent);
                    }
                  } catch (error) {
                    // Silently fail refresh
                  }
                })().catch((err: Error) => {
                  logger.error('Auto-refresh failed', { error: err.message });
                });
              }, interval);
            }

            return () => {
              if (refreshInterval) {
                clearInterval(refreshInterval);
              }
            };
          }, []);

          // Enable refresh after initial render
          React.useEffect(() => {
            shouldRefresh = true;
          }, []);

          const boardForView: Board = {
            id: currentBoard.id,
            name: currentBoard.name,
            description: currentBoard.description,
            color: '#2196F3',
            created_at: new Date(currentBoard.createdAt),
            updated_at: new Date(currentBoard.updatedAt ?? currentBoard.createdAt),
            archived: currentBoard.archived,
          };

          return React.createElement(BoardView, {
            board: boardForView,
            columns: currentBoard.columns ?? [],
            tasks: currentBoard.tasks ?? [],
            showDetails: false,
          });
        };

        // Show loading indicator and instructions
        formatter.info(`Starting interactive board view for: ${String(board.name)}`);
        formatter.info('Press ? for help, q to quit');

        // TODO: Re-enable interactive view once ink module resolution is fixed
        // const { render } = await import('ink');
        // render(React.createElement(InteractiveBoardView));
        formatter.info('Interactive mode temporarily disabled - showing board data instead');
        formatter.output(board);
      } catch (error) {
        formatter.error(`Failed to start board view: ${extractErrorMessage(error)}`);
        process.exit(1);
      }
    });
}
