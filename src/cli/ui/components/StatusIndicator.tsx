import React from 'react';
import { Box, Text } from 'ink';
import chalk from 'chalk';

export interface StatusIndicatorProps {
  status: 'loading' | 'success' | 'error' | 'warning' | 'info';
  message: string;
  details?: string[];
  showSpinner?: boolean;
  progress?: {
    current: number;
    total: number;
    percentage?: number;
  };
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  status,
  message,
  details = [],
  showSpinner = false,
  progress,
}) => {
  const getStatusIcon = (): string => {
    switch (status) {
      case 'loading':
        return showSpinner ? '⠋' : '⏳';
      case 'success':
        return '✅';
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      case 'info':
        return 'ℹ️';
      default:
        return '○';
    }
  };

  const getStatusColor = (text: string): string => {
    switch (status) {
      case 'loading':
        return chalk.cyan(text);
      case 'success':
        return chalk.green(text);
      case 'error':
        return chalk.red(text);
      case 'warning':
        return chalk.yellow(text);
      case 'info':
        return chalk.blue(text);
      default:
        return text;
    }
  };

  const renderProgressBar = (): React.ReactNode => {
    if (!progress) return null;

    const { current, total, percentage } = progress;
    const width = 30;
    const percent = percentage ?? (total > 0 ? (current / total) * 100 : 0);
    const filled = Math.round((percent / 100) * width);
    const empty = width - filled;

    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    const percentText = `${Math.round(percent)}%`;

    return (
      <Box marginTop={1}>
        <Text color="gray">
          Progress: [{bar}] {percentText} ({current}/{total})
        </Text>
      </Box>
    );
  };

  const renderDetails = (): React.ReactNode => {
    if (details.length === 0) return null;

    return (
      <Box flexDirection="column" marginTop={1}>
        {details.map((detail, index) => (
          <Box key={index} marginLeft={2}>
            <Text color="gray">• {detail}</Text>
          </Box>
        ))}
      </Box>
    );
  };

  return (
    <Box flexDirection="column">
      {/* Main status line */}
      <Box>
        <Text>
          {getStatusIcon()} {getStatusColor(message)}
        </Text>
      </Box>

      {/* Progress bar */}
      {renderProgressBar()}

      {/* Details */}
      {renderDetails()}
    </Box>
  );
};

// Animated spinner component
export interface SpinnerProps {
  message?: string;
  frames?: string[];
  interval?: number;
}

export const Spinner: React.FC<SpinnerProps> = ({
  message = 'Loading...',
  frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  interval = 80,
}) => {
  const [frameIndex, setFrameIndex] = React.useState(0);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setFrameIndex(prev => (prev + 1) % frames.length);
    }, interval);

    return () => clearInterval(timer);
  }, [frames.length, interval]);

  return (
    <Box>
      <Text color="cyan">
        {frames[frameIndex]} {message}
      </Text>
    </Box>
  );
};

// Multi-step progress indicator
export interface MultiStepProgressProps {
  steps: Array<{
    name: string;
    status: 'pending' | 'active' | 'completed' | 'error';
    details?: string;
  }>;
  currentStep?: number;
}

export const MultiStepProgress: React.FC<MultiStepProgressProps> = ({ steps, currentStep }) => {
  const getStepIcon = (status: string): string => {
    switch (status) {
      case 'completed':
        return chalk.green('✓');
      case 'active':
        return chalk.cyan('○');
      case 'error':
        return chalk.red('✗');
      default:
        return chalk.gray('○');
    }
  };

  const getStepColor = (status: string, text: string): string => {
    switch (status) {
      case 'completed':
        return chalk.green(text);
      case 'active':
        return chalk.cyan(text);
      case 'error':
        return chalk.red(text);
      default:
        return chalk.gray(text);
    }
  };

  return (
    <Box flexDirection="column">
      {steps.map((step, index) => (
        <Box key={index} flexDirection="column">
          <Box>
            <Text>
              {getStepIcon(step.status)} {getStepColor(step.status, step.name)}
              {currentStep !== undefined && index === currentStep && step.status === 'active' && (
                <Text color="gray"> (current)</Text>
              )}
            </Text>
          </Box>
          {step.details && step.status === 'active' && (
            <Box marginLeft={4}>
              <Text color="gray">{step.details}</Text>
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
};

// Connection status indicator
export interface ConnectionStatusProps {
  isConnected: boolean;
  serverUrl?: string;
  lastSync?: Date;
  retryCount?: number;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  isConnected,
  serverUrl,
  lastSync,
  retryCount = 0,
}) => {
  const getConnectionIcon = (): string => {
    if (isConnected) return chalk.green('🟢');
    if (retryCount > 0) return chalk.yellow('🟡');
    return chalk.red('🔴');
  };

  const getConnectionText = (): string => {
    if (isConnected) return chalk.green('Connected');
    if (retryCount > 0) return chalk.yellow(`Reconnecting... (attempt ${retryCount})`);
    return chalk.red('Disconnected');
  };

  const formatLastSync = (): string => {
    if (!lastSync) return 'Never';

    const now = new Date();
    const diffMs = now.getTime() - lastSync.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes === 1) return '1 minute ago';
    return `${diffMinutes} minutes ago`;
  };

  return (
    <Box flexDirection="column">
      <Box>
        <Text>
          {getConnectionIcon()} {getConnectionText()}
        </Text>
      </Box>

      {serverUrl && (
        <Box marginLeft={2}>
          <Text color="gray">Server: {serverUrl}</Text>
        </Box>
      )}

      {isConnected && lastSync && (
        <Box marginLeft={2}>
          <Text color="gray">Last sync: {formatLastSync()}</Text>
        </Box>
      )}
    </Box>
  );
};

export default StatusIndicator;
