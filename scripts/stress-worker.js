/**
 * Stress Test Worker
 *
 * Individual worker process that generates load against the MCP Kanban Server.
 * Runs various test scenarios with realistic user behavior patterns.
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');
const crypto = require('crypto');

class StressWorker {
  constructor(config) {
    this.config = config;
    this.workerId = process.env.WORKER_ID || 0;
    this.results = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalResponseTime: 0,
      minResponseTime: Infinity,
      maxResponseTime: 0,
      responseTimeDistribution: {
        '0-100ms': 0,
        '100-200ms': 0,
        '200-500ms': 0,
        '500-1000ms': 0,
        '1000-2000ms': 0,
        '2000ms+': 0,
      },
      errorsByType: {},
    };

    this.testData = {
      boardIds: [],
      taskIds: [],
      userSessions: [],
    };

    this.isRunning = false;
    this.requestQueue = [];
    this.activeRequests = 0;
  }

  async run() {
    console.log(`🔧 Worker ${this.workerId} initializing...`);

    this.isRunning = true;

    // Setup test data
    await this.setupTestData();

    // Start the stress test
    this.startStressTesting();

    // Report progress periodically
    this.startProgressReporting();

    // Handle graceful shutdown
    process.on('disconnect', () => {
      console.log(`🛑 Worker ${this.workerId} shutting down...`);
      this.isRunning = false;
      setTimeout(() => {
        this.sendResults();
        process.exit(0);
      }, 1000);
    });
  }

  async setupTestData() {
    try {
      // Get available boards for testing
      const boardsResponse = await this.makeRequest('GET', '/api/v1/boards', { limit: 10 });
      if (boardsResponse.success && boardsResponse.data) {
        this.testData.boardIds = boardsResponse.data.map(board => board.id);
      }

      // Get some existing tasks
      const tasksResponse = await this.makeRequest('GET', '/api/v1/tasks', { limit: 50 });
      if (tasksResponse.success && tasksResponse.data) {
        this.testData.taskIds = tasksResponse.data.map(task => task.id);
      }

      console.log(
        `📚 Worker ${this.workerId} setup complete: ${this.testData.boardIds.length} boards, ${this.testData.taskIds.length} tasks`
      );
    } catch (error) {
      console.warn(`⚠️  Worker ${this.workerId} setup warning:`, error.message);
    }
  }

  startStressTesting() {
    const { concurrentRequests } = this.config;

    // Start concurrent request loops
    for (let i = 0; i < concurrentRequests; i++) {
      setTimeout(() => {
        this.requestLoop();
      }, Math.random() * 1000); // Stagger start times
    }
  }

  async requestLoop() {
    while (this.isRunning && this.results.totalRequests < this.config.requestsPerWorker) {
      try {
        await this.executeTestScenario();

        // Add some variance in request timing to simulate real users
        const delay = Math.random() * 500 + 100; // 100-600ms delay
        await this.sleep(delay);
      } catch (error) {
        this.recordError('REQUEST_LOOP_ERROR', error);
      }
    }
  }

  async executeTestScenario() {
    const scenarios = [
      { name: 'listTasks', weight: 30 },
      { name: 'createTask', weight: 20 },
      { name: 'updateTask', weight: 25 },
      { name: 'getTaskDetails', weight: 15 },
      { name: 'searchTasks', weight: 10 },
    ];

    const scenario = this.selectWeightedScenario(scenarios);

    switch (scenario) {
      case 'listTasks':
        await this.listTasksScenario();
        break;
      case 'createTask':
        await this.createTaskScenario();
        break;
      case 'updateTask':
        await this.updateTaskScenario();
        break;
      case 'getTaskDetails':
        await this.getTaskDetailsScenario();
        break;
      case 'searchTasks':
        await this.searchTasksScenario();
        break;
    }
  }

  async listTasksScenario() {
    const queryParams = {
      limit: Math.floor(Math.random() * 50) + 10, // 10-60 items
      sortBy: this.randomChoice(['created_at', 'updated_at', 'priority', 'title']),
      sortOrder: this.randomChoice(['asc', 'desc']),
    };

    // Add random filters
    if (Math.random() < 0.3) {
      queryParams.status = this.randomChoice(['todo', 'in_progress', 'done']);
    }

    if (Math.random() < 0.2) {
      queryParams.priority_min = Math.floor(Math.random() * 5) + 1;
    }

    await this.makeRequest('GET', '/api/v1/tasks', queryParams);
  }

  async createTaskScenario() {
    const boardId = this.randomChoice(this.testData.boardIds) || 'default-board';

    const taskData = {
      title: `Stress Test Task ${crypto.randomBytes(4).toString('hex')}`,
      description: `Created by worker ${this.workerId} at ${new Date().toISOString()}`,
      board_id: boardId,
      status: this.randomChoice(['todo', 'in_progress']),
      priority: Math.floor(Math.random() * 10) + 1,
      tags: this.generateRandomTags(),
    };

    const response = await this.makeRequest('POST', '/api/v1/tasks', null, taskData);

    // Store created task ID for future operations
    if (response.success && response.data?.id) {
      this.testData.taskIds.push(response.data.id);

      // Limit stored task IDs to prevent memory growth
      if (this.testData.taskIds.length > 1000) {
        this.testData.taskIds = this.testData.taskIds.slice(-500);
      }
    }
  }

  async updateTaskScenario() {
    if (this.testData.taskIds.length === 0) {
      await this.createTaskScenario();
      return;
    }

    const taskId = this.randomChoice(this.testData.taskIds);
    const updateData = {};

    // Randomly update different fields
    if (Math.random() < 0.6) {
      updateData.status = this.randomChoice(['todo', 'in_progress', 'review', 'done']);
    }

    if (Math.random() < 0.4) {
      updateData.priority = Math.floor(Math.random() * 10) + 1;
    }

    if (Math.random() < 0.3) {
      updateData.title = `Updated Task ${crypto.randomBytes(3).toString('hex')}`;
    }

    if (Math.random() < 0.2) {
      updateData.description = `Updated by worker ${this.workerId} at ${new Date().toISOString()}`;
    }

    await this.makeRequest('PATCH', `/api/v1/tasks/${taskId}`, null, updateData);
  }

  async getTaskDetailsScenario() {
    if (this.testData.taskIds.length === 0) {
      await this.listTasksScenario();
      return;
    }

    const taskId = this.randomChoice(this.testData.taskIds);
    await this.makeRequest('GET', `/api/v1/tasks/${taskId}`);
  }

  async searchTasksScenario() {
    const searchTerms = [
      'test',
      'bug',
      'feature',
      'urgent',
      'review',
      'implementation',
      'fix',
      'enhancement',
      'task',
    ];

    const queryParams = {
      search: this.randomChoice(searchTerms),
      limit: Math.floor(Math.random() * 30) + 10,
    };

    await this.makeRequest('GET', '/api/v1/tasks', queryParams);
  }

  makeRequest(method, path, queryParams = null, body = null) {
    return new Promise(resolve => {
      const startTime = Date.now();

      try {
        const url = new URL(path, this.config.baseUrl);

        // Add query parameters
        if (queryParams) {
          Object.entries(queryParams).forEach(([key, value]) => {
            if (value !== null && value !== undefined) {
              url.searchParams.append(key, value.toString());
            }
          });
        }

        const options = {
          method,
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': this.config.apiKey,
            'User-Agent': `StressWorker-${this.workerId}`,
          },
        };

        const requestData = body ? JSON.stringify(body) : null;
        if (requestData) {
          options.headers['Content-Length'] = Buffer.byteLength(requestData);
        }

        const client = url.protocol === 'https:' ? https : http;

        const req = client.request(url, options, res => {
          let responseData = '';

          res.on('data', chunk => {
            responseData += chunk;
          });

          res.on('end', () => {
            const duration = Date.now() - startTime;
            this.recordResponse(res.statusCode, duration, responseData);

            let parsedData = null;
            try {
              parsedData = JSON.parse(responseData);
            } catch (e) {
              // Non-JSON response, that's okay
            }

            resolve({
              success: res.statusCode >= 200 && res.statusCode < 300,
              statusCode: res.statusCode,
              data: parsedData,
              duration,
            });
          });
        });

        req.on('error', error => {
          const duration = Date.now() - startTime;
          this.recordError('REQUEST_ERROR', error);
          this.recordResponse(0, duration, null);

          resolve({
            success: false,
            error: error.message,
            duration,
          });
        });

        req.on('timeout', () => {
          req.destroy();
          const duration = Date.now() - startTime;
          this.recordError('TIMEOUT', new Error('Request timeout'));
          this.recordResponse(0, duration, null);

          resolve({
            success: false,
            error: 'Request timeout',
            duration,
          });
        });

        // Set timeout (30 seconds)
        req.setTimeout(30000);

        if (requestData) {
          req.write(requestData);
        }

        req.end();
      } catch (error) {
        const duration = Date.now() - startTime;
        this.recordError('REQUEST_SETUP_ERROR', error);
        this.recordResponse(0, duration, null);

        resolve({
          success: false,
          error: error.message,
          duration,
        });
      }
    });
  }

  recordResponse(statusCode, duration, responseData) {
    this.results.totalRequests++;
    this.results.totalResponseTime += duration;

    if (statusCode >= 200 && statusCode < 300) {
      this.results.successfulRequests++;
    } else {
      this.results.failedRequests++;
    }

    // Update min/max response times
    this.results.minResponseTime = Math.min(this.results.minResponseTime, duration);
    this.results.maxResponseTime = Math.max(this.results.maxResponseTime, duration);

    // Update response time distribution
    if (duration < 100) {
      this.results.responseTimeDistribution['0-100ms']++;
    } else if (duration < 200) {
      this.results.responseTimeDistribution['100-200ms']++;
    } else if (duration < 500) {
      this.results.responseTimeDistribution['200-500ms']++;
    } else if (duration < 1000) {
      this.results.responseTimeDistribution['500-1000ms']++;
    } else if (duration < 2000) {
      this.results.responseTimeDistribution['1000-2000ms']++;
    } else {
      this.results.responseTimeDistribution['2000ms+']++;
    }
  }

  recordError(errorType, error) {
    this.results.errorsByType[errorType] = (this.results.errorsByType[errorType] || 0) + 1;
    console.warn(`⚠️  Worker ${this.workerId} ${errorType}:`, error.message);
  }

  startProgressReporting() {
    setInterval(() => {
      if (process.send) {
        process.send({
          type: 'progress',
          data: {
            requests: this.results.totalRequests,
            errors: this.results.failedRequests,
          },
        });
      }
    }, 5000); // Report every 5 seconds
  }

  sendResults() {
    if (process.send) {
      process.send({
        type: 'result',
        data: this.results,
      });
    }
  }

  // Utility methods
  selectWeightedScenario(scenarios) {
    const totalWeight = scenarios.reduce((sum, scenario) => sum + scenario.weight, 0);
    let random = Math.random() * totalWeight;

    for (const scenario of scenarios) {
      random -= scenario.weight;
      if (random <= 0) {
        return scenario.name;
      }
    }

    return scenarios[0].name; // Fallback
  }

  randomChoice(array) {
    return array[Math.floor(Math.random() * array.length)];
  }

  generateRandomTags() {
    const allTags = ['urgent', 'bug', 'feature', 'backend', 'frontend', 'testing', 'review'];
    const numTags = Math.floor(Math.random() * 3); // 0-2 tags
    const selectedTags = [];

    for (let i = 0; i < numTags; i++) {
      const tag = this.randomChoice(allTags);
      if (!selectedTags.includes(tag)) {
        selectedTags.push(tag);
      }
    }

    return selectedTags;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = StressWorker;
