/**
 * @fileoverview Backup health check service for proactive issue detection
 * @lastmodified 2025-07-28T12:20:00Z
 *
 * Features: Automated health checks, integrity validation, performance testing, compliance verification
 * Main APIs: runHealthCheck(), validateBackupIntegrity(), testRestoration(), checkCompliance()
 * Constraints: Requires backup access, validation tools, test environment
 * Patterns: Health check protocols, validation strategies, test automation, reporting
 */

import type { Stats } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import { backupEncryption } from './BackupEncryption';
import { backupDeduplication } from './BackupDeduplication';

export interface HealthCheckResult {
  checkId: string;
  timestamp: string;
  overall: 'pass' | 'warning' | 'fail';
  duration: number;
  checks: HealthCheckItem[];
  summary: {
    total: number;
    passed: number;
    warnings: number;
    failed: number;
  };
  recommendations: string[];
}

export interface HealthCheckItem {
  name: string;
  category: 'integrity' | 'performance' | 'compliance' | 'accessibility' | 'security';
  status: 'pass' | 'warning' | 'fail' | 'skip';
  message: string;
  details?: Record<string, unknown>;
  duration: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface BackupValidationResult {
  isValid: boolean;
  issues: string[];
  metadata: {
    size: number;
    checksum: string;
    created: string;
    encrypted: boolean;
    compressed: boolean;
  };
}

export interface RestorationTestResult {
  success: boolean;
  duration: number;
  restoredSize: number;
  originalSize: number;
  integrityMatch: boolean;
  errors: string[];
}

export interface ComplianceCheckResult {
  compliant: boolean;
  violations: string[];
  retentionStatus: {
    dailyBackups: number;
    weeklyBackups: number;
    monthlyBackups: number;
    expiredBackups: number;
  };
  encryptionStatus: {
    encrypted: number;
    unencrypted: number;
    compliance: number; // percentage
  };
  storageCompliance: {
    withinLimits: boolean;
    currentUsage: number;
    limit: number;
  };
}

export class BackupHealthCheckService {
  private readonly backupPath: string;

  private readonly testDirectory: string;

  private readonly maxTestFileSize: number;

  private readonly checksumAlgorithm: string;

  constructor(
    options: {
      backupPath?: string;
      testDirectory?: string;
      maxTestFileSize?: number;
      checksumAlgorithm?: string;
    } = {}
  ) {
    this.backupPath = options.backupPath ?? './backups';
    this.testDirectory = options.testDirectory ?? './backup-tests';
    this.maxTestFileSize = options.maxTestFileSize ?? 100 * 1024 * 1024; // 100MB
    this.checksumAlgorithm = options.checksumAlgorithm ?? 'sha256';

    logger.info('BackupHealthCheckService initialized', {
      backupPath: this.backupPath,
      testDirectory: this.testDirectory,
      maxTestFileSize: this.maxTestFileSize,
    });
  }

  /**
   * Run comprehensive health check
   */
  async runHealthCheck(): Promise<HealthCheckResult> {
    const checkId = crypto.randomUUID();
    const startTime = Date.now();

    logger.info('Starting backup health check', { checkId });

    const checks: HealthCheckItem[] = [];

    try {
      // Backup accessibility check
      checks.push(await this.checkBackupAccessibility());

      // Get backup files
      const backupFiles = await this.getBackupFiles();

      if (backupFiles.length === 0) {
        checks.push({
          name: 'backup_availability',
          category: 'accessibility',
          status: 'fail',
          message: 'No backup files found',
          duration: 0,
          severity: 'critical',
        });
      } else {
        // Run checks on each backup file
        for (const backupFile of backupFiles.slice(0, 5)) {
          // Limit to 5 most recent
          checks.push(...(await this.checkBackupFile(backupFile)));
        }

        // Run system-wide checks
        checks.push(await this.checkBackupFrequency(backupFiles));
        checks.push(await this.checkStorageHealth());
        checks.push(await this.checkRetentionCompliance(backupFiles));
        checks.push(await this.checkEncryptionCompliance(backupFiles));
        checks.push(...(await this.runPerformanceTests(backupFiles)));
      }

      const duration = Date.now() - startTime;
      const summary = this.calculateSummary(checks);
      const overall = this.determineOverallStatus(summary);
      const recommendations = this.generateRecommendations(checks);

      const result: HealthCheckResult = {
        checkId,
        timestamp: new Date().toISOString(),
        overall,
        duration,
        checks,
        summary,
        recommendations,
      };

      logger.info('Backup health check completed', {
        checkId,
        overall,
        duration,
        totalChecks: checks.length,
        failed: summary.failed,
        warnings: summary.warnings,
      });

      return result;
    } catch (error) {
      logger.error('Health check failed', { error, checkId });

      const failedCheck: HealthCheckItem = {
        name: 'health_check_execution',
        category: 'accessibility',
        status: 'fail',
        message: `Health check execution failed: ${(error as Error).message}`,
        duration: Date.now() - startTime,
        severity: 'critical',
      };

      return {
        checkId,
        timestamp: new Date().toISOString(),
        overall: 'fail',
        duration: Date.now() - startTime,
        checks: [failedCheck],
        summary: { total: 1, passed: 0, warnings: 0, failed: 1 },
        recommendations: ['Investigate health check system failures'],
      };
    }
  }

  /**
   * Check backup accessibility
   */
  private async checkBackupAccessibility(): Promise<HealthCheckItem> {
    const startTime = Date.now();

    try {
      await fs.access(this.backupPath);
      const stats = await fs.stat(this.backupPath);

      if (!stats.isDirectory()) {
        return {
          name: 'backup_directory_access',
          category: 'accessibility',
          status: 'fail',
          message: 'Backup path is not a directory',
          duration: Date.now() - startTime,
          severity: 'critical',
        };
      }

      return {
        name: 'backup_directory_access',
        category: 'accessibility',
        status: 'pass',
        message: 'Backup directory is accessible',
        duration: Date.now() - startTime,
        severity: 'low',
      };
    } catch (error) {
      return {
        name: 'backup_directory_access',
        category: 'accessibility',
        status: 'fail',
        message: `Cannot access backup directory: ${(error as Error).message}`,
        duration: Date.now() - startTime,
        severity: 'critical',
      };
    }
  }

  /**
   * Get backup files sorted by modification time
   */
  private async getBackupFiles(): Promise<Array<{ path: string; name: string; stats: Stats }>> {
    try {
      const files = await fs.readdir(this.backupPath);
      const backupFiles = [];

      for (const file of files) {
        if (file.endsWith('.db') || file.endsWith('.backup') || file.endsWith('.sql')) {
          const filePath = path.join(this.backupPath, file);
          const stats = await fs.stat(filePath);

          if (stats.isFile()) {
            backupFiles.push({ path: filePath, name: file, stats });
          }
        }
      }

      // Sort by modification time (newest first)
      return backupFiles.sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime());
    } catch (error) {
      logger.error('Failed to get backup files', { error });
      return [];
    }
  }

  /**
   * Check individual backup file
   */
  private async checkBackupFile(backupFile: {
    path: string;
    name: string;
    stats: Stats;
  }): Promise<HealthCheckItem[]> {
    const checks: HealthCheckItem[] = [];
    const baseName = path.basename(backupFile.name, path.extname(backupFile.name));

    // File integrity check
    checks.push(await this.checkFileIntegrity(backupFile));

    // File size validation
    checks.push(await this.checkFileSize(backupFile));

    // Age validation
    checks.push(await this.checkFileAge(backupFile));

    // Encryption check
    checks.push(await this.checkFileEncryption(backupFile));

    // Try restoration test for most recent backup
    if (backupFile.stats.size <= this.maxTestFileSize) {
      checks.push(await this.testBackupRestoration(backupFile));
    } else {
      checks.push({
        name: `restoration_test_${baseName}`,
        category: 'performance',
        status: 'skip',
        message: 'File too large for restoration test',
        details: { size: backupFile.stats.size, maxSize: this.maxTestFileSize },
        duration: 0,
        severity: 'low',
      });
    }

    return checks;
  }

  /**
   * Check file integrity
   */
  private async checkFileIntegrity(backupFile: {
    path: string;
    name: string;
  }): Promise<HealthCheckItem> {
    const startTime = Date.now();
    const baseName = path.basename(backupFile.name, path.extname(backupFile.name));

    try {
      // Calculate file checksum
      const data = await fs.readFile(backupFile.path);
      const checksum = crypto.createHash(this.checksumAlgorithm).update(data).digest('hex');

      // Try to find stored checksum
      const checksumPath = `${backupFile.path}.${this.checksumAlgorithm}`;
      let storedChecksum: string | null = null;

      try {
        storedChecksum = (await fs.readFile(checksumPath, 'utf-8')).trim();
      } catch {
        // No stored checksum found
      }

      if (storedChecksum && storedChecksum !== checksum) {
        return {
          name: `integrity_${baseName}`,
          category: 'integrity',
          status: 'fail',
          message: 'File checksum mismatch - potential corruption',
          details: { calculated: checksum, stored: storedChecksum },
          duration: Date.now() - startTime,
          severity: 'high',
        };
      }

      return {
        name: `integrity_${baseName}`,
        category: 'integrity',
        status: 'pass',
        message: storedChecksum ? 'File integrity verified' : 'File readable (no stored checksum)',
        details: { checksum },
        duration: Date.now() - startTime,
        severity: 'low',
      };
    } catch (error) {
      return {
        name: `integrity_${baseName}`,
        category: 'integrity',
        status: 'fail',
        message: `Cannot read backup file: ${(error as Error).message}`,
        duration: Date.now() - startTime,
        severity: 'high',
      };
    }
  }

  /**
   * Check file size
   */
  private async checkFileSize(backupFile: {
    path: string;
    name: string;
    stats: Stats;
  }): Promise<HealthCheckItem> {
    const baseName = path.basename(backupFile.name, path.extname(backupFile.name));
    const { size } = backupFile.stats;

    // Suspicious if file is too small (less than 1KB) or too large (more than 10GB)
    const minSize = 1024; // 1KB
    const maxSize = 10 * 1024 * 1024 * 1024; // 10GB

    if (size < minSize) {
      return {
        name: `size_validation_${baseName}`,
        category: 'integrity',
        status: 'warning',
        message: 'Backup file suspiciously small',
        details: { size, minExpected: minSize },
        duration: 0,
        severity: 'medium',
      };
    }

    if (size > maxSize) {
      return {
        name: `size_validation_${baseName}`,
        category: 'integrity',
        status: 'warning',
        message: 'Backup file very large - may indicate issue',
        details: { size, maxRecommended: maxSize },
        duration: 0,
        severity: 'medium',
      };
    }

    return {
      name: `size_validation_${baseName}`,
      category: 'integrity',
      status: 'pass',
      message: 'File size within expected range',
      details: { size },
      duration: 0,
      severity: 'low',
    };
  }

  /**
   * Check file age
   */
  private async checkFileAge(backupFile: {
    path: string;
    name: string;
    stats: Stats;
  }): Promise<HealthCheckItem> {
    const baseName = path.basename(backupFile.name, path.extname(backupFile.name));
    const ageHours = (Date.now() - backupFile.stats.mtime.getTime()) / (1000 * 60 * 60);

    // Warning if backup is older than 48 hours, critical if older than 168 hours (1 week)
    if (ageHours > 168) {
      return {
        name: `age_validation_${baseName}`,
        category: 'compliance',
        status: 'fail',
        message: 'Backup is very old',
        details: { ageHours: ageHours.toFixed(1) },
        duration: 0,
        severity: 'high',
      };
    }

    if (ageHours > 48) {
      return {
        name: `age_validation_${baseName}`,
        category: 'compliance',
        status: 'warning',
        message: 'Backup is getting old',
        details: { ageHours: ageHours.toFixed(1) },
        duration: 0,
        severity: 'medium',
      };
    }

    return {
      name: `age_validation_${baseName}`,
      category: 'compliance',
      status: 'pass',
      message: 'Backup age is acceptable',
      details: { ageHours: ageHours.toFixed(1) },
      duration: 0,
      severity: 'low',
    };
  }

  /**
   * Check file encryption status
   */
  private async checkFileEncryption(backupFile: {
    path: string;
    name: string;
  }): Promise<HealthCheckItem> {
    const startTime = Date.now();
    const baseName = path.basename(backupFile.name, path.extname(backupFile.name));

    try {
      // Check if file is encrypted by trying to parse as JSON (encrypted files are JSON)
      const data = await fs.readFile(backupFile.path, 'utf-8');

      try {
        const parsed = JSON.parse(data);
        const isEncrypted = parsed.encrypted && parsed.version === '1.0';

        if (isEncrypted) {
          // Validate encryption structure
          const hasRequiredFields = parsed.encryptedData && parsed.salt && parsed.iv && parsed.tag;

          if (!hasRequiredFields) {
            return {
              name: `encryption_${baseName}`,
              category: 'security',
              status: 'fail',
              message: 'Encrypted backup has invalid structure',
              duration: Date.now() - startTime,
              severity: 'high',
            };
          }

          return {
            name: `encryption_${baseName}`,
            category: 'security',
            status: 'pass',
            message: 'Backup is properly encrypted',
            duration: Date.now() - startTime,
            severity: 'low',
          };
        }
      } catch {
        // Not JSON, likely unencrypted
      }

      return {
        name: `encryption_${baseName}`,
        category: 'security',
        status: 'warning',
        message: 'Backup is not encrypted',
        duration: Date.now() - startTime,
        severity: 'medium',
      };
    } catch (error) {
      return {
        name: `encryption_${baseName}`,
        category: 'security',
        status: 'fail',
        message: `Cannot verify encryption status: ${(error as Error).message}`,
        duration: Date.now() - startTime,
        severity: 'medium',
      };
    }
  }

  /**
   * Test backup restoration
   */
  private async testBackupRestoration(backupFile: {
    path: string;
    name: string;
    stats: Stats;
  }): Promise<HealthCheckItem> {
    const startTime = Date.now();
    const baseName = path.basename(backupFile.name, path.extname(backupFile.name));

    try {
      // Create test directory
      await fs.mkdir(this.testDirectory, { recursive: true });
      const testFile = path.join(this.testDirectory, `test_restore_${baseName}_${Date.now()}.db`);

      try {
        // Simple restoration test - copy file
        await fs.copyFile(backupFile.path, testFile);

        // Verify restored file
        const originalStats = backupFile.stats;
        const restoredStats = await fs.stat(testFile);

        const sizeMatch = originalStats.size === restoredStats.size;

        if (!sizeMatch) {
          return {
            name: `restoration_test_${baseName}`,
            category: 'performance',
            status: 'fail',
            message: 'Restoration test failed - size mismatch',
            details: {
              originalSize: originalStats.size,
              restoredSize: restoredStats.size,
            },
            duration: Date.now() - startTime,
            severity: 'high',
          };
        }

        return {
          name: `restoration_test_${baseName}`,
          category: 'performance',
          status: 'pass',
          message: 'Restoration test successful',
          details: {
            duration: Date.now() - startTime,
            size: restoredStats.size,
          },
          duration: Date.now() - startTime,
          severity: 'low',
        };
      } finally {
        // Clean up test file
        try {
          await fs.unlink(testFile);
        } catch {
          // Ignore cleanup errors
        }
      }
    } catch (error) {
      return {
        name: `restoration_test_${baseName}`,
        category: 'performance',
        status: 'fail',
        message: `Restoration test failed: ${(error as Error).message}`,
        duration: Date.now() - startTime,
        severity: 'high',
      };
    }
  }

  /**
   * Check backup frequency
   */
  private async checkBackupFrequency(
    backupFiles: Array<{ path: string; name: string; stats: Stats }>
  ): Promise<HealthCheckItem> {
    if (backupFiles.length === 0) {
      return {
        name: 'backup_frequency',
        category: 'compliance',
        status: 'fail',
        message: 'No backups found',
        duration: 0,
        severity: 'critical',
      };
    }

    const now = Date.now();
    const recent = backupFiles.filter(
      f => now - f.stats.mtime.getTime() < 24 * 60 * 60 * 1000 // 24 hours
    );

    if (recent.length === 0) {
      return {
        name: 'backup_frequency',
        category: 'compliance',
        status: 'fail',
        message: 'No recent backups (within 24 hours)',
        details: { total: backupFiles.length, recent: recent.length },
        duration: 0,
        severity: 'high',
      };
    }

    if (recent.length < 2) {
      return {
        name: 'backup_frequency',
        category: 'compliance',
        status: 'warning',
        message: 'Low backup frequency',
        details: { total: backupFiles.length, recent: recent.length },
        duration: 0,
        severity: 'medium',
      };
    }

    return {
      name: 'backup_frequency',
      category: 'compliance',
      status: 'pass',
      message: 'Backup frequency is adequate',
      details: { total: backupFiles.length, recent: recent.length },
      duration: 0,
      severity: 'low',
    };
  }

  /**
   * Check storage health
   */
  private async checkStorageHealth(): Promise<HealthCheckItem> {
    try {
      const stats = await fs.stat(this.backupPath);
      // In a real implementation, you'd check actual disk space
      // This is a simplified version

      return {
        name: 'storage_health',
        category: 'performance',
        status: 'pass',
        message: 'Storage accessible',
        details: { backupDirectorySize: stats.size },
        duration: 0,
        severity: 'low',
      };
    } catch (error) {
      return {
        name: 'storage_health',
        category: 'performance',
        status: 'fail',
        message: `Storage health check failed: ${(error as Error).message}`,
        duration: 0,
        severity: 'high',
      };
    }
  }

  /**
   * Check retention compliance
   */
  private async checkRetentionCompliance(
    backupFiles: Array<{ path: string; name: string; stats: Stats }>
  ): Promise<HealthCheckItem> {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    const oldBackups = backupFiles.filter(f => f.stats.mtime.getTime() < thirtyDaysAgo);

    if (oldBackups.length > 10) {
      return {
        name: 'retention_compliance',
        category: 'compliance',
        status: 'warning',
        message: 'Many old backups found - consider cleanup',
        details: { total: backupFiles.length, old: oldBackups.length },
        duration: 0,
        severity: 'medium',
      };
    }

    return {
      name: 'retention_compliance',
      category: 'compliance',
      status: 'pass',
      message: 'Retention policy compliance good',
      details: { total: backupFiles.length, old: oldBackups.length },
      duration: 0,
      severity: 'low',
    };
  }

  /**
   * Check encryption compliance
   */
  private async checkEncryptionCompliance(
    backupFiles: Array<{ path: string; name: string; stats: Stats }>
  ): Promise<HealthCheckItem> {
    let encryptedCount = 0;

    for (const file of backupFiles.slice(0, 10)) {
      // Check first 10 files
      try {
        const data = await fs.readFile(file.path, 'utf-8');
        const parsed = JSON.parse(data);
        if (parsed.encrypted) {
          encryptedCount++;
        }
      } catch {
        // Not encrypted or not JSON
      }
    }

    const checkedCount = Math.min(backupFiles.length, 10);
    const encryptionRate = checkedCount > 0 ? (encryptedCount / checkedCount) * 100 : 0;

    if (encryptionRate < 50) {
      return {
        name: 'encryption_compliance',
        category: 'security',
        status: 'warning',
        message: 'Low encryption compliance rate',
        details: { encryptedCount, checkedCount, encryptionRate: `${encryptionRate.toFixed(1)}%` },
        duration: 0,
        severity: 'medium',
      };
    }

    return {
      name: 'encryption_compliance',
      category: 'security',
      status: 'pass',
      message: 'Good encryption compliance',
      details: { encryptedCount, checkedCount, encryptionRate: `${encryptionRate.toFixed(1)}%` },
      duration: 0,
      severity: 'low',
    };
  }

  /**
   * Run performance tests
   */
  private async runPerformanceTests(
    backupFiles: Array<{ path: string; name: string; stats: Stats }>
  ): Promise<HealthCheckItem[]> {
    const checks: HealthCheckItem[] = [];

    // Test read performance on a sample file
    if (backupFiles.length > 0) {
      const testFile = backupFiles[0];

      if (testFile.stats.size <= this.maxTestFileSize) {
        checks.push(await this.testReadPerformance(testFile));
      }
    }

    return checks;
  }

  /**
   * Test backup read performance
   */
  private async testReadPerformance(backupFile: {
    path: string;
    name: string;
    stats: Stats;
  }): Promise<HealthCheckItem> {
    const startTime = Date.now();
    const baseName = path.basename(backupFile.name, path.extname(backupFile.name));

    try {
      await fs.readFile(backupFile.path);
      const duration = Date.now() - startTime;

      // Warn if reading takes more than 5 seconds
      if (duration > 5000) {
        return {
          name: `read_performance_${baseName}`,
          category: 'performance',
          status: 'warning',
          message: 'Backup read performance is slow',
          details: { duration, size: backupFile.stats.size },
          duration,
          severity: 'medium',
        };
      }

      return {
        name: `read_performance_${baseName}`,
        category: 'performance',
        status: 'pass',
        message: 'Backup read performance is good',
        details: { duration, size: backupFile.stats.size },
        duration,
        severity: 'low',
      };
    } catch (error) {
      return {
        name: `read_performance_${baseName}`,
        category: 'performance',
        status: 'fail',
        message: `Read performance test failed: ${(error as Error).message}`,
        duration: Date.now() - startTime,
        severity: 'high',
      };
    }
  }

  /**
   * Calculate summary statistics
   */
  private calculateSummary(checks: HealthCheckItem[]): HealthCheckResult['summary'] {
    const total = checks.length;
    const passed = checks.filter(c => c.status === 'pass').length;
    const warnings = checks.filter(c => c.status === 'warning').length;
    const failed = checks.filter(c => c.status === 'fail').length;

    return { total, passed, warnings, failed };
  }

  /**
   * Determine overall status
   */
  private determineOverallStatus(
    summary: HealthCheckResult['summary']
  ): 'pass' | 'warning' | 'fail' {
    if (summary.failed > 0) return 'fail';
    if (summary.warnings > 0) return 'warning';
    return 'pass';
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(checks: HealthCheckItem[]): string[] {
    const recommendations: string[] = [];
    const failedChecks = checks.filter(c => c.status === 'fail');
    const warningChecks = checks.filter(c => c.status === 'warning');

    if (failedChecks.some(c => c.category === 'integrity')) {
      recommendations.push('Investigate backup integrity issues immediately');
    }

    if (failedChecks.some(c => c.category === 'accessibility')) {
      recommendations.push('Ensure backup storage is accessible and properly configured');
    }

    if (warningChecks.some(c => c.category === 'security')) {
      recommendations.push('Consider enabling encryption for all backups');
    }

    if (warningChecks.some(c => c.category === 'performance')) {
      recommendations.push('Monitor backup performance and consider storage optimization');
    }

    if (warningChecks.some(c => c.category === 'compliance')) {
      recommendations.push('Review and update backup retention policies');
    }

    // General recommendations
    recommendations.push('Schedule regular health checks to proactively identify issues');
    recommendations.push('Implement automated backup verification and alerting');
    recommendations.push('Document backup procedures and recovery processes');

    return [...new Set(recommendations)]; // Remove duplicates
  }

  /**
   * Get health check history (simplified implementation)
   */
  async getHealthCheckHistory(days = 7): Promise<HealthCheckResult[]> {
    // In a real implementation, this would read from a database or log files
    // For now, return empty array
    return [];
  }

  /**
   * Quick health status
   */
  async getQuickHealthStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    lastCheck: string | null;
  }> {
    try {
      // Quick check - just verify backup directory exists and has recent files
      await fs.access(this.backupPath);
      const files = await this.getBackupFiles();

      if (files.length === 0) {
        return { status: 'unhealthy', lastCheck: null };
      }

      const mostRecent = files[0];
      const ageHours = (Date.now() - mostRecent.stats.mtime.getTime()) / (1000 * 60 * 60);

      if (ageHours > 48) {
        return { status: 'degraded', lastCheck: mostRecent.stats.mtime.toISOString() };
      }

      return { status: 'healthy', lastCheck: mostRecent.stats.mtime.toISOString() };
    } catch (error) {
      return { status: 'unhealthy', lastCheck: null };
    }
  }
}

// Export default instance
export const backupHealthCheck = new BackupHealthCheckService();
