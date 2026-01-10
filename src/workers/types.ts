/**
 * Multi-Worker System Types
 * Defines interfaces for parallel task execution
 */

export interface SubTask {
  id: string;
  description: string;
  dependencies?: string[]; // IDs of tasks that must complete first
  priority?: number; // Higher priority tasks run first
  estimatedComplexity?: 'low' | 'medium' | 'high';
}

export interface TaskPlan {
  mainGoal: string;
  subtasks: SubTask[];
  parallelGroups: string[][]; // Groups of task IDs that can run in parallel
}

export interface WorkerState {
  id: string;
  status: 'idle' | 'busy' | 'error' | 'stopped';
  currentTask?: SubTask;
  startTime?: Date;
  completedTasks: string[];
  errors: Array<{ taskId: string; error: string }>;
}

export interface TaskResult {
  taskId: string;
  workerId: string;
  success: boolean;
  result?: string;
  error?: string;
  duration: number; // milliseconds
  toolCalls?: number;
}

export interface WorkerPoolConfig {
  maxWorkers: number;
  enableSharedContext: boolean;
  timeoutMs?: number;
  maxTokensPerMinute?: number; // Rate limit in tokens per minute
  enableRateLimiting?: boolean; // Enable/disable rate limiting
}

export interface WorkerMessage {
  type: 'task-start' | 'task-progress' | 'task-complete' | 'task-error';
  workerId: string;
  taskId: string;
  data?: Record<string, unknown>;
}
