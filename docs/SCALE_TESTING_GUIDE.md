# Scale Testing Guide for MCP Kanban Server

## Overview

This guide provides comprehensive instructions for conducting scale testing on the MCP Kanban Server. Scale testing ensures the system can handle production-level loads while maintaining performance and stability.

## Quick Start

### Running Scale Tests Locally

```bash
# Run all scale tests
npm run test:scale

# Run specific test types
npm run test:load:artillery     # Load testing with Artillery
npm run test:stress:custom      # Custom stress testing
npm run test:stress:light       # Light stress test (1 minute)
npm run test:stress:heavy       # Heavy stress test (10 minutes)
npm run test:endurance          # Long-running endurance test (1 hour)
```

### Running Individual Components

```bash
# Start performance monitoring
node scripts/performance-monitor.js --interval 5000

# Run custom stress test with specific parameters
node scripts/stress-test-runner.js \
  --duration 600000 \
  --workers 8 \
  --requestsPerWorker 2000 \
  --concurrentRequests 100

# Run Artillery load test
artillery run artillery-config.yml --output results.json
```

## Test Types

### 1. Load Testing (Artillery)

**Purpose**: Simulate realistic user load patterns
**Tool**: Artillery.io
**Configuration**: `artillery-config.yml`

**Features**:
- Gradual ramp-up and ramp-down
- Mixed operation patterns (70% read, 20% update, 10% create/delete)
- Realistic user behavior simulation
- Performance threshold validation

**Key Metrics**:
- Requests per second
- Response time percentiles (P95, P99)
- Error rate
- Concurrent user capacity

### 2. Stress Testing (Custom Node.js)

**Purpose**: Find system breaking points
**Tool**: Custom cluster-based stress tester
**Scripts**: `scripts/stress-test-runner.js`, `scripts/stress-worker.js`

**Features**:
- Multi-process load generation
- Configurable concurrent requests
- Real-time performance monitoring
- Detailed failure analysis

**Key Metrics**:
- Maximum concurrent users
- System resource utilization
- Error rate under stress
- Recovery time after load spikes

### 3. Volume Testing

**Purpose**: Test system with large datasets
**Tool**: Jest performance tests
**Location**: `tests/performance/`

**Features**:
- Large dataset generation
- Database performance validation
- Memory usage monitoring
- Query optimization verification

### 4. Endurance Testing

**Purpose**: Long-running stability validation
**Duration**: 1+ hours
**Focus**: Memory leaks, performance degradation

## Test Configuration

### Artillery Configuration

```yaml
# artillery-config.yml
config:
  target: 'http://localhost:3000'
  phases:
    - duration: 300    # 5 min ramp-up
      arrivalRate: 1
      rampTo: 100
    - duration: 1800   # 30 min sustained
      arrivalRate: 100
    - duration: 300    # 5 min ramp-down
      arrivalRate: 100
      rampTo: 1
  ensure:
    maxErrorRate: 5    # Max 5% error rate
    p95: 500          # 95th percentile < 500ms
    p99: 1000         # 99th percentile < 1000ms
```

### Stress Test Configuration

```bash
# Command line options
--duration 300000        # Test duration (5 minutes)
--workers 4             # Number of worker processes
--requestsPerWorker 1000 # Requests per worker
--concurrentRequests 50  # Concurrent requests per worker
--baseUrl http://localhost:3000
--apiKey dev-key-1
```

### Performance Monitor Configuration

```bash
# Monitoring options
--interval 5000         # Collection interval (5 seconds)
--outputDir ./perf-data # Output directory
--serverUrl http://localhost:3000
--enableSystemMetrics true
--enableProcessMetrics true
--enableNetworkMetrics true
```

## Performance Targets

### Response Time Targets
| Endpoint Type | Average | 95th Percentile | 99th Percentile |
|---------------|---------|----------------|----------------|
| Simple GET | < 100ms | < 200ms | < 500ms |
| Complex Query | < 200ms | < 500ms | < 1000ms |
| POST/PUT | < 200ms | < 500ms | < 1000ms |
| Search | < 300ms | < 800ms | < 1500ms |

### Throughput Targets
| Test Type | Target | Minimum Acceptable |
|-----------|--------|--------------------|
| Concurrent Users | 500+ | 200+ |
| Requests/Second | 1000+ | 500+ |
| WebSocket Messages/Sec | 5000+ | 2000+ |
| Database Ops/Sec | 2000+ | 1000+ |

### Resource Limits
| Resource | Normal Load | Peak Load | Critical Threshold |
|----------|-------------|-----------|-------------------|
| Memory Usage | < 256MB | < 512MB | 1GB |
| CPU Usage | < 50% | < 80% | 90% |
| Event Loop Lag | < 10ms | < 50ms | 100ms |
| Error Rate | < 1% | < 5% | 10% |

## Test Scenarios

### 1. Normal Business Usage
```yaml
# Artillery scenario
- name: "Regular User Operations"
  weight: 70
  flow:
    - get: "/api/v1/tasks?limit=20"
    - patch: "/api/v1/tasks/{{ taskId }}"
    - post: "/api/v1/tasks"
```

### 2. Peak Traffic Simulation
```bash
# Stress test command
node scripts/stress-test-runner.js \
  --duration 600000 \
  --workers 8 \
  --requestsPerWorker 2000 \
  --concurrentRequests 100
```

### 3. Database Volume Testing
```bash
# Jest performance tests
npm run test:performance:verbose
```

## Monitoring and Analysis

### Real-time Monitoring

The performance monitor tracks:
- CPU usage and load average
- Memory consumption (process and system)
- Event loop lag
- Application health checks
- Network interface statistics

### Result Analysis

Test results include:
- Performance metrics summary
- Response time distribution
- Error breakdown by type
- Resource utilization trends
- Performance regression detection

### Automated Reporting

```javascript
// Generate performance report
const monitor = new PerformanceMonitor();
await monitor.start();
// ... run tests ...
monitor.stop(); // Generates comprehensive report
```

## CI/CD Integration

### GitHub Actions Workflow

The project includes automated scale testing via `.github/workflows/scale-testing.yml`:

- **Trigger**: Daily at 2 AM UTC or manual dispatch
- **Matrix**: Load, Stress, and Volume tests
- **Artifacts**: Detailed reports and metrics
- **Alerting**: Issues created for performance regressions

### Manual Trigger

```bash
# Via GitHub CLI
gh workflow run scale-testing.yml \
  -f test_type=stress \
  -f test_duration=600 \
  -f workers=6
```

## Troubleshooting

### Common Issues

1. **High Memory Usage**
   ```bash
   # Monitor memory patterns
   node scripts/performance-monitor.js --interval 1000
   ```

2. **Event Loop Lag**
   ```bash
   # Check for blocking operations
   node --inspect scripts/stress-test-runner.js
   ```

3. **Database Performance**
   ```sql
   -- Analyze slow queries
   EXPLAIN QUERY PLAN SELECT * FROM tasks WHERE board_id = ?;
   ```

4. **Network Bottlenecks**
   ```bash
   # Monitor network interfaces
   netstat -i
   ss -tuln
   ```

### Performance Optimization

1. **Database Optimization**
   - Add appropriate indexes
   - Optimize query patterns
   - Use connection pooling
   - Implement caching

2. **Application Optimization**
   - Reduce memory allocations
   - Optimize hot code paths
   - Implement lazy loading
   - Use clustering

3. **System Optimization**
   - Tune OS parameters
   - Optimize Node.js settings
   - Configure load balancing
   - Monitor resource limits

## Best Practices

### Test Environment Setup

1. **Consistent Environment**
   ```bash
   # Use consistent Node.js version
   nvm use 18
   
   # Clean environment
   rm -rf node_modules
   npm ci
   npm run build
   ```

2. **Database State**
   ```bash
   # Reset to known state
   npm run db:reset
   npm run db:seed
   ```

3. **Resource Monitoring**
   ```bash
   # Start monitoring before tests
   node scripts/performance-monitor.js &
   MONITOR_PID=$!
   
   # Run tests
   npm run test:scale
   
   # Stop monitoring
   kill $MONITOR_PID
   ```

### Test Data Management

1. **Realistic Data Volume**
   - Use production-like dataset sizes
   - Include varied data patterns
   - Test with empty and full states

2. **Data Cleanup**
   - Clean up test data after runs
   - Prevent test data interference
   - Use isolated test databases

### Result Interpretation

1. **Baseline Comparison**
   - Establish performance baselines
   - Track trends over time
   - Identify regressions early

2. **Context Awareness**
   - Consider system resources
   - Account for network conditions
   - Factor in concurrent processes

## Advanced Topics

### Custom Test Scenarios

```javascript
// Create custom Artillery scenario
module.exports = {
  customScenario: function(context, events, done) {
    // Custom logic here
    return done();
  }
};
```

### Performance Profiling

```bash
# Enable V8 profiling
node --prof scripts/stress-test-runner.js

# Analyze profile
node --prof-process isolate-*.log > profile.txt
```

### Memory Leak Detection

```bash
# Enable heap snapshots
node --inspect --inspect-brk scripts/stress-test-runner.js

# Or use clinic.js
npm install -g clinic
clinic doctor -- node scripts/stress-test-runner.js
```

### Distributed Testing

```bash
# Run tests from multiple machines
# Machine 1:
node scripts/stress-test-runner.js --workers 4 --baseUrl http://target:3000

# Machine 2:
node scripts/stress-test-runner.js --workers 4 --baseUrl http://target:3000
```

## Integration with Monitoring Systems

### Grafana Dashboard

The performance monitor can export metrics to Grafana:

```javascript
// Export to InfluxDB format
const monitor = new PerformanceMonitor({
  exportFormat: 'influxdb',
  influxUrl: 'http://localhost:8086'
});
```

### Alerting Integration

```javascript
// Slack notifications
const monitor = new PerformanceMonitor({
  alerting: {
    slack: {
      webhook: process.env.SLACK_WEBHOOK,
      thresholds: {
        errorRate: 5,
        responseTime: 1000
      }
    }
  }
});
```

## Conclusion

This scale testing framework provides comprehensive validation of the MCP Kanban Server's performance and scalability. Regular execution of these tests ensures the system maintains high performance as it evolves and scales.

Key benefits:
- **Early Detection**: Identify performance issues before production
- **Capacity Planning**: Understand system limits and scaling needs
- **Regression Prevention**: Catch performance regressions in CI/CD
- **Optimization Guidance**: Data-driven performance improvements

For questions or issues with scale testing, refer to the project documentation or create an issue in the repository.