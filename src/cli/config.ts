import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';
import chalk from 'chalk';
import { logger } from '../utils/logger';

interface ConfigData {
  server: {
    url: string;
    port?: number;
  };
  auth: {
    apiKey?: string;
    token?: string;
  };
  defaults: {
    board?: string;
    format: 'table' | 'json' | 'csv';
    verbose: boolean;
  };
  git: {
    enabled: boolean;
    autoTag: boolean;
    branchMapping: boolean;
  };
}

const DEFAULT_CONFIG: ConfigData = {
  server: {
    url: 'http://localhost:3000',
  },
  auth: {
    apiKey: undefined,
    token: undefined,
  },
  defaults: {
    board: undefined,
    format: 'table',
    verbose: false,
  },
  git: {
    enabled: false,
    autoTag: false,
    branchMapping: false,
  },
};

export class ConfigManager {
  private readonly configPath: string;

  private config: ConfigData;

  constructor() {
    this.configPath = join(homedir(), '.mcp-kanban', 'config.json');
    this.config = ConfigManager.load();
  }

  /**
   * Check if config file exists
   */
  exists(): boolean {
    return existsSync(this.configPath);
  }

  /**
   * Load configuration from file or return defaults
   */
  private static load(): ConfigData {
    try {
      const configPath = join(homedir(), '.mcp-kanban', 'config.json');
      if (!existsSync(configPath)) {
        return { ...DEFAULT_CONFIG };
      }

      const configData = readFileSync(configPath, 'utf-8');
      const config = JSON.parse(configData) as ConfigData;

      // Merge with defaults to ensure all required fields exist
      return {
        ...DEFAULT_CONFIG,
        ...config,
      };
    } catch (error) {
      logger.error(chalk.yellow('Warning: Invalid config file, using defaults'));
      return { ...DEFAULT_CONFIG };
    }
  }

  /**
   * Save configuration to file
   */
  save(): void {
    try {
      const configDir = dirname(this.configPath);
      if (!existsSync(configDir)) {
        mkdirSync(configDir, { recursive: true });
      }

      writeFileSync(
        this.configPath,
        JSON.stringify(this.config as unknown as Record<string, unknown>, null, 2)
      );
    } catch (error) {
      throw new Error(
        `Failed to save config: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Get configuration value by path
   */
  get<T = unknown>(path: string): T {
    const parts = path.split('.');
    let current: unknown = this.config;

    for (const part of parts) {
      if (current === null || current === undefined || part === undefined) {
        return undefined as T;
      }
      current = (current as Record<string, unknown>)[part];
    }

    return current as T;
  }

  /**
   * Set configuration value by path
   */
  set(path: string, value: unknown): void {
    const parts = path.split('.');
    let current: Record<string, unknown> = this.config as Record<string, unknown>;

    for (let i = 0; i < parts.length - 1; i += 1) {
      const part = parts[i];
      if (!part) {
        // eslint-disable-next-line no-continue
        continue;
      }
      if (!(part in current) || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }

    const lastPart = parts[parts.length - 1];
    if (lastPart) {
      current[lastPart] = value;
    }
  }

  /**
   * Get all configuration
   */
  getAll(): ConfigData {
    return { ...this.config };
  }

  /**
   * Reset to defaults
   */
  reset(): void {
    this.config = { ...DEFAULT_CONFIG };
  }

  /**
   * Get server URL
   */
  getServerUrl(): string {
    return this.get<string>('server.url');
  }

  /**
   * Get API key
   */
  getApiKey(): string | undefined {
    return this.get<string>('auth.apiKey');
  }

  /**
   * Set API key
   */
  setApiKey(apiKey: string): void {
    this.set('auth.apiKey', apiKey);
    this.save();
  }

  /**
   * Get default board
   */
  getDefaultBoard(): string | undefined {
    return this.get<string>('defaults.board');
  }

  /**
   * Set default board
   */
  setDefaultBoard(boardId: string): void {
    this.set('defaults.board', boardId);
    this.save();
  }

  /**
   * Get git configuration
   */
  getGitConfig(): ConfigData['git'] {
    return this.get<ConfigData['git']>('git');
  }

  /**
   * Validate configuration
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.getServerUrl()) {
      errors.push('Server URL is required');
    }

    try {
      // eslint-disable-next-line no-new
      new URL(this.getServerUrl());
    } catch {
      errors.push('Server URL must be a valid URL');
    }

    const format = this.get<string>('defaults.format');
    if (format && !['table', 'json', 'csv'].includes(format)) {
      errors.push('Format must be one of: table, json, csv');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get config file path
   */
  getConfigPath(): string {
    return this.configPath;
  }
}
