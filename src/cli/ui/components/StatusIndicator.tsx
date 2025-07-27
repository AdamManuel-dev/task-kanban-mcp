interface StatusIndicatorProps {
  status: 'loading' | 'success' | 'error' | 'info';
  message: string;
  details?: string[];
  showSpinner?: boolean;
}

interface ProgressStep {
  id: string;
  title: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  details?: string;
}

interface ProgressIndicatorProps {
  steps: ProgressStep[];
  currentStep?: string;
}

interface ConnectionStatusProps {
  isConnected: boolean;
  serverUrl?: string;
  lastSync?: Date;
  error?: string;
}

/**
 * Simple text-based status formatter for CLI display
 */
export class StatusIndicatorFormatter {
  /**
   * Renders a simple status message
   */
  static renderStatus(props: StatusIndicatorProps): string {
    const output: string[] = [];

    // Status icon
    const icon = this.getStatusIcon(props.status);
    output.push(`${icon} ${props.message}`);

    // Details if provided
    if (props.details && props.details.length > 0) {
      output.push('');
      props.details.forEach(detail => {
        output.push(`  • ${detail}`);
      });
    }

    return output.join('\n');
  }

  /**
   * Renders progress indicator for multiple steps
   */
  static renderProgress(props: ProgressIndicatorProps): string {
    const output: string[] = [];

    output.push('Progress:');
    output.push('');

    props.steps.forEach((step, index) => {
      const icon = this.getProgressIcon(step.status);
      const isCurrent = step.id === props.currentStep;
      const prefix = isCurrent ? '→' : ' ';

      output.push(`${prefix} ${icon} ${step.title}${isCurrent ? ' (current)' : ''}`);

      if (step.details) {
        output.push(`    ${step.details}`);
      }
    });

    return output.join('\n');
  }

  /**
   * Renders connection status information
   */
  static renderConnectionStatus(props: ConnectionStatusProps): string {
    const output: string[] = [];

    const statusIcon = props.isConnected ? '🟢' : '🔴';
    const statusText = props.isConnected ? 'Connected' : 'Disconnected';

    output.push(`${statusIcon} ${statusText}`);

    if (props.serverUrl) {
      output.push(`  Server: ${props.serverUrl}`);
    }

    if (props.lastSync) {
      const lastSyncText = this.formatLastSync(props.lastSync);
      output.push(`  Last sync: ${lastSyncText}`);
    }

    if (props.error) {
      output.push(`  Error: ${props.error}`);
    }

    return output.join('\n');
  }

  private static getStatusIcon(status: StatusIndicatorProps['status']): string {
    const iconMap = {
      loading: '⏳',
      success: '✅',
      error: '❌',
      info: 'ℹ️',
    };
    return iconMap[status];
  }

  private static getProgressIcon(status: ProgressStep['status']): string {
    const iconMap = {
      pending: '⭕',
      running: '🔄',
      completed: '✅',
      failed: '❌',
    };
    return iconMap[status];
  }

  private static formatLastSync(lastSync: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - lastSync.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffMinutes < 1) return 'just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }
}

/**
 * Factory functions for creating status indicators
 */
export const createStatusIndicator = (props: StatusIndicatorProps): string =>
  StatusIndicatorFormatter.renderStatus(props);

export const createProgressIndicator = (props: ProgressIndicatorProps): string =>
  StatusIndicatorFormatter.renderProgress(props);

export const createConnectionStatus = (props: ConnectionStatusProps): string =>
  StatusIndicatorFormatter.renderConnectionStatus(props);

export default StatusIndicatorFormatter;
