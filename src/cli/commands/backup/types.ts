/**
 * @fileoverview Shared types for backup commands
 * @lastmodified 2025-07-28T16:30:00Z
 *
 * Features: Common type definitions for backup operations
 * Main APIs: Backup command option interfaces
 * Constraints: Consistent typing across backup modules
 * Patterns: Centralized type definitions
 */

export interface CreateBackupOptions {
  compress?: boolean;
  verify?: boolean;
  encrypt?: boolean;
  encryptionKey?: string;
  description?: string;
}

export interface ListBackupOptions {
  limit?: string;
  sort?: string;
  order?: string;
}

export interface DeleteBackupOptions {
  force?: boolean;
}

export interface ExportBackupOptions {
  format?: string;
}

export interface RestoreBackupOptions {
  noVerify?: boolean;
  preserveExisting?: boolean;
  confirmed?: boolean;
  targetTime?: string;
  force?: boolean;
  decryptionKey?: string;
}

export interface CreateScheduleOptions {
  cron?: string;
  type?: string;
  description?: string;
  retention?: string;
  'no-compression'?: boolean;
  'no-verification'?: boolean;
  disabled?: boolean;
  enabled?: boolean;
  compress?: boolean;
  encrypt?: boolean;
}

export interface ListScheduleOptions {
  enabled?: boolean;
  disabled?: boolean;
  limit?: string;
}

// Inquirer prompt result types
export interface ConfirmPromptResult {
  confirm: boolean;
}

export interface RestoreTimePromptResult {
  targetTime: string;
  verify: boolean;
  preserveExisting: boolean;
  confirmed: boolean;
}

export interface CreateSchedulePromptResult {
  name: string;
  cronExpression: string;
  backupType: 'full' | 'incremental';
  description: string;
  retentionDays: number;
  compressionEnabled: boolean;
  verificationEnabled: boolean;
  enabled: boolean;
}

// Type guard for API responses
export function hasDataProperty<T>(response: unknown): response is { data: T } {
  return (
    response !== null &&
    response !== undefined &&
    typeof response === 'object' &&
    'data' in response &&
    !('error' in response)
  );
}
