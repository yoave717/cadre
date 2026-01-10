import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import { saveConversation } from '../../src/commands/save.js';
import { getConfig } from '../../src/config.js';

// Mock dependencies
vi.mock('fs');
vi.mock('os');
vi.mock('../../src/agent/index.js');
vi.mock('../../src/config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/config.js')>();
  return {
    ...actual,
    getConfig: vi.fn(),
  };
});

describe('SaveCommand', () => {
  let mockAgent: any;
  let mockHistory: any[];

  beforeEach(() => {
    vi.resetAllMocks();

    // Mock Agent
    mockHistory = [
      { role: 'system', content: 'System prompt', timestamp: 1000 },
      { role: 'user', content: 'Hello', timestamp: 2000 },
      { role: 'assistant', content: 'Hi there', timestamp: 3000 },
    ];

    mockAgent = {
      getHistory: vi.fn().mockReturnValue(mockHistory),
      getTokenEstimate: vi.fn().mockReturnValue(100),
    };

    // Mock OS
    vi.mocked(os.homedir).mockReturnValue('/home/user');

    // Mock Config
    vi.mocked(getConfig).mockReturnValue({
      modelName: 'gpt-4o',
      saveDirectory: undefined,
      openaiApiKey: 'test-key',
      openaiBaseUrl: 'https://api.openai.com',
    });
  });

  it('should generate default filename with timestamp', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    await saveConversation(mockAgent);

    expect(fs.writeFileSync).toHaveBeenCalled();
    const callArgs = vi.mocked(fs.writeFileSync).mock.calls[0];
    const filePath = callArgs[0] as string;

    expect(filePath).toMatch(
      /\/home\/user\/.ai\/conversations\/conversation_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}.*\.md/,
    );
  });

  it('should use custom filename', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    await saveConversation(mockAgent, 'custom-chat');

    expect(fs.writeFileSync).toHaveBeenCalled();
    const filePath = vi.mocked(fs.writeFileSync).mock.calls[0][0] as string;

    expect(filePath).toBe('/home/user/.ai/conversations/custom-chat.md');
  });

  it('should respect configured save directory', async () => {
    vi.mocked(getConfig).mockReturnValue({
      modelName: 'gpt-4o',
      saveDirectory: '/tmp/chats',
      openaiApiKey: 'test-key',
      openaiBaseUrl: 'https://api.openai.com',
    });

    vi.mocked(fs.existsSync).mockReturnValue(true);

    await saveConversation(mockAgent, 'test');

    expect(fs.writeFileSync).toHaveBeenCalled();
    const filePath = vi.mocked(fs.writeFileSync).mock.calls[0][0] as string;

    expect(filePath).toBe('/tmp/chats/test.md');
  });

  it('should handle ~ expansion in save directory', async () => {
    vi.mocked(getConfig).mockReturnValue({
      modelName: 'gpt-4o',
      saveDirectory: '~/my-chats',
      openaiApiKey: 'test-key',
      openaiBaseUrl: 'https://api.openai.com',
    });

    vi.mocked(fs.existsSync).mockReturnValue(true);

    await saveConversation(mockAgent, 'test');

    expect(filePathStr(vi.mocked(fs.writeFileSync).mock.calls[0][0])).toBe(
      '/home/user/my-chats/test.md',
    );
  });

  it('should create directory if it does not exist', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    await saveConversation(mockAgent);

    expect(fs.mkdirSync).toHaveBeenCalledWith('/home/user/.ai/conversations', { recursive: true });
  });

  it('should format content correctly', async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);

    await saveConversation(mockAgent);

    const content = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;

    expect(content).toContain('# Conversation Log');
    expect(content).toContain('**Messages:** 2'); // System filtered out
    expect(content).toContain('### USER');
    expect(content).toContain('Hello');
    expect(content).toContain('### ASSISTANT');
    expect(content).toContain('Hi there');
  });
});

function filePathStr(path: fs.PathOrFileDescriptor): string {
  return path.toString();
}
