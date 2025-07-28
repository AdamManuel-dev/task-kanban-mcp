import { promises as fs } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { GitRepository, GitBranch, GitCommit } from '../types/git';
import { logger } from '../utils/logger';

const execAsync = promisify(exec);

export class GitService {
  /**
   * Detect if the current directory or any parent directory contains a git repository
   */
  static async detectRepository(startPath: string = process.cwd()): Promise<GitRepository | null> {
    let currentPath = path.resolve(startPath);
    const { root } = path.parse(currentPath);

    while (currentPath !== root) {
      const gitPath = path.join(currentPath, '.git');

      try {
        const stats = await fs.stat(gitPath);
        if (stats.isDirectory()) {
          return await this.parseRepository(currentPath);
        }
      } catch {
        // .git directory doesn't exist, continue searching upward
      }

      currentPath = path.dirname(currentPath);
    }

    return null;
  }

  /**
   * Parse git repository information from a directory
   */
  private static async parseRepository(repoPath: string): Promise<GitRepository> {
    const name = path.basename(repoPath);

    try {
      // Get remote URL
      const remoteResult = await execAsync('git remote get-url origin', { cwd: repoPath });
      const remoteUrl = remoteResult.stdout.trim() || undefined;

      // Get current branch
      const branchResult = await execAsync('git branch --show-current', { cwd: repoPath });
      const currentBranch = branchResult.stdout.trim() || undefined;

      // Check if working directory is clean
      const statusResult = await execAsync('git status --porcelain', { cwd: repoPath });
      const isClean = statusResult.stdout.trim().length === 0;

      return {
        path: repoPath,
        name,
        remoteUrl,
        currentBranch,
        isClean,
      };
    } catch (error) {
      // Fallback with basic info if git commands fail
      return {
        path: repoPath,
        name,
        isClean: false,
      };
    }
  }

  /**
   * Get all branches in the repository
   */
  static async getBranches(repoPath: string): Promise<GitBranch[]> {
    try {
      const result = await execAsync('git branch -v', { cwd: repoPath });
      const lines = result.stdout.split('\n').filter(line => line.trim());

      return lines.map(line => {
        const isActive = line.startsWith('*');
        const cleanLine = line.replace(/^\*?\s+/, '');
        const parts = cleanLine.split(/\s+/);
        const name = parts[0];
        const lastCommit = parts[1];

        return {
          name: name || '',
          isActive,
          lastCommit: lastCommit !== name ? lastCommit || '' : '',
        };
      });
    } catch (error) {
      logger.error('Failed to get git branches', { error });
      return [];
    }
  }

  /**
   * Get commit history for the current branch
   */
  static async getCommitHistory(repoPath: string, limit: number = 10): Promise<GitCommit[]> {
    try {
      const result = await execAsync(
        `git log --oneline --format="%H|%s|%an|%ad" --date=iso -n ${limit}`,
        { cwd: repoPath }
      );

      return result.stdout
        .split('\n')
        .filter(line => line.trim())
        .map(line => {
          const [hash, message, author, dateStr] = line.split('|');
          return {
            hash: hash || '',
            message: message || '',
            author: author || '',
            date: new Date(dateStr || Date.now()),
          };
        });
    } catch (error) {
      logger.error('Failed to get commit history', { error });
      return [];
    }
  }

  /**
   * Check if a directory contains a git repository
   */
  static async isGitRepository(dirPath: string): Promise<boolean> {
    try {
      const gitPath = path.join(dirPath, '.git');
      const stats = await fs.stat(gitPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Get git repository info for multiple directories
   */
  static async findRepositories(searchPaths: string[]): Promise<GitRepository[]> {
    const repositories: GitRepository[] = [];

    for (const searchPath of searchPaths) {
      try {
        const repo = await this.detectRepository(searchPath);
        if (repo) {
          repositories.push(repo);
        }
      } catch (error) {
        logger.error('Failed to analyze git repository path', { searchPath, error });
      }
    }

    return repositories;
  }
}
