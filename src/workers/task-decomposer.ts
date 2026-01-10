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
            content: DECOMPOSITION_PROMPT.replace('User request: {REQUEST}', ''),
          },
          {
            role: 'user',
            content: `User request: ${userRequest}`,
          },
        ],
        temperature: 0.3, // Lower temperature for more consistent planning
      });

      let content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from LLM');
      }

      // Strip markdown code fences if present
      content = content
        .replace(/^```json\n/, '')
        .replace(/^```\n/, '')
        .replace(/\n```$/, '');

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
   *
   * IMPORTANT: This should be VERY conservative to avoid unnecessary LLM calls.
   * Most tasks are better handled by a single agent.
   */
  async shouldDecompose(userRequest: string): Promise<boolean> {
    // Only use multi-worker for CLEARLY parallel tasks
    // Most single tasks should NOT be decomposed (adds 1-3s latency)

    const requestLower = userRequest.toLowerCase();

    // Strong indicators of parallel work (must have at least 2)
    const parallelKeywords = [
      'and also',
      'and then',
      'multiple files',
      'several files',
      'all files',
      'update all',
      'fix all',
      'refactor all',
      'implement multiple',
      'create multiple',
    ];

    // Count how many parallel indicators are present
    let parallelIndicators = 0;
    for (const keyword of parallelKeywords) {
      if (requestLower.includes(keyword)) {
        parallelIndicators += 1;
      }
    }

    // Check for comma-separated lists (strong indicator of multiple items)
    const hasMultipleItems = (userRequest.match(/,/g) || []).length >= 3; // Increased threshold

    // Only decompose if we have strong evidence of parallel work
    // Require BOTH multiple indicators OR a clear list
    return parallelIndicators >= 2 || hasMultipleItems;
  }
}
