import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Agent } from '../../src/agent/index.js';

// Mock client and config
vi.mock('../../src/client.js', () => ({
  getClient: vi.fn(),
}));

vi.mock('../../src/config.js', () => ({
  getConfig: vi.fn().mockReturnValue({
    modelName: 'gpt-4o',
    tokenCostInput: 5.0,
    tokenCostOutput: 15.0,
    maxSessionTokens: 0,
  }),
}));

describe('Agent Token Usage', () => {
  let agent: Agent;

  beforeEach(() => {
    vi.clearAllMocks();
    agent = new Agent();
  });

  it('should initialize with zero usage', () => {
    const usage = agent.getSessionUsage();
    expect(usage).toEqual({ input: 0, output: 0, total: 0, cost: 0 });
  });

  // Note: Testing the chat loop requires complex mocking of the async generator and OpenAI stream.
  // For now, we verify the interface and initialization.
  // Ideally, we would mock the OpenAI client response with chunks containing usage data.
});
