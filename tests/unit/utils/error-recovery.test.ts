/**
 * @fileoverview Tests for error recovery utilities
 */

import { ErrorRecoveryManager, CircuitBreaker, BulkheadIsolation, HealthMonitor } from '../../../src/utils/error-recovery';
import { BaseServiceError } from '../../../src/utils/errors';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker({
      name: 'test-breaker',
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 1000,
      monitoringPeriod: 5000
    });
  });

  describe('execute', () => {
    it('should execute operation when circuit is closed', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');
      
      const result = await circuitBreaker.execute(mockOperation);
      
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalled();
    });

    it('should open circuit after threshold failures', async () => {
      const mockOperation = jest.fn().mockRejectedValue(new Error('test error'));
      
      // Fail 3 times to open circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(mockOperation);
        } catch (error) {
          // Expected failures
        }
      }
      
      // Circuit should now be open
      await expect(circuitBreaker.execute(mockOperation))
        .rejects.toThrow('Circuit breaker test-breaker is open');
    });

    it('should transition to half-open after timeout', async () => {
      const mockOperation = jest.fn()
        .mockRejectedValueOnce(new Error('error'))
        .mockRejectedValueOnce(new Error('error'))
        .mockRejectedValueOnce(new Error('error'))
        .mockResolvedValue('success');

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(mockOperation);
        } catch (error) {
          // Expected failures
        }
      }

      // Fast-forward time to simulate timeout
      jest.advanceTimersByTime(1100);

      // Should now be able to execute (half-open)
      const result = await circuitBreaker.execute(mockOperation);
      expect(result).toBe('success');
    });

    it('should handle operation timeout', async () => {
      const slowOperation = () => new Promise(resolve => setTimeout(resolve, 2000));
      
      await expect(circuitBreaker.execute(slowOperation))
        .rejects.toThrow('Operation timed out');
    }, 15000);
  });

  describe('getState', () => {
    it('should return current circuit state', () => {
      const state = circuitBreaker.getState();
      
      expect(state).toHaveProperty('state', 'CLOSED');
      expect(state).toHaveProperty('failures', 0);
      expect(state).toHaveProperty('successes', 0);
    });
  });
});

describe('BulkheadIsolation', () => {
  let bulkhead: BulkheadIsolation;

  beforeEach(() => {
    bulkhead = new BulkheadIsolation({
      name: 'test-bulkhead',
      maxConcurrency: 2,
      queueSize: 3,
      timeout: 1000
    });
  });

  describe('execute', () => {
    it('should execute operation when under concurrency limit', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');
      
      const result = await bulkhead.execute(mockOperation);
      
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalled();
    });

    it('should queue operations when at concurrency limit', async () => {
      const mockOperation = jest.fn(() => new Promise(resolve => {
        setTimeout(() => resolve('success'), 100);
      }));

      // Start multiple operations
      const promises = Array(5).fill(0).map(() => bulkhead.execute(mockOperation));
      
      // All should eventually complete
      const results = await Promise.all(promises);
      expect(results).toEqual(Array(5).fill('success'));
      expect(mockOperation).toHaveBeenCalledTimes(5);
    }, 15000);

    it('should reject when queue is full', async () => {
      const longOperation = () => new Promise(resolve => setTimeout(resolve, 1000));

      // Fill up concurrency and queue
      const promises = Array(6).fill(0).map(() => bulkhead.execute(longOperation));
      
      // The 6th operation should be rejected (2 concurrent + 3 queued + 1 overflow)
      await expect(promises[5]).rejects.toThrow('Bulkhead test-bulkhead queue is full');
    });

    it('should handle operation timeout', async () => {
      const slowOperation = () => new Promise(resolve => setTimeout(resolve, 2000));
      
      await expect(bulkhead.execute(slowOperation))
        .rejects.toThrow('Operation timed out');
    }, 15000);
  });

  describe('getStats', () => {
    it('should return bulkhead statistics', () => {
      const stats = bulkhead.getStats();
      
      expect(stats).toHaveProperty('activeRequests', 0);
      expect(stats).toHaveProperty('queueSize', 0);
      expect(stats).toHaveProperty('maxConcurrency', 2);
      expect(stats).toHaveProperty('maxQueueSize', 3);
    });
  });
});

describe('HealthMonitor', () => {
  let healthMonitor: HealthMonitor;

  beforeEach(() => {
    healthMonitor = new HealthMonitor();
  });

  afterEach(() => {
    healthMonitor.shutdown();
  });

  describe('registerHealthCheck', () => {
    it('should register and perform health check', async () => {
      const mockHealthCheck = jest.fn().mockResolvedValue(true);
      
      healthMonitor.registerHealthCheck({
        name: 'test-service',
        check: mockHealthCheck,
        interval: 1000,
        timeout: 500,
        retries: 2
      });

      // Allow initial check to run
      await new Promise(resolve => setTimeout(resolve, 50));
      
      expect(mockHealthCheck).toHaveBeenCalled();
      expect(healthMonitor.isHealthy('test-service')).toBe(true);
    }, 15000);

    it('should handle failing health checks', async () => {
      const mockHealthCheck = jest.fn().mockRejectedValue(new Error('Service down'));
      
      healthMonitor.registerHealthCheck({
        name: 'failing-service',
        check: mockHealthCheck,
        interval: 1000,
        timeout: 500,
        retries: 1
      });

      // Allow check to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(healthMonitor.isHealthy('failing-service')).toBe(false);
    }, 15000);
  });

  describe('isHealthy', () => {
    it('should return overall health status', () => {
      // No health checks registered, should be healthy
      expect(healthMonitor.isHealthy()).toBe(true);
    });

    it('should return specific service health', () => {
      healthMonitor.registerHealthCheck({
        name: 'test-service',
        check: () => Promise.resolve(true),
        interval: 1000,
        timeout: 500,
        retries: 1
      });

      expect(healthMonitor.isHealthy('test-service')).toBe(true);
    });
  });

  describe('getHealthStatus', () => {
    it('should return health status for all services', async () => {
      healthMonitor.registerHealthCheck({
        name: 'service-1',
        check: () => Promise.resolve(true),
        interval: 1000,
        timeout: 500,
        retries: 1
      });

      healthMonitor.registerHealthCheck({
        name: 'service-2',
        check: () => Promise.resolve(false),
        interval: 1000,
        timeout: 500,
        retries: 1
      });

      // Allow checks to complete
      await new Promise(resolve => setTimeout(resolve, 50));

      const status = healthMonitor.getHealthStatus();
      expect(status).toHaveProperty('service-1');
      expect(status).toHaveProperty('service-2');
    }, 15000);
  });
});

describe('ErrorRecoveryManager', () => {
  let errorRecoveryManager: ErrorRecoveryManager;

  beforeEach(() => {
    errorRecoveryManager = new ErrorRecoveryManager();
  });

  afterEach(() => {
    errorRecoveryManager.shutdown();
  });

  describe('executeWithRecovery', () => {
    it('should execute operation successfully', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');
      
      const result = await errorRecoveryManager.executeWithRecovery(mockOperation);
      
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalled();
    });

    it('should retry on recoverable errors', async () => {
      const mockOperation = jest.fn()
        .mockRejectedValueOnce(new Error('database locked'))
        .mockResolvedValueOnce('success');
      
      const result = await errorRecoveryManager.executeWithRecovery(mockOperation, {
        maxRetries: 2,
        baseDelay: 10
      });
      
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(2);
    }, 15000);

    it('should not retry on non-recoverable errors', async () => {
      const mockOperation = jest.fn()
        .mockRejectedValue(new Error('validation failed'));
      
      await expect(errorRecoveryManager.executeWithRecovery(mockOperation, {
        maxRetries: 2
      })).rejects.toThrow('validation failed');
      
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should use circuit breaker when configured', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');
      
      const result = await errorRecoveryManager.executeWithRecovery(mockOperation, {
        circuitBreaker: {
          name: 'test-cb',
          failureThreshold: 3,
          successThreshold: 2,
          timeout: 1000,
          monitoringPeriod: 5000
        }
      });
      
      expect(result).toBe('success');
    });

    it('should use bulkhead when configured', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');
      
      const result = await errorRecoveryManager.executeWithRecovery(mockOperation, {
        bulkhead: {
          name: 'test-bulkhead',
          maxConcurrency: 2,
          queueSize: 3,
          timeout: 1000
        }
      });
      
      expect(result).toBe('success');
    });
  });

  describe('getSystemHealth', () => {
    it('should return system health status', () => {
      const health = errorRecoveryManager.getSystemHealth();
      
      expect(health).toHaveProperty('healthy');
      expect(health).toHaveProperty('services');
      expect(health).toHaveProperty('circuitBreakers');
      expect(health).toHaveProperty('bulkheads');
    });
  });

  describe('addErrorPattern', () => {
    it('should add custom error pattern', async () => {
      errorRecoveryManager.addErrorPattern({
        pattern: /custom error/i,
        recoverable: false,
        skipRetry: true
      });

      const mockOperation = jest.fn()
        .mockRejectedValue(new Error('Custom error occurred'));
      
      await expect(errorRecoveryManager.executeWithRecovery(mockOperation, {
        maxRetries: 2
      })).rejects.toThrow('Custom error occurred');
      
      // Should not retry due to custom pattern
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });
  });

  describe('createCircuitBreaker', () => {
    it('should create and register circuit breaker', () => {
      const config = {
        name: 'test-breaker',
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 1000,
        monitoringPeriod: 5000
      };
      
      const breaker = errorRecoveryManager.createCircuitBreaker(config);
      
      expect(breaker).toBeInstanceOf(CircuitBreaker);
      
      const health = errorRecoveryManager.getSystemHealth();
      expect(health.circuitBreakers).toHaveProperty('test-breaker');
    });
  });

  describe('createBulkhead', () => {
    it('should create and register bulkhead', () => {
      const config = {
        name: 'test-bulkhead',
        maxConcurrency: 2,
        queueSize: 3,
        timeout: 1000
      };
      
      const bulkhead = errorRecoveryManager.createBulkhead(config);
      
      expect(bulkhead).toBeInstanceOf(BulkheadIsolation);
      
      const health = errorRecoveryManager.getSystemHealth();
      expect(health.bulkheads).toHaveProperty('test-bulkhead');
    });
  });
});

// Mock timers for testing
jest.useFakeTimers();