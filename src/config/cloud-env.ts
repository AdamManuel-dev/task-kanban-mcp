/**
 * Cloud Development Environment Support
 * Provides automatic detection and configuration for cloud development platforms
 *
 * @module config/cloud-env
 * @description Detects cloud development environments (Replit, GitHub Codespaces,
 * GitPod, etc.) and automatically configures the application for optimal performance
 * in those environments.
 */

import { logger } from '../utils/logger';

export interface CloudEnvironmentInfo {
  platform: 'replit' | 'codespaces' | 'gitpod' | 'stackblitz' | 'codesandbox' | 'local';
  isCloud: boolean;
  defaultHost: string;
  defaultPort: number;
  websocketPort: number;
  features: {
    fileWatching: boolean;
    processRestart: boolean;
    portForwarding: boolean;
    terminalAccess: boolean;
    gitIntegration: boolean;
    environmentSecrets: boolean;
  };
  limits: {
    memory: number; // MB
    cpu: number; // cores
    storage: number; // MB
    networkBandwidth: number; // Mbps
  };
  urls: {
    preview?: string;
    webapp?: string;
    websocket?: string;
  };
}

/**
 * Detects the current cloud development environment
 */
export function detectCloudEnvironment(): CloudEnvironmentInfo {
  const { env } = process;

  // Replit detection
  if (env.REPLIT_DB_URL || env.REPL_SLUG) {
    return {
      platform: 'replit',
      isCloud: true,
      defaultHost: '0.0.0.0',
      defaultPort: 3000,
      websocketPort: 3456,
      features: {
        fileWatching: true,
        processRestart: true,
        portForwarding: true,
        terminalAccess: true,
        gitIntegration: true,
        environmentSecrets: true,
      },
      limits: {
        memory: 1024, // 1GB
        cpu: 1,
        storage: 2048, // 2GB
        networkBandwidth: 100,
      },
      urls: {
        preview:
          env.REPL_SLUG && env.REPL_OWNER
            ? `https://${env.REPL_SLUG}.${env.REPL_OWNER}.repl.co`
            : undefined,
        webapp:
          env.REPL_SLUG && env.REPL_OWNER
            ? `https://${env.REPL_SLUG}.${env.REPL_OWNER}.repl.co`
            : undefined,
        websocket:
          env.REPL_SLUG && env.REPL_OWNER
            ? `wss://${env.REPL_SLUG}.${env.REPL_OWNER}.repl.co:3456`
            : undefined,
      },
    };
  }

  // GitHub Codespaces detection
  if (env.CODESPACES || env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN) {
    const codespaceName = env.CODESPACE_NAME;
    const domain = env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;

    return {
      platform: 'codespaces',
      isCloud: true,
      defaultHost: '0.0.0.0',
      defaultPort: 3000,
      websocketPort: 3456,
      features: {
        fileWatching: true,
        processRestart: true,
        portForwarding: true,
        terminalAccess: true,
        gitIntegration: true,
        environmentSecrets: true,
      },
      limits: {
        memory: 8192, // 8GB (varies by plan)
        cpu: 4,
        storage: 32768, // 32GB
        networkBandwidth: 1000,
      },
      urls: {
        preview: codespaceName && domain ? `https://${codespaceName}-3000.${domain}` : undefined,
        webapp: codespaceName && domain ? `https://${codespaceName}-3000.${domain}` : undefined,
        websocket: codespaceName && domain ? `wss://${codespaceName}-3456.${domain}` : undefined,
      },
    };
  }

  // GitPod detection
  if (env.GITPOD_WORKSPACE_ID || env.GITPOD_WORKSPACE_URL) {
    const workspaceUrl = env.GITPOD_WORKSPACE_URL;

    return {
      platform: 'gitpod',
      isCloud: true,
      defaultHost: '0.0.0.0',
      defaultPort: 3000,
      websocketPort: 3456,
      features: {
        fileWatching: true,
        processRestart: true,
        portForwarding: true,
        terminalAccess: true,
        gitIntegration: true,
        environmentSecrets: true,
      },
      limits: {
        memory: 3584, // 3.5GB (standard)
        cpu: 4,
        storage: 30720, // 30GB
        networkBandwidth: 1000,
      },
      urls: {
        preview: workspaceUrl ? workspaceUrl.replace('https://', 'https://3000-') : undefined,
        webapp: workspaceUrl ? workspaceUrl.replace('https://', 'https://3000-') : undefined,
        websocket: workspaceUrl ? workspaceUrl.replace('https://', 'wss://3456-') : undefined,
      },
    };
  }

  // StackBlitz detection
  if (env.STACKBLITZ) {
    return {
      platform: 'stackblitz',
      isCloud: true,
      defaultHost: '0.0.0.0',
      defaultPort: 3000,
      websocketPort: 3456,
      features: {
        fileWatching: true,
        processRestart: false, // Limited in StackBlitz
        portForwarding: true,
        terminalAccess: true,
        gitIntegration: false, // Limited
        environmentSecrets: false,
      },
      limits: {
        memory: 512, // Limited
        cpu: 1,
        storage: 1024, // 1GB
        networkBandwidth: 100,
      },
      urls: {
        // StackBlitz URLs are dynamic
        preview: undefined,
        webapp: undefined,
        websocket: undefined,
      },
    };
  }

  // CodeSandbox detection
  if (env.CODESANDBOX_SSE) {
    return {
      platform: 'codesandbox',
      isCloud: true,
      defaultHost: '0.0.0.0',
      defaultPort: 3000,
      websocketPort: 3456,
      features: {
        fileWatching: true,
        processRestart: false,
        portForwarding: true,
        terminalAccess: true,
        gitIntegration: false,
        environmentSecrets: false,
      },
      limits: {
        memory: 1024, // 1GB
        cpu: 1,
        storage: 2048, // 2GB
        networkBandwidth: 100,
      },
      urls: {
        // CodeSandbox URLs are dynamic
        preview: undefined,
        webapp: undefined,
        websocket: undefined,
      },
    };
  }

  // Local development environment
  return {
    platform: 'local',
    isCloud: false,
    defaultHost: 'localhost',
    defaultPort: 3000,
    websocketPort: 3001, // Different port for local to avoid conflicts
    features: {
      fileWatching: true,
      processRestart: true,
      portForwarding: false,
      terminalAccess: true,
      gitIntegration: true,
      environmentSecrets: false, // Use .env files
    },
    limits: {
      memory: Infinity, // No artificial limits
      cpu: Infinity,
      storage: Infinity,
      networkBandwidth: Infinity,
    },
    urls: {
      preview: 'http://localhost:3000',
      webapp: 'http://localhost:3000',
      websocket: 'ws://localhost:3001',
    },
  };
}

/**
 * Gets cloud environment-specific configuration overrides
 */
export function getCloudEnvironmentConfig(cloudEnv: CloudEnvironmentInfo): Record<string, any> {
  const config: Record<string, any> = {
    server: {
      host: cloudEnv.defaultHost,
      port: cloudEnv.defaultPort,
    },
    websocket: {
      host: cloudEnv.defaultHost,
      port: cloudEnv.websocketPort,
      corsOrigin: '*', // Cloud environments need permissive CORS
    },
    api: {
      corsOrigin: '*',
      corsCredentials: false, // Safer for cloud environments
    },
  };

  // Platform-specific optimizations
  switch (cloudEnv.platform) {
    case 'replit':
      config.database = {
        path: './data/kanban.db',
        walMode: true,
        memoryLimit: 128 * 1024 * 1024, // 128MB for Replit
      };
      config.performance = {
        maxMemoryUsage: 512, // MB
        memoryCheckInterval: 30000, // Check more frequently
      };
      config.logging = {
        level: 'info',
        console: true,
        file: false, // Don't write log files in Replit
      };
      break;

    case 'codespaces':
      config.performance = {
        maxMemoryUsage: 4096, // 4GB
        memoryCheckInterval: 60000,
      };
      config.git = {
        autoDetect: true, // GitHub integration is excellent
      };
      break;

    case 'gitpod':
      config.performance = {
        maxMemoryUsage: 2048, // 2GB
        memoryCheckInterval: 45000,
      };
      config.git = {
        autoDetect: true,
      };
      break;

    case 'stackblitz':
      config.database = {
        path: './data/kanban.db',
        walMode: false, // Simpler for StackBlitz
        memoryLimit: 64 * 1024 * 1024, // 64MB
      };
      config.performance = {
        maxMemoryUsage: 256, // Very limited
        memoryCheckInterval: 15000,
      };
      config.websocket = {
        ...config.websocket,
        enabled: false, // WebSockets may not work reliably
      };
      config.backup = {
        enabled: false, // Limited file system
      };
      break;

    case 'codesandbox':
      config.performance = {
        maxMemoryUsage: 512,
        memoryCheckInterval: 30000,
      };
      config.websocket = {
        ...config.websocket,
        maxConnections: 50, // Lower limit
      };
      break;

    case 'local':
      // Use all defaults for local development
      break;
  }

  return config;
}

/**
 * Sets up cloud environment-specific optimizations
 */
export function configureCloudEnvironment(): CloudEnvironmentInfo {
  const cloudEnv = detectCloudEnvironment();

  logger.info(`Detected environment: ${cloudEnv.platform}`, {
    platform: cloudEnv.platform,
    isCloud: cloudEnv.isCloud,
    features: cloudEnv.features,
    urls: cloudEnv.urls,
  });

  // Set environment-specific process settings
  if (cloudEnv.isCloud) {
    // Optimize for cloud environments
    process.env.UV_THREADPOOL_SIZE = '32'; // Smaller thread pool
    process.env.NODE_OPTIONS = `--max-old-space-size=${cloudEnv.limits.memory}`;

    // Set platform-specific environment variables
    if (cloudEnv.platform === 'replit') {
      process.env.REPLIT_ENVIRONMENT = 'true';
    }

    // Configure CORS for cloud environments
    if (cloudEnv.urls.webapp) {
      process.env.CORS_ORIGIN = cloudEnv.urls.webapp;
    }
  } else {
    // Local development optimizations
    if (!process.env.NODE_ENV) {
      process.env.NODE_ENV = 'development';
    }
  }

  return cloudEnv;
}

/**
 * Validates cloud environment requirements
 */
export function validateCloudEnvironment(cloudEnv: CloudEnvironmentInfo): {
  valid: boolean;
  warnings: string[];
  errors: string[];
} {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Check memory limits
  if (cloudEnv.limits.memory < 512) {
    warnings.push(
      `Low memory limit (${cloudEnv.limits.memory}MB). Consider upgrading for better performance.`
    );
  }

  // Check required features for cloud platforms
  if (cloudEnv.isCloud) {
    if (!cloudEnv.features.portForwarding) {
      errors.push('Port forwarding is required for cloud environments');
    }

    if (!cloudEnv.features.terminalAccess) {
      warnings.push('Terminal access is recommended for debugging');
    }

    if (!cloudEnv.urls.webapp) {
      warnings.push('Unable to determine public URL for this cloud environment');
    }
  }

  // Platform-specific validations
  switch (cloudEnv.platform) {
    case 'replit':
      if (!process.env.REPL_SLUG) {
        warnings.push('REPL_SLUG not found. Some features may not work correctly.');
      }
      break;

    case 'codespaces':
      if (!process.env.CODESPACE_NAME) {
        warnings.push('CODESPACE_NAME not found. URL generation may fail.');
      }
      break;

    case 'gitpod':
      if (!process.env.GITPOD_WORKSPACE_URL) {
        warnings.push('GITPOD_WORKSPACE_URL not found. URL generation may fail.');
      }
      break;
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * Generates environment-specific documentation
 */
export function generateEnvironmentDocs(cloudEnv: CloudEnvironmentInfo): string {
  const platform = cloudEnv.platform.charAt(0).toUpperCase() + cloudEnv.platform.slice(1);

  let docs = `# ${platform} Environment Configuration\n\n`;

  if (cloudEnv.isCloud) {
    docs += `Running on ${platform} cloud development environment.\n\n`;

    if (cloudEnv.urls.webapp) {
      docs += `**Web Application**: ${cloudEnv.urls.webapp}\n`;
    }

    if (cloudEnv.urls.websocket) {
      docs += `**WebSocket Endpoint**: ${cloudEnv.urls.websocket}\n`;
    }

    docs += `\n## Platform Features\n`;
    Object.entries(cloudEnv.features).forEach(([feature, enabled]) => {
      docs += `- ${feature}: ${enabled ? '✅' : '❌'}\n`;
    });

    docs += `\n## Resource Limits\n`;
    docs += `- Memory: ${cloudEnv.limits.memory}MB\n`;
    docs += `- CPU: ${cloudEnv.limits.cpu} cores\n`;
    docs += `- Storage: ${cloudEnv.limits.storage}MB\n`;
    docs += `- Network: ${cloudEnv.limits.networkBandwidth}Mbps\n`;
  } else {
    docs += `Running in local development environment.\n\n`;
    docs += `**Web Application**: http://localhost:${cloudEnv.defaultPort}\n`;
    docs += `**WebSocket Endpoint**: ws://localhost:${cloudEnv.websocketPort}\n`;
  }

  return docs;
}

// Export the detected environment for immediate use
export const CLOUD_ENV = detectCloudEnvironment();

// Log environment detection on module load
if (CLOUD_ENV.isCloud) {
  logger.info(`🌐 Detected cloud environment: ${CLOUD_ENV.platform}`, {
    urls: CLOUD_ENV.urls,
    features: CLOUD_ENV.features,
  });
} else {
  logger.info('💻 Running in local development environment');
}
