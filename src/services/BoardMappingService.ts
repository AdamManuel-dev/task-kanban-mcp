import { promises as fs } from 'fs';
import path from 'path';
import type { GitRepository, BoardMappingRule } from '../types/git';
import { GitService } from './GitService';

interface KanbanConfig {
  boards?: Record<string, string>;
  mappings?: BoardMappingRule[];
  defaultBoard?: string;
  git?: {
    enabled: boolean;
    autoDetect: boolean;
    branchPatterns: Record<string, string>;
  };
}

export class BoardMappingService {
  private static readonly CONFIG_FILE = '.kanban-config.json';

  /**
   * Load configuration from .kanban-config.json
   */
  static async loadConfig(startPath: string = process.cwd()): Promise<KanbanConfig | null> {
    let currentPath = path.resolve(startPath);
    const { root } = path.parse(currentPath);

    while (currentPath !== root) {
      const configPath = path.join(currentPath, this.CONFIG_FILE);

      try {
        const content = await fs.readFile(configPath, 'utf-8');
        const config = JSON.parse(content) as KanbanConfig;
        return config;
      } catch {
        // Config file doesn't exist or invalid, continue searching upward
      }

      currentPath = path.dirname(currentPath);
    }

    return null;
  }

  /**
   * Determine the appropriate board for a git repository
   */
  static async determineBoardForRepository(repo: GitRepository): Promise<string | null> {
    const config = await this.loadConfig(repo.path);

    if (!config?.git?.enabled) {
      return config?.defaultBoard || null;
    }

    // Try to match using configured mapping rules
    if (config.mappings) {
      const matchedBoard = this.findMatchingBoard(repo, config.mappings);
      if (matchedBoard) {
        return matchedBoard;
      }
    }

    // Try branch pattern matching
    if (config.git.branchPatterns && repo.currentBranch) {
      const branchBoard = this.matchBranchPattern(repo.currentBranch, config.git.branchPatterns);
      if (branchBoard) {
        return branchBoard;
      }
    }

    // Try simple board name matching
    if (config.boards) {
      const repoBoard = this.matchRepositoryName(repo, config.boards);
      if (repoBoard) {
        return repoBoard;
      }
    }

    return config.defaultBoard || null;
  }

  /**
   * Find board using mapping rules
   */
  private static findMatchingBoard(
    repo: GitRepository,
    mappings: BoardMappingRule[]
  ): string | null {
    // Sort by priority (higher priority first)
    const sortedMappings = [...mappings].sort((a, b) => (b.priority || 0) - (a.priority || 0));

    for (const mapping of sortedMappings) {
      if (this.matchesRule(repo, mapping)) {
        return mapping.boardId;
      }
    }

    return null;
  }

  /**
   * Check if repository matches a mapping rule
   */
  private static matchesRule(repo: GitRepository, rule: BoardMappingRule): boolean {
    switch (rule.type) {
      case 'repo':
        return repo.remoteUrl ? this.matchPattern(repo.remoteUrl, rule.pattern) : false;

      case 'branch':
        return repo.currentBranch ? this.matchPattern(repo.currentBranch, rule.pattern) : false;

      case 'path':
        return this.matchPattern(repo.path, rule.pattern);

      default:
        return false;
    }
  }

  /**
   * Match branch pattern to board
   */
  private static matchBranchPattern(
    branch: string,
    patterns: Record<string, string>
  ): string | null {
    for (const [pattern, boardId] of Object.entries(patterns)) {
      if (this.matchPattern(branch, pattern)) {
        return boardId;
      }
    }
    return null;
  }

  /**
   * Match repository name to board
   */
  private static matchRepositoryName(
    repo: GitRepository,
    boards: Record<string, string>
  ): string | null {
    // Try exact repository name match
    if (boards[repo.name]) {
      return boards[repo.name];
    }

    // Try remote URL matching
    if (repo.remoteUrl) {
      const repoName = this.extractRepoNameFromUrl(repo.remoteUrl);
      if (repoName && boards[repoName]) {
        return boards[repoName];
      }
    }

    return null;
  }

  /**
   * Extract repository name from git URL
   */
  private static extractRepoNameFromUrl(url: string): string | null {
    // Handle GitHub URLs like: git@github.com:user/repo.git or https://github.com/user/repo.git
    const patterns = [
      /\/([^/]+)\.git$/, // Extract from .git suffix
      /\/([^/]+)$/, // Extract from end of path
      /:([^/]+)\.git$/, // SSH format with .git
      /:([^/]+)$/, // SSH format without .git
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Simple pattern matching with wildcards
   */
  private static matchPattern(text: string, pattern: string): boolean {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape regex chars
      .replace(/\\\*/g, '.*') // Convert * to .*
      .replace(/\\\?/g, '.'); // Convert ? to .

    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(text);
  }

  /**
   * Create default configuration file
   */
  static async createDefaultConfig(targetPath: string): Promise<void> {
    const configPath = path.join(targetPath, this.CONFIG_FILE);

    const defaultConfig: KanbanConfig = {
      git: {
        enabled: true,
        autoDetect: true,
        branchPatterns: {
          'feature/*': 'development',
          'bug/*': 'bugs',
          'hotfix/*': 'hotfixes',
          main: 'production',
          master: 'production',
        },
      },
      defaultBoard: 'default',
      mappings: [
        {
          pattern: '*',
          boardId: 'default',
          type: 'repo',
          priority: 0,
        },
      ],
    };

    await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2));
  }

  /**
   * Get board for current working directory
   */
  static async getCurrentBoard(): Promise<string | null> {
    const repo = await GitService.detectRepository();
    if (!repo) {
      return null;
    }

    return this.determineBoardForRepository(repo);
  }
}
