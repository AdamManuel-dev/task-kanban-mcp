/**
 * @fileoverview Backup monitoring service for operational visibility
 * @lastmodified 2025-07-28T12:15:00Z
 *
 * Features: Backup health monitoring, failure detection, metrics collection, alerting
 * Main APIs: monitorBackup(), getHealthStatus(), collectMetrics(), generateReport()
 * Constraints: Requires filesystem access, metrics storage, alerting system
 * Patterns: Health checking, metrics aggregation, threshold monitoring, alert generation
 */

import fs from 'fs/promises';
import path from 'path';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

export interface BackupMetrics {
  totalBackups: number;
  successfulBackups: number;
  failedBackups: number;
  averageBackupSize: number;
  averageBackupTime: number;
  lastBackupTime: string | null;
  oldestBackup: string | null;
  newestBackup: string | null;
  totalStorageUsed: number;
  compressionRatio: number;
  retentionCompliance: number;
}

export interface BackupHealthStatus {
  overall: 'healthy' | 'warning' | 'critical' | 'unknown';
  lastBackup: {
    status: 'success' | 'failed' | 'missing';
    timestamp: string | null;
    ageHours: number;
  };
  storage: {
    used: number;
    available: number;
    utilizationPercent: number;
    status: 'healthy' | 'warning' | 'critical';
  };
  retention: {
    compliant: boolean;
    expiredBackups: number;
    status: 'healthy' | 'warning' | 'critical';
  };
  issues: string[];
  recommendations: string[];
}

export interface BackupAlert {
  id: string;
  type:
    | 'backup_failed'
    | 'storage_full'
    | 'retention_violation'
    | 'corruption_detected'
    | 'performance_degraded';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  timestamp: string;
  details: Record<string, unknown>;
  resolved: boolean;
  resolvedAt?: string;
}

export interface MonitoringConfig {
  backupPath: string;
  alertThresholds: {
    maxBackupAge: number; // hours
    storageWarningPercent: number;
    storageCriticalPercent: number;
    maxFailureRate: number; // percentage
    maxBackupTime: number; // minutes
  };
  retentionPolicy: {
    dailyRetention: number; // days
    weeklyRetention: number; // weeks
    monthlyRetention: number; // months
  };
  checkInterval: number; // minutes
  enableAlerts: boolean;
  alertWebhook?: string;
}

export class BackupMonitoringService extends EventEmitter {
  private readonly config: MonitoringConfig;

  private readonly alerts: Map<string, BackupAlert> = new Map();

  private monitoringInterval?: NodeJS.Timeout;

  private isMonitoring = false;

  private lastHealthCheck?: BackupHealthStatus;

  constructor(config: Partial<MonitoringConfig> = {}) {
    super();

    this.config = {
      backupPath: config.backupPath ?? './backups',
      alertThresholds: {
        maxBackupAge: 24, // 24 hours
        storageWarningPercent: 80,
        storageCriticalPercent: 95,
        maxFailureRate: 10, // 10%
        maxBackupTime: 60, // 60 minutes
        ...config.alertThresholds,
      },
      retentionPolicy: {
        dailyRetention: 7, // 7 days
        weeklyRetention: 4, // 4 weeks
        monthlyRetention: 12, // 12 months
        ...config.retentionPolicy,
      },
      checkInterval: config.checkInterval ?? 15, // 15 minutes
      enableAlerts: config.enableAlerts ?? true,
      alertWebhook: config.alertWebhook,
    };

    logger.info('BackupMonitoringService initialized', {
      config: this.config,
    });
  }

  /**
   * Start monitoring backups
   */
  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      logger.warn('Backup monitoring already running');
      return;
    }

    try {
      // Perform initial health check
      await this.performHealthCheck();

      // Start periodic monitoring
      this.monitoringInterval = setInterval(
        async () =>
          this.performHealthCheck().catch(error => logger.error('Health check failed', { error })),
        this.config.checkInterval * 60 * 1000
      );

      this.isMonitoring = true;
      logger.info('Backup monitoring started', {
        checkInterval: `${this.config.checkInterval} minutes`,
      });

      this.emit('monitoring_started');
    } catch (error) {
      logger.error('Failed to start backup monitoring', { error });
      throw new Error(`Failed to start backup monitoring: ${(error as Error).message}`);
    }
  }

  /**
   * Stop monitoring backups
   */
  async stopMonitoring(): Promise<void> {
    if (!this.isMonitoring) {
      return;
    }

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }

    this.isMonitoring = false;
    logger.info('Backup monitoring stopped');
    this.emit('monitoring_stopped');
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck(): Promise<BackupHealthStatus> {
    try {
      logger.debug('Performing backup health check');

      const [metrics, storageInfo] = await Promise.all([
        this.collectMetrics(),
        this.getStorageInfo(),
      ]);

      const healthStatus: BackupHealthStatus = {
        overall: 'healthy',
        lastBackup: await this.checkLastBackup(),
        storage: await this.checkStorageHealth(storageInfo),
        retention: await this.checkRetentionCompliance(),
        issues: [],
        recommendations: [],
      };

      // Determine overall health
      const healthLevels = [
        healthStatus.lastBackup.status === 'failed'
          ? 'critical'
          : healthStatus.lastBackup.status === 'missing'
            ? 'warning'
            : 'healthy',
        healthStatus.storage.status,
        healthStatus.retention.status,
      ];

      if (healthLevels.includes('critical')) {
        healthStatus.overall = 'critical';
      } else if (healthLevels.includes('warning')) {
        healthStatus.overall = 'warning';
      }

      // Generate issues and recommendations
      await this.generateHealthInsights(healthStatus, metrics);

      // Check for new alerts
      if (this.config.enableAlerts) {
        await this.checkForAlerts(healthStatus, metrics);
      }

      this.lastHealthCheck = healthStatus;
      this.emit('health_check_completed', healthStatus);

      logger.info('Health check completed', {
        overall: healthStatus.overall,
        issues: healthStatus.issues.length,
        recommendations: healthStatus.recommendations.length,
      });

      return healthStatus;
    } catch (error) {
      logger.error('Health check failed', { error });

      const errorStatus: BackupHealthStatus = {
        overall: 'unknown',
        lastBackup: { status: 'missing', timestamp: null, ageHours: 0 },
        storage: { used: 0, available: 0, utilizationPercent: 0, status: 'critical' },
        retention: { compliant: false, expiredBackups: 0, status: 'critical' },
        issues: [`Health check failed: ${(error as Error).message}`],
        recommendations: ['Investigate monitoring system issues'],
      };

      return errorStatus;
    }
  }

  /**
   * Collect backup metrics
   */
  async collectMetrics(): Promise<BackupMetrics> {
    try {
      const backupFiles = await this.getBackupFiles();

      let totalSize = 0;
      let totalTime = 0;
      let successCount = 0;
      let failCount = 0;
      let oldestTime: Date | null = null;
      let newestTime: Date | null = null;

      for (const file of backupFiles) {
        try {
          const stats = await fs.stat(file.path);
          const metadata = await this.getBackupMetadata(file.path);

          totalSize += stats.size;

          if (metadata) {
            if (metadata.success) {
              successCount++;
              totalTime += metadata.duration ?? 0;
            } else {
              failCount++;
            }

            const backupTime = new Date(metadata.timestamp);
            if (!oldestTime || backupTime < oldestTime) {
              oldestTime = backupTime;
            }
            if (!newestTime || backupTime > newestTime) {
              newestTime = backupTime;
            }
          }
        } catch (error) {
          logger.warn('Failed to process backup file', { file: file.path, error });
          failCount++;
        }
      }

      const totalBackups = backupFiles.length;
      const averageBackupTime = successCount > 0 ? totalTime / successCount : 0;
      const averageBackupSize = totalBackups > 0 ? totalSize / totalBackups : 0;

      return {
        totalBackups,
        successfulBackups: successCount,
        failedBackups: failCount,
        averageBackupSize,
        averageBackupTime,
        lastBackupTime: newestTime?.toISOString() ?? null,
        oldestBackup: oldestTime?.toISOString() ?? null,
        newestBackup: newestTime?.toISOString() ?? null,
        totalStorageUsed: totalSize,
        compressionRatio: await this.calculateCompressionRatio(backupFiles),
        retentionCompliance: await this.calculateRetentionCompliance(backupFiles),
      };
    } catch (error) {
      logger.error('Failed to collect backup metrics', { error });
      throw new Error(`Failed to collect backup metrics: ${(error as Error).message}`);
    }
  }

  /**
   * Get backup files list
   */
  private async getBackupFiles(): Promise<Array<{ path: string; name: string; type: string }>> {
    try {
      const files = await fs.readdir(this.config.backupPath);
      const backupFiles: Array<{ path: string; name: string; type: string }> = [];

      for (const file of files) {
        if (file.endsWith('.db') || file.endsWith('.backup') || file.endsWith('.sql')) {
          const filePath = path.join(this.config.backupPath, file);
          const stats = await fs.stat(filePath);

          if (stats.isFile()) {
            backupFiles.push({
              path: filePath,
              name: file,
              type: path.extname(file).substring(1),
            });
          }
        }
      }

      return backupFiles.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.warn('Backup directory does not exist', { path: this.config.backupPath });
        return [];
      }
      throw error;
    }
  }

  /**
   * Get backup metadata from file or filename
   */
  private async getBackupMetadata(filePath: string): Promise<{
    timestamp: string;
    success: boolean;
    duration?: number;
    size?: number;
  } | null> {
    try {
      // Try to read metadata from accompanying .meta file
      const metaPath = `${filePath}.meta`;
      try {
        const metaContent = await fs.readFile(metaPath, 'utf-8');
        return JSON.parse(metaContent);
      } catch {
        // Fall back to extracting from filename
        const filename = path.basename(filePath);
        const timestampMatch = filename.match(/(\d{4}-\d{2}-\d{2}[-_]\d{2}-\d{2}-\d{2})/);

        if (timestampMatch) {
          const timestamp = timestampMatch[1].replace(/-/g, '-').replace(/_/g, '-');
          return {
            timestamp: new Date(timestamp.replace(/-/g, '/')).toISOString(),
            success: !filename.includes('failed') && !filename.includes('error'),
          };
        }
      }

      // Use file modification time as fallback
      const stats = await fs.stat(filePath);
      return {
        timestamp: stats.mtime.toISOString(),
        success: true, // Assume success if file exists
        size: stats.size,
      };
    } catch (error) {
      logger.warn('Failed to get backup metadata', { filePath, error });
      return null;
    }
  }

  /**
   * Check last backup status
   */
  private async checkLastBackup(): Promise<BackupHealthStatus['lastBackup']> {
    try {
      const backupFiles = await this.getBackupFiles();

      if (backupFiles.length === 0) {
        return {
          status: 'missing',
          timestamp: null,
          ageHours: 0,
        };
      }

      // Find most recent backup
      let mostRecent: { path: string; timestamp: Date } | null = null;

      for (const file of backupFiles) {
        const metadata = await this.getBackupMetadata(file.path);
        if (metadata) {
          const timestamp = new Date(metadata.timestamp);
          if (!mostRecent || timestamp > mostRecent.timestamp) {
            mostRecent = { path: file.path, timestamp };
          }
        }
      }

      if (!mostRecent) {
        return {
          status: 'missing',
          timestamp: null,
          ageHours: 0,
        };
      }

      const ageHours = (Date.now() - mostRecent.timestamp.getTime()) / (1000 * 60 * 60);
      const metadata = await this.getBackupMetadata(mostRecent.path);

      return {
        status: metadata?.success ? 'success' : 'failed',
        timestamp: mostRecent.timestamp.toISOString(),
        ageHours,
      };
    } catch (error) {
      logger.error('Failed to check last backup', { error });
      return {
        status: 'missing',
        timestamp: null,
        ageHours: 0,
      };
    }
  }

  /**
   * Check storage health
   */
  private async checkStorageHealth(storageInfo: {
    used: number;
    available: number;
  }): Promise<BackupHealthStatus['storage']> {
    const total = storageInfo.used + storageInfo.available;
    const utilizationPercent = total > 0 ? (storageInfo.used / total) * 100 : 0;

    let status: 'healthy' | 'warning' | 'critical' = 'healthy';

    if (utilizationPercent >= this.config.alertThresholds.storageCriticalPercent) {
      status = 'critical';
    } else if (utilizationPercent >= this.config.alertThresholds.storageWarningPercent) {
      status = 'warning';
    }

    return {
      used: storageInfo.used,
      available: storageInfo.available,
      utilizationPercent,
      status,
    };
  }

  /**
   * Check retention policy compliance
   */
  private async checkRetentionCompliance(): Promise<BackupHealthStatus['retention']> {
    try {
      const backupFiles = await this.getBackupFiles();
      const now = new Date();
      let expiredCount = 0;

      for (const file of backupFiles) {
        const metadata = await this.getBackupMetadata(file.path);
        if (metadata) {
          const backupDate = new Date(metadata.timestamp);
          const ageInDays = (now.getTime() - backupDate.getTime()) / (1000 * 60 * 60 * 24);

          // Check if backup exceeds retention policy
          if (ageInDays > this.config.retentionPolicy.dailyRetention) {
            expiredCount++;
          }
        }
      }

      const compliant = expiredCount === 0;
      const status = expiredCount > 0 ? 'warning' : 'healthy';

      return {
        compliant,
        expiredBackups: expiredCount,
        status,
      };
    } catch (error) {
      logger.error('Failed to check retention compliance', { error });
      return {
        compliant: false,
        expiredBackups: 0,
        status: 'critical',
      };
    }
  }

  /**
   * Get storage information
   */
  private async getStorageInfo(): Promise<{ used: number; available: number }> {
    try {
      const stats = await fs.stat(this.config.backupPath);
      // This is a simplified implementation - in production, you'd use statvfs or similar
      return {
        used: stats.size,
        available: 1024 * 1024 * 1024 * 10, // 10GB available (mock)
      };
    } catch (error) {
      logger.warn('Failed to get storage info', { error });
      return { used: 0, available: 0 };
    }
  }

  /**
   * Calculate compression ratio
   */
  private async calculateCompressionRatio(backupFiles: Array<{ path: string }>): Promise<number> {
    // This would need to compare original vs compressed sizes
    // For now, return a reasonable default
    return 0.3; // 30% compression
  }

  /**
   * Calculate retention compliance percentage
   */
  private async calculateRetentionCompliance(
    backupFiles: Array<{ path: string }>
  ): Promise<number> {
    if (backupFiles.length === 0) return 100;

    const retentionStatus = await this.checkRetentionCompliance();
    const compliantBackups = backupFiles.length - retentionStatus.expiredBackups;

    return (compliantBackups / backupFiles.length) * 100;
  }

  /**
   * Generate health insights
   */
  private async generateHealthInsights(
    healthStatus: BackupHealthStatus,
    metrics: BackupMetrics
  ): Promise<void> {
    // Check backup age
    if (healthStatus.lastBackup.ageHours > this.config.alertThresholds.maxBackupAge) {
      healthStatus.issues.push(
        `Last backup is ${healthStatus.lastBackup.ageHours.toFixed(1)} hours old (threshold: ${this.config.alertThresholds.maxBackupAge}h)`
      );
      healthStatus.recommendations.push(
        'Schedule more frequent backups or investigate backup failures'
      );
    }

    // Check failure rate
    const failureRate =
      metrics.totalBackups > 0 ? (metrics.failedBackups / metrics.totalBackups) * 100 : 0;

    if (failureRate > this.config.alertThresholds.maxFailureRate) {
      healthStatus.issues.push(
        `Backup failure rate is ${failureRate.toFixed(1)}% (threshold: ${this.config.alertThresholds.maxFailureRate}%)`
      );
      healthStatus.recommendations.push('Investigate backup failures and improve error handling');
    }

    // Check storage usage
    if (healthStatus.storage.status === 'critical') {
      healthStatus.issues.push(
        `Storage usage is ${healthStatus.storage.utilizationPercent.toFixed(1)}% (critical threshold: ${this.config.alertThresholds.storageCriticalPercent}%)`
      );
      healthStatus.recommendations.push('Free up storage space or implement backup rotation');
    }

    // Check retention compliance
    if (!healthStatus.retention.compliant) {
      healthStatus.issues.push(
        `${healthStatus.retention.expiredBackups} backups exceed retention policy`
      );
      healthStatus.recommendations.push('Clean up expired backups to maintain compliance');
    }

    // Performance recommendations
    if (metrics.averageBackupTime > this.config.alertThresholds.maxBackupTime * 60 * 1000) {
      healthStatus.recommendations.push(
        'Consider optimizing backup process for better performance'
      );
    }
  }

  /**
   * Check for new alerts
   */
  private async checkForAlerts(
    healthStatus: BackupHealthStatus,
    metrics: BackupMetrics
  ): Promise<void> {
    // Backup age alert
    if (healthStatus.lastBackup.ageHours > this.config.alertThresholds.maxBackupAge) {
      await this.createAlert(
        'backup_failed',
        'critical',
        `No recent backup found - last backup was ${healthStatus.lastBackup.ageHours.toFixed(1)} hours ago`,
        { ageHours: healthStatus.lastBackup.ageHours }
      );
    }

    // Storage alerts
    if (healthStatus.storage.status === 'critical') {
      await this.createAlert(
        'storage_full',
        'critical',
        `Storage usage critical: ${healthStatus.storage.utilizationPercent.toFixed(1)}%`,
        { utilizationPercent: healthStatus.storage.utilizationPercent }
      );
    }

    // Retention alerts
    if (!healthStatus.retention.compliant) {
      await this.createAlert(
        'retention_violation',
        'warning',
        `${healthStatus.retention.expiredBackups} backups exceed retention policy`,
        { expiredBackups: healthStatus.retention.expiredBackups }
      );
    }
  }

  /**
   * Create new alert
   */
  private async createAlert(
    type: BackupAlert['type'],
    severity: BackupAlert['severity'],
    message: string,
    details: Record<string, unknown>
  ): Promise<void> {
    const alertId = `${type}_${Date.now()}`;

    const alert: BackupAlert = {
      id: alertId,
      type,
      severity,
      message,
      timestamp: new Date().toISOString(),
      details,
      resolved: false,
    };

    this.alerts.set(alertId, alert);
    this.emit('alert_created', alert);

    logger.warn('Backup alert created', {
      id: alertId,
      type,
      severity,
      message,
    });

    // Send webhook notification if configured
    if (this.config.alertWebhook) {
      await this.sendWebhookAlert(alert);
    }
  }

  /**
   * Send webhook alert
   */
  private async sendWebhookAlert(alert: BackupAlert): Promise<void> {
    try {
      const response = await fetch(this.config.alertWebhook!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: `🚨 Backup Alert: ${alert.message}`,
          alert,
          timestamp: alert.timestamp,
        }),
      });

      if (!response.ok) {
        throw new Error(`Webhook request failed: ${response.status}`);
      }

      logger.debug('Webhook alert sent successfully', { alertId: alert.id });
    } catch (error) {
      logger.error('Failed to send webhook alert', { error, alertId: alert.id });
    }
  }

  /**
   * Get current health status
   */
  getHealthStatus(): BackupHealthStatus | null {
    return this.lastHealthCheck ?? null;
  }

  /**
   * Get all active alerts
   */
  getActiveAlerts(): BackupAlert[] {
    return Array.from(this.alerts.values()).filter(alert => !alert.resolved);
  }

  /**
   * Resolve alert
   */
  async resolveAlert(alertId: string): Promise<boolean> {
    const alert = this.alerts.get(alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = new Date().toISOString();

      this.emit('alert_resolved', alert);
      logger.info('Alert resolved', { alertId, type: alert.type });
      return true;
    }
    return false;
  }

  /**
   * Generate monitoring report
   */
  async generateReport(): Promise<{
    summary: BackupHealthStatus;
    metrics: BackupMetrics;
    alerts: BackupAlert[];
    recommendations: string[];
  }> {
    const healthStatus = await this.performHealthCheck();
    const metrics = await this.collectMetrics();
    const alerts = this.getActiveAlerts();

    const recommendations = [
      ...healthStatus.recommendations,
      'Review backup logs regularly for early issue detection',
      'Test backup restoration procedures periodically',
      'Monitor storage trends to predict capacity needs',
      'Update retention policies based on compliance requirements',
    ];

    return {
      summary: healthStatus,
      metrics,
      alerts,
      recommendations,
    };
  }

  /**
   * Get monitoring statistics
   */
  getMonitoringStats(): {
    isMonitoring: boolean;
    totalAlerts: number;
    activeAlerts: number;
    lastHealthCheck: string | null;
    checkInterval: number;
  } {
    return {
      isMonitoring: this.isMonitoring,
      totalAlerts: this.alerts.size,
      activeAlerts: this.getActiveAlerts().length,
      lastHealthCheck: this.lastHealthCheck?.lastBackup.timestamp ?? null,
      checkInterval: this.config.checkInterval,
    };
  }
}

// Export default instance
export const backupMonitoring = new BackupMonitoringService();
