import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskDecomposer } from '../../src/workers/task-decomposer.js';

// Mock OpenAI
vi.mock('openai', () => ({
  default: class MockOpenAI {
    chat = {
      completions: {
        create: vi.fn(),
      },
    };
  },
}));

// Mock config
vi.mock('../../src/config.js', () => ({
  getConfig: () => ({
    openaiApiKey: 'test-key',
    openaiBaseUrl: 'https://api.openai.com/v1',
    modelName: 'gpt-4',
  }),
}));

describe('TaskDecomposer', () => {
  let decomposer: TaskDecomposer;

  beforeEach(() => {
    decomposer = new TaskDecomposer();
  });

  describe('shouldDecompose', () => {
    it('should return true for complex multi-step requests', async () => {
      const request = 'Refactor the authentication module and update all tests';
      const result = await decomposer.shouldDecompose(request);
      expect(result).toBe(true);
    });

    it('should return true for requests with multiple items', async () => {
      const request = 'Update file1.ts, file2.ts, and file3.ts';
      const result = await decomposer.shouldDecompose(request);
      expect(result).toBe(true);
    });

    it('should return false for simple requests', async () => {
      const request = 'Read the config file';
      const result = await decomposer.shouldDecompose(request);
      expect(result).toBe(false);
    });

    it('should return true for requests with "and also"', async () => {
      const request = 'Fix the bug and also run the tests';
      const result = await decomposer.shouldDecompose(request);
      expect(result).toBe(true);
    });

    it('should return true for "update all" requests', async () => {
      const request = 'Update all TypeScript files with the new API';
      const result = await decomposer.shouldDecompose(request);
      expect(result).toBe(true);
    });
  });

  describe('decompose', () => {
    it('should return a valid task plan for successful API response', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                mainGoal: 'Refactor authentication',
                subtasks: [
                  {
                    id: 'task-1',
                    description: 'Update auth module',
                    dependencies: [],
                    priority: 1,
                    estimatedComplexity: 'medium',
                  },
                  {
                    id: 'task-2',
                    description: 'Update tests',
                    dependencies: ['task-1'],
                    priority: 2,
                    estimatedComplexity: 'low',
                  },
                ],
                parallelGroups: [['task-1'], ['task-2']],
              }),
            },
          },
        ],
      };

      // Mock the OpenAI client
      const mockCreate = vi.fn().mockResolvedValue(mockResponse);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (decomposer as any).client = {
        chat: {
          completions: {
            create: mockCreate,
          },
        },
      };

      const plan = await decomposer.decompose('Refactor authentication');

      expect(plan.mainGoal).toBe('Refactor authentication');
      expect(plan.subtasks).toHaveLength(2);
      expect(plan.subtasks[0].id).toBe('task-1');
      expect(plan.subtasks[1].dependencies).toContain('task-1');
      expect(plan.parallelGroups).toHaveLength(2);
    });

    it('should return fallback plan on API error', async () => {
      // Mock API error
      const mockCreate = vi.fn().mockRejectedValue(new Error('API Error'));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (decomposer as any).client = {
        chat: {
          completions: {
            create: mockCreate,
          },
        },
      };

      const plan = await decomposer.decompose('Simple task');

      expect(plan.mainGoal).toBe('Simple task');
      expect(plan.subtasks).toHaveLength(1);
      expect(plan.subtasks[0].description).toBe('Simple task');
      expect(plan.parallelGroups).toEqual([['task-1']]);
    });

    it('should validate task plan and detect duplicate IDs', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                mainGoal: 'Test',
                subtasks: [
                  { id: 'task-1', description: 'Task 1', dependencies: [] },
                  { id: 'task-1', description: 'Task 2', dependencies: [] }, // Duplicate!
                ],
                parallelGroups: [['task-1']],
              }),
            },
          },
        ],
      };

      const mockCreate = vi.fn().mockResolvedValue(mockResponse);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (decomposer as any).client = {
        chat: {
          completions: {
            create: mockCreate,
          },
        },
      };

      // Should fall back to safe plan due to validation error
      const plan = await decomposer.decompose('Test');
      expect(plan.subtasks).toHaveLength(1); // Fallback plan
    });

    it('should validate task plan and detect missing dependencies', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                mainGoal: 'Test',
                subtasks: [
                  { id: 'task-1', description: 'Task 1', dependencies: ['task-999'] }, // Non-existent!
                ],
                parallelGroups: [['task-1']],
              }),
            },
          },
        ],
      };

      const mockCreate = vi.fn().mockResolvedValue(mockResponse);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (decomposer as any).client = {
        chat: {
          completions: {
            create: mockCreate,
          },
        },
      };

      // Should fall back to safe plan due to validation error
      const plan = await decomposer.decompose('Test');
      expect(plan.subtasks).toHaveLength(1); // Fallback plan
    });

    it('should detect circular dependencies', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                mainGoal: 'Test',
                subtasks: [
                  { id: 'task-1', description: 'Task 1', dependencies: ['task-2'] },
                  { id: 'task-2', description: 'Task 2', dependencies: ['task-1'] }, // Circular!
                ],
                parallelGroups: [['task-1', 'task-2']],
              }),
            },
          },
        ],
      };

      const mockCreate = vi.fn().mockResolvedValue(mockResponse);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (decomposer as any).client = {
        chat: {
          completions: {
            create: mockCreate,
          },
        },
      };

      // Should fall back to safe plan due to circular dependency
      const plan = await decomposer.decompose('Test');
      expect(plan.subtasks).toHaveLength(1); // Fallback plan
    });
  });
});
