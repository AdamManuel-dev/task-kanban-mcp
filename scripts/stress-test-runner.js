/**
 * Custom Stress Test Runner
 *
 * Runs distributed stress tests using Node.js cluster module to simulate
 * high concurrent load on the MCP Kanban Server.
 */

const cluster = require('cluster');
const os = require('os');
const path = require('path');
const fs = require('fs');

const numCPUs = os.cpus().length;
const MAX_WORKERS = Math.min(numCPUs, 8); // Limit to 8 workers max

class StressTestRunner {
  constructor(options = {}) {
    this.options = {
      workers: options.workers || MAX_WORKERS,
      duration: options.duration || 300000, // 5 minutes default
      rampUpTime: options.rampUpTime || 30000, // 30 seconds ramp-up
      baseUrl: options.baseUrl || 'http://localhost:3000',
      apiKey: options.apiKey || 'dev-key-1',
      requestsPerWorker: options.requestsPerWorker || 1000,
      concurrentRequests: options.concurrentRequests || 50,
      testType: options.testType || 'mixed',
      outputDir: options.outputDir || './stress-test-results',
      ...options,
    };

    this.workers = new Map();
    this.results = {
      startTime: null,
      endTime: null,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalResponseTime: 0,
      minResponseTime: Infinity,
      maxResponseTime: 0,
      responseTimeDistribution: {},
      errorsByType: {},
      workers: {},
    };

    this.setupOutputDirectory();
  }

  setupOutputDirectory() {
    if (!fs.existsSync(this.options.outputDir)) {
      fs.mkdirSync(this.options.outputDir, { recursive: true });
    }
  }

  async run() {
    console.log(`🚀 Starting stress test with ${this.options.workers} workers`);
    console.log(`📊 Configuration:`, {
      duration: `${this.options.duration / 1000}s`,
      requestsPerWorker: this.options.requestsPerWorker,
      concurrentRequests: this.options.concurrentRequests,
      testType: this.options.testType,
      baseUrl: this.options.baseUrl,
    });

    if (cluster.isMaster) {
      this.runMaster();
    } else {
      await this.runWorker();
    }
  }

  runMaster() {
    this.results.startTime = Date.now();

    // Setup result collection from workers
    cluster.on('message', (worker, message) => {
      if (message.type === 'result') {
        this.aggregateResults(worker.id, message.data);
      } else if (message.type === 'progress') {
        this.logProgress(worker.id, message.data);
      }
    });

    // Handle worker deaths
    cluster.on('exit', (worker, code, signal) => {
      console.warn(`⚠️  Worker ${worker.process.pid} died (${signal || code})`);
      if (!worker.exitedAfterDisconnect) {
        console.log('🔄 Restarting worker...');
        cluster.fork();
      }
    });

    // Start workers with staggered timing for ramp-up
    const rampUpInterval = this.options.rampUpTime / this.options.workers;

    for (let i = 0; i < this.options.workers; i++) {
      setTimeout(() => {
        const worker = cluster.fork({
          WORKER_ID: i,
          STRESS_TEST_CONFIG: JSON.stringify(this.options),
        });
        this.workers.set(worker.id, {
          pid: worker.process.pid,
          startTime: Date.now(),
          requests: 0,
          errors: 0,
        });
        console.log(
          `🔧 Started worker ${i + 1}/${this.options.workers} (PID: ${worker.process.pid})`
        );
      }, i * rampUpInterval);
    }

    // Monitor test progress
    const progressInterval = setInterval(() => {
      this.logOverallProgress();
    }, 10000); // Every 10 seconds

    // Stop test after duration
    setTimeout(() => {
      console.log('⏰ Test duration reached, stopping workers...');
      clearInterval(progressInterval);

      for (const id in cluster.workers) {
        cluster.workers[id].disconnect();
      }

      setTimeout(() => {
        this.finalizeResults();
      }, 5000); // Wait 5 seconds for workers to finish
    }, this.options.duration);
  }

  async runWorker() {
    const workerId = process.env.WORKER_ID;
    const config = JSON.parse(process.env.STRESS_TEST_CONFIG);

    console.log(`👷 Worker ${workerId} starting stress test`);

    const StressWorker = require('./stress-worker');
    const worker = new StressWorker(config);

    await worker.run();
  }

  aggregateResults(workerId, workerResults) {
    // Aggregate results from worker
    this.results.totalRequests += workerResults.totalRequests;
    this.results.successfulRequests += workerResults.successfulRequests;
    this.results.failedRequests += workerResults.failedRequests;
    this.results.totalResponseTime += workerResults.totalResponseTime;

    this.results.minResponseTime = Math.min(
      this.results.minResponseTime,
      workerResults.minResponseTime
    );
    this.results.maxResponseTime = Math.max(
      this.results.maxResponseTime,
      workerResults.maxResponseTime
    );

    // Merge response time distribution
    Object.entries(workerResults.responseTimeDistribution).forEach(([bucket, count]) => {
      this.results.responseTimeDistribution[bucket] =
        (this.results.responseTimeDistribution[bucket] || 0) + count;
    });

    // Merge error types
    Object.entries(workerResults.errorsByType).forEach(([errorType, count]) => {
      this.results.errorsByType[errorType] = (this.results.errorsByType[errorType] || 0) + count;
    });

    this.results.workers[workerId] = workerResults;
  }

  logProgress(workerId, progressData) {
    if (this.workers.has(workerId)) {
      const worker = this.workers.get(workerId);
      worker.requests = progressData.requests;
      worker.errors = progressData.errors;
    }
  }

  logOverallProgress() {
    let totalRequests = 0;
    let totalErrors = 0;

    this.workers.forEach(worker => {
      totalRequests += worker.requests;
      totalErrors += worker.errors;
    });

    const elapsedTime = Date.now() - this.results.startTime;
    const requestsPerSecond = Math.round((totalRequests / elapsedTime) * 1000);
    const errorRate = totalRequests > 0 ? ((totalErrors / totalRequests) * 100).toFixed(2) : '0.00';

    console.log(
      `📈 Progress: ${totalRequests} requests, ${requestsPerSecond} req/s, ${errorRate}% errors`
    );
  }

  finalizeResults() {
    this.results.endTime = Date.now();
    const duration = this.results.endTime - this.results.startTime;

    // Calculate final metrics
    const avgResponseTime =
      this.results.totalRequests > 0
        ? this.results.totalResponseTime / this.results.totalRequests
        : 0;
    const requestsPerSecond = (this.results.totalRequests / duration) * 1000;
    const errorRate =
      this.results.totalRequests > 0
        ? (this.results.failedRequests / this.results.totalRequests) * 100
        : 0;

    const summary = {
      testConfiguration: this.options,
      results: {
        duration: `${(duration / 1000).toFixed(2)}s`,
        totalRequests: this.results.totalRequests,
        successfulRequests: this.results.successfulRequests,
        failedRequests: this.results.failedRequests,
        requestsPerSecond: Math.round(requestsPerSecond),
        averageResponseTime: `${avgResponseTime.toFixed(2)}ms`,
        minResponseTime: `${this.results.minResponseTime}ms`,
        maxResponseTime: `${this.results.maxResponseTime}ms`,
        errorRate: `${errorRate.toFixed(2)}%`,
        responseTimeDistribution: this.results.responseTimeDistribution,
        errorsByType: this.results.errorsByType,
        workerStats: this.results.workers,
      },
    };

    // Save results to file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const resultsFile = path.join(this.options.outputDir, `stress-test-${timestamp}.json`);
    fs.writeFileSync(resultsFile, JSON.stringify(summary, null, 2));

    // Display summary
    console.log('\n🎯 STRESS TEST COMPLETED');
    console.log('='.repeat(50));
    console.log(`📊 Total Requests: ${summary.results.totalRequests}`);
    console.log(`✅ Successful: ${summary.results.successfulRequests}`);
    console.log(`❌ Failed: ${summary.results.failedRequests}`);
    console.log(`⚡ Requests/sec: ${summary.results.requestsPerSecond}`);
    console.log(`⏱️  Avg Response Time: ${summary.results.averageResponseTime}`);
    console.log(
      `📈 Min/Max Response: ${summary.results.minResponseTime}/${summary.results.maxResponseTime}`
    );
    console.log(`🚨 Error Rate: ${summary.results.errorRate}`);
    console.log(`📁 Results saved to: ${resultsFile}`);

    if (Object.keys(this.results.errorsByType).length > 0) {
      console.log('\n🚨 Error Breakdown:');
      Object.entries(this.results.errorsByType).forEach(([error, count]) => {
        console.log(`   ${error}: ${count}`);
      });
    }

    // Determine if test passed based on thresholds
    const passed = this.evaluateTestResults(summary.results);
    console.log(`\n${passed ? '✅ TEST PASSED' : '❌ TEST FAILED'}`);

    process.exit(passed ? 0 : 1);
  }

  evaluateTestResults(results) {
    const thresholds = {
      maxErrorRate: 5, // 5%
      maxAvgResponseTime: 1000, // 1000ms
      minRequestsPerSecond: 100,
    };

    const errorRate = parseFloat(results.errorRate);
    const avgResponseTime = parseFloat(results.averageResponseTime);
    const { requestsPerSecond } = results;

    let passed = true;

    if (errorRate > thresholds.maxErrorRate) {
      console.log(`❌ Error rate ${errorRate}% exceeds threshold of ${thresholds.maxErrorRate}%`);
      passed = false;
    }

    if (avgResponseTime > thresholds.maxAvgResponseTime) {
      console.log(
        `❌ Average response time ${avgResponseTime}ms exceeds threshold of ${thresholds.maxAvgResponseTime}ms`
      );
      passed = false;
    }

    if (requestsPerSecond < thresholds.minRequestsPerSecond) {
      console.log(
        `❌ Requests per second ${requestsPerSecond} below threshold of ${thresholds.minRequestsPerSecond}`
      );
      passed = false;
    }

    return passed;
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
      // Convert numeric values
      if (/^\d+$/.test(value)) {
        options[key] = parseInt(value, 10);
      } else if (value === 'true' || value === 'false') {
        options[key] = value === 'true';
      } else {
        options[key] = value;
      }
    }
  }

  const runner = new StressTestRunner(options);
  runner.run().catch(console.error);
}

module.exports = StressTestRunner;
