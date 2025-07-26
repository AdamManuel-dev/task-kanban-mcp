import { Database } from 'sqlite';
import { Database as SQLiteDB } from 'sqlite3';

export interface Seed {
  name: string;
  description: string;
  run: (db: Database<SQLiteDB>) => Promise<void>;
}

export interface SeedOptions {
  force?: boolean;
  seedsPath?: string;
  seedsTable?: string;
}

export interface AppliedSeed {
  name: string;
  applied_at: string;
  checksum: string;
}