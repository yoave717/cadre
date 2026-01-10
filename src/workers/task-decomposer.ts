/**
 * Task Decomposer
 * Uses LLM to decompose complex tasks into parallel subtasks
 */

import OpenAI from 'openai';
import type { TaskPlan, SubTask } from './types.js';
import { getConfig } from '../config.js';

const DECOMPOSITION_PROMPT = `You are a task planning assistant. Your job is to analyze a user's request and break it down into concrete, independent subtasks that can be executed in parallel when possible.

Guidelines:
1. Each subtask should be specific and actionable
2. Identify which tasks can run in parallel (no dependencies between them)
3. Identify which tasks must run sequentially (dependencies)
4. Keep subtasks focused and atomic
5. Estimate complexity: low (simple operations), medium (moderate work), high (complex analysis/changes)

Respond with a JSON object matching this structure:
{
  "mainGoal": "Brief description of the overall goal",
  "subtasks": [
    {
      "id": "task-1",
      "description": "Specific task description",
      "dependencies": [], // List of task IDs that must complete first (empty if no dependencies)
      "priority": 1, // Higher number = higher priority
      "estimatedComplexity": "low" | "medium" | "high"
    }
  ],
  "parallelGroups": [
    ["task-1", "task-2"], // These tasks can run in parallel
    ["task-3"] // This task runs after group 1 completes
  ]
}

User request: {REQUEST}`;

export class TaskDecomposer {
  private client: OpenAI;

  constructor() {
    const config = getConfig();
    this.client = new OpenAI({
      apiKey: config.openaiApiKey,
      baseURL: config.openaiBaseUrl,
    });
  }

  /**
   * Decompose a user request into a task plan
   */
  async decompose(userRequest: string): Promise<TaskPlan> {
    const config = getConfig();

    try {
      const response = await this.client.chat.completions.create({
        model: config.modelName,
        messages: [
          {
            role: 'system',
            content: DECOMPOSITION_PROMPT.replace('{REQUEST}', userRequest),
          },
        ],
        temperature: 0.3, // Lower temperature for more consistent planning
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from LLM');
      }

      const plan = JSON.parse(content) as TaskPlan;

      // Validate the plan
      this.validatePlan(plan);

      return plan;
    } catch (error) {
      console.error('Error decomposing task:', error);

      // Fallback: treat as single task
      return {
        mainGoal: userRequest,
        subtasks: [
          {
            id: 'task-1',
            description: userRequest,
            dependencies: [],
            priority: 1,
            estimatedComplexity: 'medium',
          },
        ],
        parallelGroups: [['task-1']],
      };
    }
  }

  /**
   * Validate that a task plan is well-formed
   */
  private validatePlan(plan: TaskPlan): void {
    if (!plan.subtasks || plan.subtasks.length === 0) {
      throw new Error('Plan must have at least one subtask');
    }

    // Check all task IDs are unique
    const ids = new Set<string>();
    for (const task of plan.subtasks) {
      if (ids.has(task.id)) {
        throw new Error(`Duplicate task ID: ${task.id}`);
      }
      ids.add(task.id);
    }

    // Check all dependencies exist
    for (const task of plan.subtasks) {
      if (task.dependencies) {
        for (const depId of task.dependencies) {
          if (!ids.has(depId)) {
            throw new Error(`Task ${task.id} depends on non-existent task ${depId}`);
          }
        }
      }
    }

    // Check parallel groups reference valid tasks
    if (plan.parallelGroups) {
      for (const group of plan.parallelGroups) {
        for (const taskId of group) {
          if (!ids.has(taskId)) {
            throw new Error(`Parallel group references non-existent task ${taskId}`);
          }
        }
      }
    }

    // Check for circular dependencies
    this.detectCircularDependencies(plan.subtasks);
  }

  /**
   * Detect circular dependencies in task graph
   */
  private detectCircularDependencies(tasks: SubTask[]): void {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const taskMap = new Map(tasks.map((t) => [t.id, t]));

    const hasCycle = (taskId: string): boolean => {
      if (recursionStack.has(taskId)) {
        return true; // Found a cycle
      }
      if (visited.has(taskId)) {
        return false; // Already checked this path
      }

      visited.add(taskId);
      recursionStack.add(taskId);

      const task = taskMap.get(taskId);
      if (task?.dependencies) {
        for (const depId of task.dependencies) {
          if (hasCycle(depId)) {
            return true;
          }
        }
      }

      recursionStack.delete(taskId);
      return false;
    };

    for (const task of tasks) {
      if (hasCycle(task.id)) {
        throw new Error(`Circular dependency detected involving task ${task.id}`);
      }
    }
  }

  /**
   * Check if a request would benefit from multi-worker execution
   * Returns true if the request is complex enough to warrant decomposition
   */
  async shouldDecompose(userRequest: string): Promise<boolean> {
    // Heuristics for when to use multi-worker:
    // 1. Request contains "and" or "also" suggesting multiple tasks
    // 2. Request is long (>100 chars) suggesting complexity
    // 3. Request mentions multiple files/components
    // 4. Request uses words like "refactor", "update all", "fix multiple"

    const keywords = [
      'and also',
      'and then',
      'multiple',
      'several',
      'all files',
      'refactor',
      'update all',
      'fix all',
      'implement multiple',
    ];

    const requestLower = userRequest.toLowerCase();
    const hasKeywords = keywords.some((kw) => requestLower.includes(kw));
    const isLong = userRequest.length > 100;
    const hasMultipleItems = (userRequest.match(/,/g) || []).length >= 2;

    return hasKeywords || (isLong && hasMultipleItems);
  }
}
