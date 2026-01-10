/**
 * Task Coordinator
 * Orchestrates multi-worker parallel task execution
 */

import { TaskDecomposer } from './task-decomposer.js';
import { WorkerPool } from './worker-pool.js';
import type { TaskPlan, SubTask, TaskResult, WorkerPoolConfig, WorkerMessage } from './types.js';
import chalk from 'chalk';

export interface CoordinatorConfig extends WorkerPoolConfig {
  verbose?: boolean;
  onProgress?: (message: string) => void;
}

export interface ExecutionSummary {
  plan: TaskPlan;
  results: TaskResult[];
  totalDuration: number;
  successCount: number;
  failureCount: number;
  workersUsed: number;
}

export class TaskCoordinator {
  private decomposer: TaskDecomposer;
  private pool: WorkerPool;
  private config: CoordinatorConfig;

  constructor(config: CoordinatorConfig) {
    this.config = config;
    this.decomposer = new TaskDecomposer();
    this.pool = new WorkerPool(config);

    // Listen to worker messages for progress updates
    this.pool.on('worker-message', (message: WorkerMessage) => {
      this.handleWorkerMessage(message);
    });
  }

  /**
   * Execute a user request with automatic task decomposition and parallel execution
   */
  async execute(userRequest: string): Promise<ExecutionSummary> {
    const startTime = Date.now();

    this.log(chalk.cyan('🧠 Analyzing request and planning tasks...'));

    // Decompose the request into a task plan
    const plan = await this.decomposer.decompose(userRequest);

    this.log(chalk.green(`✓ Created plan with ${plan.subtasks.length} subtasks`));
    this.log(chalk.gray(`  Main goal: ${plan.mainGoal}`));

    if (this.config.verbose) {
      this.logPlan(plan);
    }

    // Execute tasks according to parallel groups
    const results = await this.executeTaskPlan(plan);

    const totalDuration = Date.now() - startTime;
    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    this.log(
      chalk.green(
        `\n✓ Completed in ${(totalDuration / 1000).toFixed(2)}s: ${successCount} succeeded, ${failureCount} failed`,
      ),
    );

    return {
      plan,
      results,
      totalDuration,
      successCount,
      failureCount,
      workersUsed: this.pool.getStats().total,
    };
  }

  /**
   * Execute a task plan following the parallel groups
   */
  private async executeTaskPlan(plan: TaskPlan): Promise<TaskResult[]> {
    const taskMap = new Map(plan.subtasks.map((t) => [t.id, t]));
    const allResults: TaskResult[] = [];
    const completedTaskIds = new Set<string>();

    // Execute each parallel group sequentially
    for (let i = 0; i < plan.parallelGroups.length; i++) {
      const group = plan.parallelGroups[i];
      this.log(chalk.cyan(`\n⚡ Executing parallel group ${i + 1}/${plan.parallelGroups.length}`));
      this.log(chalk.gray(`  Tasks: ${group.length}`));

      // Get tasks for this group
      const tasksToExecute = group
        .map((taskId) => taskMap.get(taskId))
        .filter((t): t is SubTask => t !== undefined);

      // Check dependencies are satisfied
      for (const task of tasksToExecute) {
        if (task.dependencies) {
          const unsatisfied = task.dependencies.filter((depId) => !completedTaskIds.has(depId));
          if (unsatisfied.length > 0) {
            this.log(
              chalk.yellow(
                `  ⚠️  Warning: Task ${task.id} has unsatisfied dependencies: ${unsatisfied.join(', ')}`,
              ),
            );
          }
        }
      }

      // Execute tasks in parallel
      const groupResults = await this.pool.executeParallel(tasksToExecute);

      // Mark successful tasks as completed
      for (const result of groupResults) {
        if (result.success) {
          completedTaskIds.add(result.taskId);
        }
      }

      allResults.push(...groupResults);

      // Show group summary
      const groupSuccess = groupResults.filter((r) => r.success).length;
      const groupFailed = groupResults.filter((r) => !r.success).length;
      this.log(chalk.gray(`  ✓ Group complete: ${groupSuccess} succeeded, ${groupFailed} failed`));
    }

    return allResults;
  }

  /**
   * Check if a request should use multi-worker execution
   */
  async shouldUseMultiWorker(userRequest: string): Promise<boolean> {
    return this.decomposer.shouldDecompose(userRequest);
  }

  /**
   * Get current worker pool statistics
   */
  getStats() {
    return this.pool.getStats();
  }

  /**
   * Shutdown the coordinator and all workers
   */
  shutdown(): void {
    this.pool.shutdown();
  }

  /**
   * Handle worker messages for progress updates
   */
  private handleWorkerMessage(message: WorkerMessage): void {
    if (!this.config.verbose) return;

    switch (message.type) {
      case 'task-start':
        this.log(chalk.blue(`  → ${message.workerId}: Starting ${message.taskId}`));
        if (message.data?.description) {
          this.log(chalk.gray(`    "${message.data.description}"`));
        }
        break;

      case 'task-progress':
        if (message.data?.tool) {
          this.log(chalk.gray(`    ${message.workerId}: Using tool ${message.data.tool}`));
        }
        break;

      case 'task-complete': {
        const duration =
          message.data?.duration && typeof message.data.duration === 'number'
            ? ` in ${(message.data.duration / 1000).toFixed(2)}s`
            : '';
        const toolCalls =
          message.data?.toolCalls && typeof message.data.toolCalls === 'number'
            ? `, ${message.data.toolCalls} tool calls`
            : '';
        this.log(
          chalk.green(
            `  ✓ ${message.workerId}: Completed ${message.taskId}${duration}${toolCalls}`,
          ),
        );
        break;
      }

      case 'task-error':
        this.log(chalk.red(`  ✗ ${message.workerId}: Failed ${message.taskId}`));
        if (message.data?.error) {
          this.log(chalk.red(`    Error: ${message.data.error}`));
        }
        break;
    }
  }

  /**
   * Log a message if onProgress callback is provided
   */
  private log(message: string): void {
    if (this.config.onProgress) {
      this.config.onProgress(message);
    }
  }

  /**
   * Log the task plan details
   */
  private logPlan(plan: TaskPlan): void {
    this.log(chalk.cyan('\n📋 Task Plan:'));
    for (let i = 0; i < plan.parallelGroups.length; i++) {
      const group = plan.parallelGroups[i];
      this.log(chalk.gray(`  Group ${i + 1} (${group.length} tasks in parallel):`));
      for (const taskId of group) {
        const task = plan.subtasks.find((t) => t.id === taskId);
        if (task) {
          const deps = task.dependencies?.length
            ? ` [depends on: ${task.dependencies.join(', ')}]`
            : '';
          const complexity = task.estimatedComplexity ? ` [${task.estimatedComplexity}]` : '';
          this.log(chalk.gray(`    • ${task.id}: ${task.description}${deps}${complexity}`));
        }
      }
    }
  }

  /**
   * Format execution summary for display
   */
  formatSummary(summary: ExecutionSummary): string {
    const lines = [
      chalk.bold('\n📊 Execution Summary'),
      chalk.gray('─'.repeat(50)),
      `Main Goal: ${summary.plan.mainGoal}`,
      `Total Tasks: ${summary.plan.subtasks.length}`,
      `Workers Used: ${summary.workersUsed}`,
      `Duration: ${(summary.totalDuration / 1000).toFixed(2)}s`,
      `Success: ${chalk.green(summary.successCount.toString())}`,
      `Failed: ${summary.failureCount > 0 ? chalk.red(summary.failureCount.toString()) : '0'}`,
      chalk.gray('─'.repeat(50)),
    ];

    // Add individual task results
    if (this.config.verbose) {
      lines.push(chalk.bold('\nTask Results:'));
      for (const result of summary.results) {
        const status = result.success ? chalk.green('✓') : chalk.red('✗');
        const duration = `${(result.duration / 1000).toFixed(2)}s`;
        const task = summary.plan.subtasks.find((t) => t.id === result.taskId);
        const description = task?.description || result.taskId;
        lines.push(`${status} ${description} (${duration}, ${result.workerId})`);
        if (!result.success && result.error) {
          lines.push(chalk.red(`  Error: ${result.error}`));
        }
      }
    }

    return lines.join('\n');
  }
}
