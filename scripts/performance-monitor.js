/**
 * Performance Monitoring System
 *
 * Provides real-time monitoring of system performance during scale testing,
 * including resource usage, response times, and system health metrics.
 */

const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

class PerformanceMonitor {
  constructor(options = {}) {
    this.options = {
      interval: options.interval || 5000, // 5 seconds
      outputDir: options.outputDir || './performance-data',
      enableSystemMetrics: options.enableSystemMetrics !== false,
      enableProcessMetrics: options.enableProcessMetrics !== false,
      enableNetworkMetrics: options.enableNetworkMetrics !== false,
      serverUrl: options.serverUrl || 'http://localhost:3000',
      apiKey: options.apiKey || 'dev-key-1',
      ...options,
    };

    this.isMonitoring = false;
    this.metrics = {
      timestamp: [],
      cpu: [],
      memory: [],
      processes: [],
      network: [],
      eventLoop: [],
      applicationHealth: [],
    };

    this.setupOutputDirectory();
  }

  setupOutputDirectory() {
    if (!fs.existsSync(this.options.outputDir)) {
      fs.mkdirSync(this.options.outputDir, { recursive: true });
    }
  }

  async start() {
    if (this.isMonitoring) {
      console.log('⚠️  Performance monitoring already running');
      return;
    }

    console.log('🔍 Starting performance monitoring...');
    console.log(`📊 Monitoring interval: ${this.options.interval}ms`);
    console.log(`📁 Output directory: ${this.options.outputDir}`);

    this.isMonitoring = true;
    this.startTime = Date.now();

    // Start monitoring loops
    this.startSystemMonitoring();
    this.startEventLoopMonitoring();
    this.startApplicationHealthChecks();

    // Setup periodic data export
    this.setupDataExport();

    console.log('✅ Performance monitoring started');
  }

  stop() {
    if (!this.isMonitoring) {
      console.log('⚠️  Performance monitoring not running');
      return;
    }

    console.log('🛑 Stopping performance monitoring...');
    this.isMonitoring = false;

    // Export final data
    this.exportData();
    this.generateReport();

    console.log('✅ Performance monitoring stopped');
  }

  startSystemMonitoring() {
    const collectMetrics = () => {
      if (!this.isMonitoring) return;

      const timestamp = Date.now();
      this.metrics.timestamp.push(timestamp);

      // CPU Metrics
      if (this.options.enableSystemMetrics) {
        const cpuUsage = this.getCPUUsage();
        this.metrics.cpu.push(cpuUsage);
      }

      // Memory Metrics
      if (this.options.enableProcessMetrics) {
        const memoryUsage = this.getMemoryUsage();
        this.metrics.memory.push(memoryUsage);
      }

      // Process Metrics
      const processMetrics = this.getProcessMetrics();
      this.metrics.processes.push(processMetrics);

      // Network Metrics (if available)
      if (this.options.enableNetworkMetrics) {
        this.collectNetworkMetrics()
          .then(networkMetrics => {
            this.metrics.network.push(networkMetrics);
          })
          .catch(err => {
            console.warn('Network metrics collection failed:', err.message);
          });
      }

      setTimeout(collectMetrics, this.options.interval);
    };

    collectMetrics();
  }

  startEventLoopMonitoring() {
    const measureEventLoopLag = () => {
      if (!this.isMonitoring) return;

      const start = process.hrtime.bigint();
      setImmediate(() => {
        if (!this.isMonitoring) return;

        const lag = Number(process.hrtime.bigint() - start) / 1e6; // Convert to milliseconds
        this.metrics.eventLoop.push({
          timestamp: Date.now(),
          lag,
        });

        setTimeout(measureEventLoopLag, this.options.interval);
      });
    };

    measureEventLoopLag();
  }

  startApplicationHealthChecks() {
    const checkApplicationHealth = async () => {
      if (!this.isMonitoring) return;

      try {
        const healthCheck = await this.performHealthCheck();
        this.metrics.applicationHealth.push({
          timestamp: Date.now(),
          ...healthCheck,
        });
      } catch (error) {
        this.metrics.applicationHealth.push({
          timestamp: Date.now(),
          healthy: false,
          error: error.message,
        });
      }

      setTimeout(checkApplicationHealth, this.options.interval * 2); // Less frequent health checks
    };

    checkApplicationHealth();
  }

  getCPUUsage() {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach(cpu => {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    });

    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 - ~~((100 * idle) / total);

    return { timestamp: Date.now(), cores: cpus.length, usage, loadAverage: os.loadavg(), details: cpus.map(cpu => ({ model: cpu.model, speed: cpu.speed, times: cpu.times })) };
  }

  getMemoryUsage() {
    const processMemory = process.memoryUsage();
    const systemMemory = {
      total: os.totalmem(),
      free: os.freemem(),
      used: os.totalmem() - os.freemem(),
    };

    return { timestamp: Date.now(), process: { rss: Math.round(processMemory.rss / 1024 / 1024), heapTotal: Math.round(processMemory.heapTotal / 1024 / 1024), heapUsed: Math.round(processMemory.heapUsed / 1024 / 1024), external: Math.round(processMemory.external / 1024 / 1024), arrayBuffers: Math.round(processMemory.arrayBuffers / 1024 / 1024) }, system: { total: Math.round(systemMemory.total / 1024 / 1024), free: Math.round(systemMemory.free / 1024 / 1024), used: Math.round(systemMemory.used / 1024 / 1024), usagePercent: Math.round((systemMemory.used / systemMemory.total) * 100) } };
  }

  getProcessMetrics() {
    return { timestamp: Date.now(), pid: process.pid, uptime: process.uptime(), version: process.version, platform: process.platform, arch: process.arch, activeHandles: process._getActiveHandles ? process._getActiveHandles().length : 0, activeRequests: process._getActiveRequests ? process._getActiveRequests().length : 0 };
  }

  async collectNetworkMetrics() {
    return new Promise((resolve, reject) => {
      // Basic network interface stats
      const networkInterfaces = os.networkInterfaces();
      const networkStats = {};

      Object.keys(networkInterfaces).forEach(interfaceName => {
        const interfaces = networkInterfaces[interfaceName];
        networkStats[interfaceName] = interfaces.map(iface => ({
          address: iface.address,
          netmask: iface.netmask,
          family: iface.family,
          mac: iface.mac,
          internal: iface.internal,
          cidr: iface.cidr,
        }));
      });

      resolve({
        timestamp: Date.now(),
        interfaces: networkStats,
      });
    });
  }

  async performHealthCheck() {
    return new Promise((resolve, reject) => {
      const http = require('http');
      const url = require('url');

      const startTime = Date.now();
      const parsedUrl = url.parse(`${this.options.serverUrl}/api/v1/health`);

      const req = http.request(
        {
          hostname: parsedUrl.hostname,
          port: parsedUrl.port || 3000,
          path: parsedUrl.path,
          method: 'GET',
          headers: {
            'X-API-Key': this.options.apiKey,
            'User-Agent': 'PerformanceMonitor',
          },
        },
        res => {
          let data = '';
          res.on('data', chunk => (data += chunk));
          res.on('end', () => {
            const responseTime = Date.now() - startTime;

            try {
              const healthData = JSON.parse(data);
              resolve({
                healthy: res.statusCode === 200,
                statusCode: res.statusCode,
                responseTime,
                data: healthData,
              });
            } catch (error) {
              resolve({
                healthy: res.statusCode === 200,
                statusCode: res.statusCode,
                responseTime,
                parseError: error.message,
              });
            }
          });
        }
      );

      req.on('error', error => {
        reject(error);
      });

      req.setTimeout(5000, () => {
        req.destroy();
        reject(new Error('Health check timeout'));
      });

      req.end();
    });
  }

  setupDataExport() {
    // Export data every minute during monitoring
    const exportInterval = setInterval(() => {
      if (!this.isMonitoring) {
        clearInterval(exportInterval);
        return;
      }

      this.exportData(false); // Don't generate full report during monitoring
    }, 60000); // Every minute
  }

  exportData(final = true) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = final
      ? `performance-final-${timestamp}.json`
      : `performance-snapshot-${timestamp}.json`;

    const filePath = path.join(this.options.outputDir, filename);

    const exportData = {
      monitoring: {
        startTime: this.startTime,
        endTime: final ? Date.now() : null,
        duration: Date.now() - this.startTime,
        options: this.options,
      },
      metrics: this.metrics,
      summary: this.generateSummary(),
    };

    fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2));

    if (final) {
      console.log(`📁 Performance data exported to: ${filePath}`);
    }
  }

  generateSummary() {
    const summary = {};

    // CPU Summary
    if (this.metrics.cpu.length > 0) {
      const cpuUsages = this.metrics.cpu.map(c => c.usage);
      summary.cpu = {
        average: Math.round(cpuUsages.reduce((a, b) => a + b, 0) / cpuUsages.length),
        min: Math.min(...cpuUsages),
        max: Math.max(...cpuUsages),
        samples: cpuUsages.length,
      };
    }

    // Memory Summary
    if (this.metrics.memory.length > 0) {
      const processMemory = this.metrics.memory.map(m => m.process.heapUsed);
      const systemMemory = this.metrics.memory.map(m => m.system.usagePercent);

      summary.memory = {
        process: {
          average: Math.round(processMemory.reduce((a, b) => a + b, 0) / processMemory.length),
          min: Math.min(...processMemory),
          max: Math.max(...processMemory),
          unit: 'MB',
        },
        system: {
          average: Math.round(systemMemory.reduce((a, b) => a + b, 0) / systemMemory.length),
          min: Math.min(...systemMemory),
          max: Math.max(...systemMemory),
          unit: '%',
        },
      };
    }

    // Event Loop Summary
    if (this.metrics.eventLoop.length > 0) {
      const lags = this.metrics.eventLoop.map(e => e.lag);
      summary.eventLoop = {
        averageLag: Math.round((lags.reduce((a, b) => a + b, 0) / lags.length) * 100) / 100,
        minLag: Math.min(...lags),
        maxLag: Math.max(...lags),
        samples: lags.length,
        unit: 'ms',
      };
    }

    // Application Health Summary
    if (this.metrics.applicationHealth.length > 0) {
      const healthyChecks = this.metrics.applicationHealth.filter(h => h.healthy).length;
      const responseTimes = this.metrics.applicationHealth
        .filter(h => h.responseTime)
        .map(h => h.responseTime);

      summary.applicationHealth = {
        uptime: Math.round((healthyChecks / this.metrics.applicationHealth.length) * 100),
        totalChecks: this.metrics.applicationHealth.length,
        healthyChecks,
        failedChecks: this.metrics.applicationHealth.length - healthyChecks,
      };

      if (responseTimes.length > 0) {
        summary.applicationHealth.responseTime = {
          average: Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length),
          min: Math.min(...responseTimes),
          max: Math.max(...responseTimes),
          unit: 'ms',
        };
      }
    }

    return summary;
  }

  generateReport() {
    const summary = this.generateSummary();
    const duration = Date.now() - this.startTime;

    console.log('\n📊 PERFORMANCE MONITORING REPORT');
    console.log('='.repeat(50));
    console.log(`⏱️  Duration: ${Math.round(duration / 1000)}s`);
    console.log(`📈 Samples: ${this.metrics.timestamp.length}`);

    if (this.metrics.cpu.length > 0) {
      console.log(`\n🖥️  CPU Usage:`);
      console.log(`   Average: ${summary.cpu.average}%`);
      console.log(`   Range: ${summary.cpu.min}% - ${summary.cpu.max}%`);
    }

    if (this.metrics.memory.length > 0) {
      console.log(`\n💾 Memory Usage:`);
      console.log(
        `   Process: ${summary.memory.process.average}MB avg (${summary.memory.process.min}-${summary.memory.process.max}MB)`
      );
      console.log(
        `   System: ${summary.memory.system.average}% avg (${summary.memory.system.min}-${summary.memory.system.max}%)`
      );
    }

    if (this.metrics.eventLoop.length > 0) {
      console.log(`\n🔄 Event Loop:`);
      console.log(`   Average Lag: ${summary.eventLoop.averageLag}ms`);
      console.log(`   Max Lag: ${summary.eventLoop.maxLag}ms`);
    }

    console.log(`\n🏥 Application Health:`);
    console.log(`   Uptime: ${summary.applicationHealth.uptime}%`);
    console.log(
      `   Health Checks: ${summary.applicationHealth.healthyChecks}/${summary.applicationHealth.totalChecks}`
    );

      if (summary.applicationHealth.responseTime) {
        console.log(`   Avg Response: ${summary.applicationHealth.responseTime.average}ms`);
      }
    }

    // Performance assessment
    const assessment = this.assessPerformance(summary);
    console.log(
      `\n${assessment.overall === 'good' ? '✅' : assessment.overall === 'warning' ? '⚠️' : '❌'} Overall Assessment: ${assessment.overall.toUpperCase()}`
    );

    if (assessment.issues.length > 0) {
      console.log('\n🚨 Issues Detected:');
      assessment.issues.forEach(issue => {
        console.log(`   - ${issue}`);
      });
    }

    if (assessment.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      assessment.recommendations.forEach(rec => {
        console.log(`   - ${rec}`);
      });
    }
  }

  assessPerformance(summary) {
    const assessment = {
      overall: 'good',
      issues: [],
      recommendations: [],
    };

    // CPU Assessment
    if (summary.cpu && summary.cpu.average > 80) {
      assessment.overall = 'critical';
      assessment.issues.push(`High CPU usage: ${summary.cpu.average}% average`);
      assessment.recommendations.push('Consider optimizing CPU-intensive operations');
    } else if (summary.cpu && summary.cpu.average > 60) {
      assessment.overall = 'warning';
      assessment.issues.push(`Elevated CPU usage: ${summary.cpu.average}% average`);
    }

    // Memory Assessment
    if (summary.memory) {
      if (summary.memory.process.max > 512) {
        assessment.overall = 'critical';
        assessment.issues.push(`High memory usage: ${summary.memory.process.max}MB peak`);
        assessment.recommendations.push('Investigate memory leaks and optimize memory usage');
      } else if (summary.memory.process.average > 256) {
        if (assessment.overall === 'good') assessment.overall = 'warning';
        assessment.issues.push(
          `Elevated memory usage: ${summary.memory.process.average}MB average`
        );
      }
    }

    // Event Loop Assessment
    if (summary.eventLoop && summary.eventLoop.maxLag > 100) {
      assessment.overall = 'critical';
      assessment.issues.push(`High event loop lag: ${summary.eventLoop.maxLag}ms max`);
      assessment.recommendations.push('Identify and optimize blocking operations');
    } else if (summary.eventLoop && summary.eventLoop.averageLag > 50) {
      if (assessment.overall === 'good') assessment.overall = 'warning';
      assessment.issues.push(`Event loop lag detected: ${summary.eventLoop.averageLag}ms average`);
    }

    // Application Health Assessment
    if (summary.applicationHealth && summary.applicationHealth.uptime < 95) {
      assessment.overall = 'critical';
      assessment.issues.push(`Low application uptime: ${summary.applicationHealth.uptime}%`);
      assessment.recommendations.push('Investigate application crashes and improve error handling');
    }

    return assessment;
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {};

  // Parse command line arguments
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    const value = args[i + 1];

    if (key && value) {
      if (/^\d+$/.test(value)) {
        options[key] = parseInt(value, 10);
      } else if (value === 'true' || value === 'false') {
        options[key] = value === 'true';
      } else {
        options[key] = value;
      }
    }
  }

  const monitor = new PerformanceMonitor(options);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT, stopping monitoring...');
    monitor.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, stopping monitoring...');
    monitor.stop();
    process.exit(0);
  });

  monitor.start();
}

module.exports = PerformanceMonitor;
