import type { Database } from 'sqlite3';

export interface Migration {
  id: string;
  timestamp: number;
  description: string;
  up: (db: Database) => Promise<void>;
  down: (db: Database) => Promise<void>;
}

export interface MigrationFile {
  id: string;
  timestamp: number;
  description: string;
  checksum: string;
  up: string;
  down: string;
}

export interface AppliedMigration {
  id: string;
  applied_at: string;
  checksum: string;
}

export interface MigrationOptions {
  migrationsPath?: string;
  tableName?: string;
  validateChecksums?: boolean;
}
