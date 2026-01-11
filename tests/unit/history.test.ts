import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Agent } from '../../src/agent/index.js';
import { getClient } from '../../src/client.js';

// Mock dependencies
vi.mock('../../src/client.js', () => ({
  getClient: vi.fn(),
}));

vi.mock('../../src/config.js', () => ({
  getConfig: vi.fn().mockReturnValue({
    modelName: 'test-model',
    openaiBaseUrl: 'http://localhost',
  }),
  usesMaxTokens: () => false,
}));

vi.mock('../../src/context/index.js', () => ({
  getContextManager: vi.fn().mockReturnValue({
    needsCompression: vi.fn().mockReturnValue(false),
    getStats: vi.fn(),
    clearSummary: vi.fn(),
    truncateToolResult: vi.fn((r) => r),
  }),
  estimateConversationTokens: vi.fn().mockReturnValue(100),
}));

describe('Agent History', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with system prompt and timestamp', () => {
    const agent = new Agent();
    const history = agent.getHistory();

    expect(history.length).toBe(1);
    expect(history[0].role).toBe('system');
    expect(history[0].timestamp).toBeDefined();
    expect(typeof history[0].timestamp).toBe('number');
    // Sanity check timestamp is recent
    expect(Date.now() - history[0].timestamp).toBeLessThan(1000);
  });

  it('should clear history correctly', () => {
    const agent = new Agent();
    agent.clearHistory();

    const history = agent.getHistory();
    expect(history.length).toBe(1);
    expect(history[0].role).toBe('system');
    expect(history[0].timestamp).toBeDefined();
  });

  it('should add user message with new timestamp', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        yield { choices: [{ delta: { content: 'AI Response' } }] };
      },
    });

    (getClient as any).mockReturnValue({
      chat: { completions: { create: mockCreate } },
    });

    const agent = new Agent();
    // Simulate chat
    const iterator = agent.chat('User Message');
    // Consume iterator
    for await (const chunk of iterator) {
      void chunk;
    }

    const history = agent.getHistory();
    // 0: System, 1: User, 2: Assistant
    expect(history.length).toBe(3);

    // Check User message
    expect(history[1].role).toBe('user');
    expect(history[1].content).toBe('User Message');
    expect(history[1].timestamp).toBeDefined();

    // Check Assistant message
    expect(history[2].role).toBe('assistant');
    expect(history[2].content).toBe('AI Response');
    expect(history[2].timestamp).toBeDefined();
  });
});
