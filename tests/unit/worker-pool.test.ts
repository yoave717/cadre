import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WorkerPool } from '../../src/workers/worker-pool.js';
import type { SubTask, WorkerPoolConfig } from '../../src/workers/types.js';

// Mock Agent
// Mock Agent
const mockChatGenerator = vi.fn();
// Default behavior
mockChatGenerator.mockImplementation(async function* () {
  yield { type: 'text_delta', content: 'Task executed' };
  yield { type: 'text_done', content: 'Task executed successfully' };
  yield { type: 'turn_done' };
});

vi.mock('../../src/agent/index.js', () => ({
  Agent: class MockAgent {
    private context?: string;

    setExecutionContext(context: string | undefined) {
      this.context = context;
    }

    getExecutionContext() {
      return this.context;
    }

    async *chat(input: string, signal?: AbortSignal) {
      if (signal?.aborted) {
        throw new Error('Aborted');
      }
      // Delegate to the mock function
      yield* mockChatGenerator(input, signal);
    }
  },
}));

describe('WorkerPool', () => {
  let workerPool: WorkerPool;
  let config: WorkerPoolConfig;

  beforeEach(() => {
    config = {
      maxWorkers: 2,
      enableSharedContext: true,
      timeoutMs: 5000,
    };
    workerPool = new WorkerPool(config);
  });

  describe('initialization', () => {
    it('should create worker pool with given config', () => {
      expect(workerPool).toBeDefined();
      const stats = workerPool.getStats();
      expect(stats.total).toBe(0); // No workers created yet
    });
  });

  describe('task execution', () => {
    it('should execute a single task successfully', async () => {
      const task: SubTask = {
        id: 'task-1',
        description: 'Test task',
        dependencies: [],
        priority: 1,
        estimatedComplexity: 'low',
      };

      const result = await workerPool.executeTask(task);

      expect(result.success).toBe(true);
      expect(result.taskId).toBe('task-1');
      expect(result.workerId).toMatch(/worker-\d+/);
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should create worker on demand', async () => {
      const task: SubTask = {
        id: 'task-1',
        description: 'Test task',
      };

      const statsBefore = workerPool.getStats();
      expect(statsBefore.total).toBe(0);

      await workerPool.executeTask(task);

      const statsAfter = workerPool.getStats();
      expect(statsAfter.total).toBe(1);
      expect(statsAfter.totalTasksCompleted).toBe(1);
    });

    it('should reuse idle workers', async () => {
      const task1: SubTask = {
        id: 'task-1',
        description: 'First task',
      };

      const task2: SubTask = {
        id: 'task-2',
        description: 'Second task',
      };

      await workerPool.executeTask(task1);
      await workerPool.executeTask(task2);

      const stats = workerPool.getStats();
      expect(stats.total).toBe(1); // Reused same worker
      expect(stats.totalTasksCompleted).toBe(2);
    });

    it('should create multiple workers for parallel tasks', async () => {
      const tasks: SubTask[] = [
        { id: 'task-1', description: 'Task 1' },
        { id: 'task-2', description: 'Task 2' },
      ];

      const results = await workerPool.executeParallel(tasks);

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.success)).toBe(true);

      const stats = workerPool.getStats();
      expect(stats.total).toBeLessThanOrEqual(config.maxWorkers);
      expect(stats.totalTasksCompleted).toBe(2);
    });

    it('should respect maxWorkers limit', async () => {
      const tasks: SubTask[] = [
        { id: 'task-1', description: 'Task 1' },
        { id: 'task-2', description: 'Task 2' },
        { id: 'task-3', description: 'Task 3' },
      ];

      await workerPool.executeParallel(tasks);

      const stats = workerPool.getStats();
      expect(stats.total).toBeLessThanOrEqual(config.maxWorkers);
    });
  });

  describe('worker states', () => {
    it('should track worker states correctly', async () => {
      const task: SubTask = {
        id: 'task-1',
        description: 'Test task',
      };

      await workerPool.executeTask(task);

      const states = workerPool.getWorkerStates();
      expect(states).toHaveLength(1);
      expect(states[0].status).toBe('idle');
      expect(states[0].completedTasks).toContain('task-1');
    });

    it('should track completed tasks', async () => {
      const tasks: SubTask[] = [
        { id: 'task-1', description: 'Task 1' },
        { id: 'task-2', description: 'Task 2' },
      ];

      await workerPool.executeParallel(tasks);

      const states = workerPool.getWorkerStates();
      const allCompletedTasks = states.flatMap((s) => s.completedTasks);
      expect(allCompletedTasks).toContain('task-1');
      expect(allCompletedTasks).toContain('task-2');
    });
  });

  describe('statistics', () => {
    it('should provide accurate statistics', async () => {
      const tasks: SubTask[] = [
        { id: 'task-1', description: 'Task 1' },
        { id: 'task-2', description: 'Task 2' },
      ];

      await workerPool.executeParallel(tasks);

      const stats = workerPool.getStats();
      expect(stats.totalTasksCompleted).toBe(2);
      expect(stats.totalErrors).toBe(0);
      expect(stats.idle + stats.busy).toBe(stats.total);
    });
  });

  describe('error handling', () => {
    it('should handle task errors gracefully', async () => {
      // Configure Mock Agent to throw error
      mockChatGenerator.mockImplementationOnce(async function* () {
        yield { type: 'error', message: 'Simulated error' };
      });

      // We don't need to re-mock the module, just change the implementation of the generator spy.

      const pool = new WorkerPool(config);
      const task: SubTask = {
        id: 'task-1',
        description: 'Failing task',
      };

      const result = await pool.executeTask(task);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('shutdown', () => {
    it('should shutdown all workers', async () => {
      const task: SubTask = {
        id: 'task-1',
        description: 'Test task',
      };

      await workerPool.executeTask(task);

      const statsBefore = workerPool.getStats();
      expect(statsBefore.total).toBeGreaterThan(0);

      workerPool.shutdown();

      const statsAfter = workerPool.getStats();
      expect(statsAfter.total).toBe(0);
    });
  });

  describe('worker messages', () => {
    it('should emit worker messages during execution', async () => {
      const messages: any[] = [];
      workerPool.on('worker-message', (msg) => {
        messages.push(msg);
      });

      const task: SubTask = {
        id: 'task-1',
        description: 'Test task',
      };

      await workerPool.executeTask(task);

      expect(messages.length).toBeGreaterThan(0);
      expect(messages.some((m) => m.type === 'task-start')).toBe(true);
      expect(messages.some((m) => m.type === 'task-complete')).toBe(true);
    });
  });
});
