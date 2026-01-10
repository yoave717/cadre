import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Agent } from '../../src/agent/index.js';
import { getClient } from '../../src/client.js';

// Mock client
vi.mock('../../src/client.js', () => ({
  getClient: vi.fn(),
}));

vi.mock('../../src/config.js', () => ({
  getConfig: () => ({
    modelName: 'test-model',
    openaiBaseUrl: 'http://test',
    openaiApiKey: 'test-key',
  }),
}));

vi.mock('../../src/context/index.js', () => ({
  getContextManager: () => ({
    needsCompression: () => false,
    compressContext: vi.fn(),
    truncateToolResult: (res: string) => res,
    clearSummary: vi.fn(),
  }),
  estimateConversationTokens: () => 10,
  ContextManager: class {},
}));

describe('Agent Abort Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should pass signal to client', async () => {
    const mockCreate = vi.fn().mockImplementation(async function* () {
      yield { choices: [{ delta: { content: 'chunk1' } }] };
    });
    (getClient as any).mockReturnValue({
      chat: { completions: { create: mockCreate } },
    });

    const agent = new Agent();
    const controller = new AbortController();

    // Consume generator
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of agent.chat('test', controller.signal)) {
      // do nothing
    }

    expect(mockCreate).toHaveBeenCalled();
    const args = mockCreate.mock.calls[0];

    // Check streaming enabled
    expect(args[0]).toEqual(
      expect.objectContaining({
        stream: true,
      }),
    );

    // Check signal
    expect(args[1]).toEqual({ signal: controller.signal });
  });
});
