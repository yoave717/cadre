/**
 * Worker Pool
 * Manages multiple Agent instances for parallel task execution
 */

import { Agent } from '../agent/index.js';
import type { WorkerState, SubTask, TaskResult, WorkerPoolConfig, WorkerMessage } from './types.js';
import { EventEmitter } from 'events';

interface WorkerInstance {
  id: string;
  agent: Agent;
  state: WorkerState;
  abortController?: AbortController;
}

export class WorkerPool extends EventEmitter {
  private workers: Map<string, WorkerInstance> = new Map();
  private config: WorkerPoolConfig;
  private nextWorkerId = 1;

  constructor(config: WorkerPoolConfig) {
    super();
    this.config = config;
  }

  /**
   * Create a new worker
   */
  private createWorker(): WorkerInstance {
    const workerId = `worker-${this.nextWorkerId++}`;
    const systemPrompt = `You are Cadre Worker ${workerId}, working as part of a team of parallel workers.

Your role: Execute your assigned task independently and efficiently.

Guidelines:
- Focus ONLY on your specific assigned task
- Read files before modifying them
- Use tools appropriately for your task
- Be concise in your responses
- Report completion clearly

Remember: Other workers are handling other tasks in parallel. Don't worry about tasks outside your assignment.`;

    const agent = new Agent(systemPrompt);
    const state: WorkerState = {
      id: workerId,
      status: 'idle',
      completedTasks: [],
      errors: [],
    };

    const worker: WorkerInstance = {
      id: workerId,
      agent,
      state,
    };

    this.workers.set(workerId, worker);
    return worker;
  }

  /**
   * Get an idle worker or create a new one if under max limit
   */
  private getAvailableWorker(): WorkerInstance | null {
    // First, try to find an idle worker
    for (const worker of this.workers.values()) {
      if (worker.state.status === 'idle') {
        return worker;
      }
    }

    // If no idle workers and under max limit, create a new one
    if (this.workers.size < this.config.maxWorkers) {
      return this.createWorker();
    }

    // All workers busy and at max capacity
    return null;
  }

  /**
   * Execute a single task on an available worker
   */
  async executeTask(task: SubTask): Promise<TaskResult> {
    const worker = this.getAvailableWorker();
    if (!worker) {
      throw new Error('No available workers');
    }

    const startTime = Date.now();
    worker.state.status = 'busy';
    worker.state.currentTask = task;
    worker.state.startTime = new Date();

    // Create abort controller for timeout
    worker.abortController = new AbortController();
    const timeoutId = this.config.timeoutMs
      ? setTimeout(() => worker.abortController?.abort(), this.config.timeoutMs)
      : null;

    this.emitWorkerMessage({
      type: 'task-start',
      workerId: worker.id,
      taskId: task.id,
      data: { description: task.description },
    });

    try {
      let fullResponse = '';
      let toolCallCount = 0;

      // Execute the task via the agent
      const stream = worker.agent.chat(
        `Execute this task: ${task.description}`,
        worker.abortController.signal,
      );

      for await (const event of stream) {
        switch (event.type) {
          case 'text_delta':
            fullResponse += event.content;
            break;
          case 'text_done':
            fullResponse = event.content;
            break;
          case 'tool_call':
            toolCallCount++;
            this.emitWorkerMessage({
              type: 'task-progress',
              workerId: worker.id,
              taskId: task.id,
              data: { tool: event.name, args: event.args },
            });
            break;
          case 'error':
            throw new Error(event.message);
        }
      }

      const duration = Date.now() - startTime;
      worker.state.completedTasks.push(task.id);
      worker.state.status = 'idle';
      worker.state.currentTask = undefined;

      if (timeoutId) clearTimeout(timeoutId);

      const result: TaskResult = {
        taskId: task.id,
        workerId: worker.id,
        success: true,
        result: fullResponse,
        duration,
        toolCalls: toolCallCount,
      };

      this.emitWorkerMessage({
        type: 'task-complete',
        workerId: worker.id,
        taskId: task.id,
        data: { duration, toolCalls: toolCallCount },
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      worker.state.status = 'error';
      worker.state.errors.push({ taskId: task.id, error: errorMessage });
      worker.state.currentTask = undefined;

      if (timeoutId) clearTimeout(timeoutId);

      this.emitWorkerMessage({
        type: 'task-error',
        workerId: worker.id,
        taskId: task.id,
        data: { error: errorMessage },
      });

      return {
        taskId: task.id,
        workerId: worker.id,
        success: false,
        error: errorMessage,
        duration,
      };
    }
  }

  /**
   * Execute multiple tasks in parallel
   */
  async executeParallel(tasks: SubTask[]): Promise<TaskResult[]> {
    const promises = tasks.map((task) => this.executeTask(task));
    return Promise.all(promises);
  }

  /**
   * Get status of all workers
   */
  getWorkerStates(): WorkerState[] {
    return Array.from(this.workers.values()).map((w) => ({ ...w.state }));
  }

  /**
   * Stop a specific worker
   */
  stopWorker(workerId: string): boolean {
    const worker = this.workers.get(workerId);
    if (!worker) return false;

    if (worker.abortController) {
      worker.abortController.abort();
    }

    worker.state.status = 'stopped';
    return true;
  }

  /**
   * Stop all workers and clean up
   */
  shutdown(): void {
    for (const worker of this.workers.values()) {
      if (worker.abortController) {
        worker.abortController.abort();
      }
    }
    this.workers.clear();
  }

  /**
   * Emit worker messages for monitoring
   */
  private emitWorkerMessage(message: WorkerMessage): void {
    this.emit('worker-message', message);
  }

  /**
   * Get statistics about the worker pool
   */
  getStats() {
    const states = this.getWorkerStates();
    return {
      total: states.length,
      idle: states.filter((s) => s.status === 'idle').length,
      busy: states.filter((s) => s.status === 'busy').length,
      error: states.filter((s) => s.status === 'error').length,
      stopped: states.filter((s) => s.status === 'stopped').length,
      totalTasksCompleted: states.reduce((sum, s) => sum + s.completedTasks.length, 0),
      totalErrors: states.reduce((sum, s) => sum + s.errors.length, 0),
    };
  }
}
