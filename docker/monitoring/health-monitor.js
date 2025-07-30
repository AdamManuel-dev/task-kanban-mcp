#!/usr/bin/env node

/**
 * @fileoverview Container health monitoring and alerting system
 * @lastmodified 2025-01-28T10:30:00Z
 * 
 * Features: Service health checks, automated recovery, status reporting
 * Main APIs: checkServices(), recoverService(), generateReport()
 * Constraints: Requires Docker API access, service discovery
 * Patterns: Async monitoring loops, exponential backoff for retries
 */

const http = require('http');
const https = require('https');
const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const config = {
  services: (process.env.SERVICES || 'mcp-kanban-api,mcp-kanban-mcp').split(','),
  checkInterval: parseInt(process.env.CHECK_INTERVAL || '30000', 10),
  retryAttempts: 3,
  retryDelay: 5000,
  alertThreshold: 3, // Failed checks before alerting
  logFile: '/app/logs/health-monitor.log',
  statusFile: '/app/logs/health-status.json',
  endpoints: {
    'mcp-kanban-api': 'http://mcp-kanban-api:3000/health',
    'mcp-kanban-mcp': 'http://mcp-kanban-mcp:3001/health',
    'prometheus': 'http://prometheus:9090/-/healthy',
    'grafana': 'http://grafana:3000/api/health',
    'loki': 'http://loki:3100/ready',
    'alertmanager': 'http://alertmanager:9093/-/healthy'
  },
  recoveryCommands: {
    'mcp-kanban-api': 'docker-compose restart mcp-kanban-api',
    'mcp-kanban-mcp': 'docker-compose restart mcp-kanban-mcp'
  }
};

// Service status tracking
const serviceStatus = new Map();
const failureCount = new Map();

/**
 * Log message with timestamp
 */
function log(level, message, data = {}) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level: level.toUpperCase(),
    message,
    ...data
  };
  
  console.log(`[${timestamp}] ${level.toUpperCase()}: ${message}`, data);
  
  // Write to log file (fire and forget)
  const logLine = JSON.stringify(logEntry) + '\n';
  fs.appendFile(config.logFile, logLine).catch(() => {
    // Ignore file write errors to prevent infinite loops
  });
}

/**
 * Make HTTP health check request
 */
function makeHealthRequest(url, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: 'GET',
      timeout: timeout,
      headers: {
        'User-Agent': 'MCP-Kanban-Health-Monitor/1.0'
      }
    };

    const req = client.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({
            status: 'healthy',
            statusCode: res.statusCode,
            response: data.substring(0, 200), // Limit response size
            responseTime: Date.now() - startTime
          });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 100)}`));
        }
      });
    });

    const startTime = Date.now();
    
    req.on('error', (error) => {
      reject(new Error(`Request failed: ${error.message}`));
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timeout after ${timeout}ms`));
    });
    
    req.end();
  });
}

/**
 * Check health of a single service
 */
async function checkServiceHealth(serviceName) {
  const endpoint = config.endpoints[serviceName];
  if (!endpoint) {
    log('warn', `No health endpoint configured for service: ${serviceName}`);
    return { status: 'unknown', reason: 'No endpoint configured' };
  }

  try {
    const result = await makeHealthRequest(endpoint);
    return {
      status: 'healthy',
      ...result
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      reason: error.message,
      responseTime: null
    };
  }
}

/**
 * Attempt to recover a failed service
 */
async function recoverService(serviceName) {
  const command = config.recoveryCommands[serviceName];
  if (!command) {
    log('warn', `No recovery command configured for service: ${serviceName}`);
    return false;
  }

  log('info', `Attempting to recover service: ${serviceName}`, { command });

  return new Promise((resolve) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        log('error', `Recovery failed for ${serviceName}`, {
          error: error.message,
          stdout: stdout.substring(0, 200),
          stderr: stderr.substring(0, 200)
        });
        resolve(false);
      } else {
        log('info', `Recovery command completed for ${serviceName}`, {
          stdout: stdout.substring(0, 200)
        });
        resolve(true);
      }
    });
  });
}

/**
 * Check all configured services
 */
async function checkAllServices() {
  const results = {};
  const checks = config.services.map(async (serviceName) => {
    const startTime = Date.now();
    const result = await checkServiceHealth(serviceName);
    const checkDuration = Date.now() - startTime;
    
    results[serviceName] = {
      ...result,
      checkDuration,
      lastChecked: new Date().toISOString()
    };

    // Update service status tracking
    const previousStatus = serviceStatus.get(serviceName);
    serviceStatus.set(serviceName, result.status);

    if (result.status === 'unhealthy') {
      const failures = failureCount.get(serviceName) || 0;
      failureCount.set(serviceName, failures + 1);
      
      log('warn', `Service health check failed: ${serviceName}`, {
        reason: result.reason,
        failureCount: failures + 1,
        checkDuration
      });

      // Attempt recovery if threshold reached
      if (failures + 1 >= config.alertThreshold) {
        log('error', `Service failure threshold reached: ${serviceName}`, {
          failureCount: failures + 1,
          threshold: config.alertThreshold
        });
        
        // Attempt recovery
        const recovered = await recoverService(serviceName);
        if (recovered) {
          failureCount.set(serviceName, 0); // Reset failure count
        }
      }
    } else {
      // Reset failure count on successful check
      if (failureCount.has(serviceName)) {
        const previousFailures = failureCount.get(serviceName);
        if (previousFailures > 0) {
          log('info', `Service recovered: ${serviceName}`, {
            previousFailures,
            responseTime: result.responseTime
          });
        }
        failureCount.set(serviceName, 0);
      }
    }

    // Log status changes
    if (previousStatus && previousStatus !== result.status) {
      log('info', `Service status changed: ${serviceName}`, {
        from: previousStatus,
        to: result.status,
        responseTime: result.responseTime
      });
    }

    return { serviceName, result };
  });

  await Promise.all(checks);
  return results;
}

/**
 * Generate and save health status report
 */
async function saveHealthStatus(results) {
  const summary = {
    timestamp: new Date().toISOString(),
    totalServices: config.services.length,
    healthyServices: Object.values(results).filter(r => r.status === 'healthy').length,
    unhealthyServices: Object.values(results).filter(r => r.status === 'unhealthy').length,
    unknownServices: Object.values(results).filter(r => r.status === 'unknown').length,
    services: results
  };

  try {
    await fs.writeFile(config.statusFile, JSON.stringify(summary, null, 2));
  } catch (error) {
    log('error', 'Failed to save health status file', { error: error.message });
  }

  return summary;
}

/**
 * Main monitoring loop
 */
async function monitorServices() {
  log('info', 'Starting health monitoring', {
    services: config.services,
    checkInterval: config.checkInterval,
    alertThreshold: config.alertThreshold
  });

  while (true) {
    try {
      const results = await checkAllServices();
      const summary = await saveHealthStatus(results);
      
      log('debug', 'Health check completed', {
        healthy: summary.healthyServices,
        unhealthy: summary.unhealthyServices,
        unknown: summary.unknownServices
      });

      // Log overall status periodically
      if (Date.now() % (config.checkInterval * 10) < config.checkInterval) {
        log('info', 'Health monitoring summary', summary);
      }

    } catch (error) {
      log('error', 'Health monitoring error', { error: error.message });
    }

    // Wait for next check
    await new Promise(resolve => setTimeout(resolve, config.checkInterval));
  }
}

/**
 * Handle graceful shutdown
 */
function setupSignalHandlers() {
  const shutdown = async (signal) => {
    log('info', `Received ${signal}, shutting down gracefully`);
    
    try {
      const finalStatus = {
        timestamp: new Date().toISOString(),
        status: 'shutdown',
        reason: `Received ${signal}`,
        services: Object.fromEntries(serviceStatus)
      };
      
      await fs.writeFile(config.statusFile, JSON.stringify(finalStatus, null, 2));
    } catch (error) {
      log('error', 'Failed to save final status', { error: error.message });
    }

    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

/**
 * Initialize monitoring
 */
async function initialize() {
  try {
    // Ensure log directory exists
    const logDir = path.dirname(config.logFile);
    try {
      await fs.mkdir(logDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }

    // Initialize failure counts
    config.services.forEach(service => {
      failureCount.set(service, 0);
    });

    log('info', 'Health monitor initialized', {
      services: config.services.length,
      endpoints: Object.keys(config.endpoints).length,
      logFile: config.logFile,
      statusFile: config.statusFile
    });

  } catch (error) {
    log('error', 'Failed to initialize health monitor', { error: error.message });
    process.exit(1);
  }
}

// Start monitoring
if (require.main === module) {
  setupSignalHandlers();
  initialize().then(() => {
    monitorServices().catch((error) => {
      log('error', 'Monitoring loop failed', { error: error.message });
      process.exit(1);
    });
  });
}

module.exports = {
  checkServiceHealth,
  checkAllServices,
  recoverService,
  saveHealthStatus
};