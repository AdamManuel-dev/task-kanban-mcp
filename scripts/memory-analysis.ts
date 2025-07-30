/**
 * @fileoverview Memory usage analysis script
 * @lastmodified 2025-07-28T10:30:00Z
 *
 * Features: Memory profiling, heap analysis, module usage tracking
 * Main APIs: Process memory monitoring, V8 heap profiling
 * Constraints: Node.js runtime required, heapdump optional
 * Patterns: Memory measurement, resource tracking, optimization identification
 */

import * as v8 from 'v8';
import { DatabaseConnection } from '../src/database/connection';

interface MemoryProfile {
  timestamp: number;
  process: NodeJS.MemoryUsage;
  heap: v8.HeapStatistics;
  stage: string;
}

class MemoryAnalyzer {
  private readonly profiles: MemoryProfile[] = [];

  /**
   * Capture memory profile at current state
   */
  captureProfile(stage: string): MemoryProfile {
    const profile: MemoryProfile = {
      timestamp: Date.now(),
      process: process.memoryUsage(),
      heap: v8.getHeapStatistics(),
      stage,
    };

    this.profiles.push(profile);
    return profile;
  }

  /**
   * Format bytes to human readable format
   */
  private static formatBytes(bytes: number): string {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${Math.round((bytes / 1024 ** i) * 100) / 100} ${sizes[i]}`;
  }

  /**
   * Analyze memory usage patterns
   */
  analyzeMemoryUsage(): void {
    // eslint-disable-next-line no-console
    console.log('\n🔍 Memory Usage Analysis');
    // eslint-disable-next-line no-console
    console.log('='.repeat(50));

    this.profiles.forEach((profile, index) => {
      // eslint-disable-next-line no-console
      console.log(`\n📊 Stage ${index + 1}: ${profile.stage}`);
      // eslint-disable-next-line no-console
      console.log(`   RSS: ${MemoryAnalyzer.formatBytes(profile.process.rss)}`);
      // eslint-disable-next-line no-console
      console.log(`   Heap Used: ${MemoryAnalyzer.formatBytes(profile.process.heapUsed)}`);
      // eslint-disable-next-line no-console
      console.log(`   Heap Total: ${MemoryAnalyzer.formatBytes(profile.process.heapTotal)}`);
      // eslint-disable-next-line no-console
      console.log(`   External: ${MemoryAnalyzer.formatBytes(profile.process.external)}`);
      // eslint-disable-next-line no-console
      console.log(`   Array Buffers: ${MemoryAnalyzer.formatBytes(profile.process.arrayBuffers)}`);
    });

    if (this.profiles.length > 1) {
      // eslint-disable-next-line no-console
      console.log('\n📈 Memory Growth Analysis');
      // eslint-disable-next-line no-console
      console.log('-'.repeat(30));

      for (let i = 1; i < this.profiles.length; i++) {
        const prev = this.profiles[i - 1];
        const curr = this.profiles[i];

        const rssGrowth = curr.process.rss - prev.process.rss;
        const heapGrowth = curr.process.heapUsed - prev.process.heapUsed;

        // eslint-disable-next-line no-console
        console.log(`${prev.stage} → ${curr.stage}:`);
        // eslint-disable-next-line no-console
        console.log(`   RSS Growth: ${MemoryAnalyzer.formatBytes(rssGrowth)}`);
        // eslint-disable-next-line no-console
        console.log(`   Heap Growth: ${MemoryAnalyzer.formatBytes(heapGrowth)}`);
      }
    }

    // Analyze heap statistics
    const latestProfile = this.profiles[this.profiles.length - 1];
    // Since we know profiles always has at least one entry when this method is called,
    // the latest profile will always exist
    // eslint-disable-next-line no-console
    console.log('\n🧮 Heap Statistics');
    // eslint-disable-next-line no-console
    console.log('-'.repeat(20));
    // eslint-disable-next-line no-console
    console.log(
      `   Total Heap Size: ${MemoryAnalyzer.formatBytes(latestProfile.heap.total_heap_size as number)}`
    );
    // eslint-disable-next-line no-console
    console.log(
      `   Used Heap Size: ${MemoryAnalyzer.formatBytes(latestProfile.heap.used_heap_size as number)}`
    );
    // eslint-disable-next-line no-console
    console.log(
      `   Heap Size Limit: ${MemoryAnalyzer.formatBytes(latestProfile.heap.heap_size_limit as number)}`
    );
    // eslint-disable-next-line no-console
    console.log(
      `   Malloced Memory: ${MemoryAnalyzer.formatBytes(latestProfile.heap.malloced_memory as number)}`
    );
    // eslint-disable-next-line no-console
    console.log(
      `   Peak Malloced Memory: ${MemoryAnalyzer.formatBytes(latestProfile.heap.peak_malloced_memory as number)}`
    );

    const heapUtilization =
      (latestProfile.heap.used_heap_size / latestProfile.heap.total_heap_size) * 100;
    // eslint-disable-next-line no-console
    console.log(`   Heap Utilization: ${heapUtilization.toFixed(2)}%`);
  }

  /**
   * Generate optimization recommendations
   */
  generateRecommendations(): void {
    const latestProfile = this.profiles[this.profiles.length - 1];
    // Since profiles array always has entries when called, no need to check

    /* eslint-disable no-console */
    console.log('\n💡 Optimization Recommendations');
    console.log('='.repeat(40));

    const rssMB = latestProfile.process.rss / (1024 * 1024);
    const heapMB = latestProfile.process.heapUsed / (1024 * 1024);
    const externalMB = latestProfile.process.external / (1024 * 1024);

    if (rssMB > 100) {
      console.log('🔴 HIGH PRIORITY: RSS exceeds 100MB baseline');
      console.log(`   Current: ${rssMB.toFixed(2)}MB, Target: 100MB`);
      console.log('   Actions: Reduce module imports, optimize database connections');
    }

    if (heapMB > 80) {
      console.log('🟡 MEDIUM PRIORITY: High heap usage');
      console.log(`   Current: ${heapMB.toFixed(2)}MB`);
      console.log('   Actions: Review object retention, implement object pooling');
    }

    if (externalMB > 50) {
      console.log('🟡 MEDIUM PRIORITY: High external memory');
      console.log(`   Current: ${externalMB.toFixed(2)}MB`);
      console.log('   Actions: Review buffer usage, optimize large objects');
    }

    // Analyze growth patterns
    if (this.profiles.length > 1) {
      const totalGrowth = latestProfile.process.rss - this.profiles[0].process.rss;
      const growthMB = totalGrowth / (1024 * 1024);

      if (growthMB > 50) {
        console.log('🔴 HIGH PRIORITY: Excessive memory growth detected');
        console.log(`   Growth: ${growthMB.toFixed(2)}MB`);
        console.log('   Actions: Check for memory leaks, review caching strategies');
      }
    }

    console.log('\n🎯 Specific Optimizations:');
    console.log('   1. Database connection pooling optimization');
    console.log('   2. Reduce TypeScript compilation memory usage');
    console.log('   3. Optimize service instantiation patterns');
    console.log('   4. Implement lazy loading for non-critical modules');
    console.log('   5. Review logging buffer sizes');
    /* eslint-enable no-console */
  }
}

async function main(): Promise<void> {
  const analyzer = new MemoryAnalyzer();

  // eslint-disable-next-line no-console
  console.log('🚀 Starting Memory Analysis...');

  // Baseline measurement
  analyzer.captureProfile('Application Start');

  try {
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      analyzer.captureProfile('After Initial GC');
    }

    // Initialize database
    console.log('📦 Initializing database...');
    const db = DatabaseConnection.getInstance();
    await db.initialize({ skipSchema: false });
    analyzer.captureProfile('After Database Init');

    // Import services dynamically to measure their impact
    console.log('🔧 Loading services...');
    const { TaskService } = await import('../src/services/TaskService');
    const { BoardService } = await import('../src/services/BoardService');
    const { NoteService } = await import('../src/services/NoteService');
    analyzer.captureProfile('After Service Imports');

    // Instantiate services
    const taskService = new TaskService(db);
    const boardService = new BoardService(db);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _noteService = new NoteService(db);
    analyzer.captureProfile('After Service Instantiation');

    // Simulate some basic operations
    console.log('⚡ Running basic operations...');
    const board = await boardService.createBoard({
      name: 'Memory Analysis Test Board',
      description: 'Testing memory usage',
    });
    analyzer.captureProfile('After Board Creation');

    const task = await taskService.createTask({
      title: 'Memory Test Task',
      description: 'Testing task creation memory impact',
      boardId: board.id,
      status: 'todo',
    });
    analyzer.captureProfile('After Task Creation');

    // Clean up
    await taskService.deleteTask(task.id);
    await boardService.deleteBoard(board.id);
    analyzer.captureProfile('After Cleanup');

    if (global.gc) {
      global.gc();
      analyzer.captureProfile('After Final GC');
    }

    await db.close();
    analyzer.captureProfile('After Database Close');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('❌ Error during analysis:', error);
  }

  // Generate analysis
  analyzer.analyzeMemoryUsage();
  analyzer.generateRecommendations();
}

// Run analysis
if (require.main === module) {
  // eslint-disable-next-line no-console
  main().catch(console.error);
}

export { MemoryAnalyzer };
