import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Agent } from '../../src/agent/index.js';
import { setConfig, clearConfig } from '../../src/config.js';

describe('System Prompt Feature', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearConfig();
  });

  it('should initialize with default system prompt', () => {
    const agent = new Agent();
    expect(agent.getSystemPrompt()).toContain('You are Cadre');
    const history = agent.getHistory();
    expect(history[0].role).toBe('system');
    expect(history[0].content).toContain('You are Cadre');
  });

  it('should initialize with custom system prompt from constructor', () => {
    const customPrompt = 'You are a pirate AI.';
    const agent = new Agent(customPrompt);
    expect(agent.getSystemPrompt()).toBe(customPrompt);
    const history = agent.getHistory();
    expect(history[0].content).toBe(customPrompt);
  });

  it('should initialize with custom system prompt from config', () => {
    setConfig('systemPrompt', 'You are a config AI.');
    const agent = new Agent();
    expect(agent.getSystemPrompt()).toBe('You are a config AI.');
    const history = agent.getHistory();
    expect(history[0].content).toBe('You are a config AI.');
  });

  it('should prioritize constructor argument over config', () => {
    setConfig('systemPrompt', 'You are a config AI.');
    const agent = new Agent('You are a constructor AI.');
    expect(agent.getSystemPrompt()).toBe('You are a constructor AI.');
  });

  it('should update system prompt and modify history', () => {
    const agent = new Agent();
    const newPrompt = 'New system instructions.';
    agent.updateSystemPrompt(newPrompt);
    expect(agent.getSystemPrompt()).toBe(newPrompt);

    const history = agent.getHistory();
    expect(history[0].role).toBe('system');
    expect(history[0].content).toBe(newPrompt);
  });

  it('should throw error if system prompt exceeds 2000 characters', () => {
    const agent = new Agent();
    const longPrompt = 'a'.repeat(2001);
    expect(() => agent.updateSystemPrompt(longPrompt)).toThrow(
      'System prompt exceeds 2000 characters',
    );
  });

  it('clearHistory should restore the current system prompt', () => {
    const agent = new Agent('Initial prompt');
    agent.updateSystemPrompt('Updated prompt');

    agent.clearHistory();

    const history = agent.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].role).toBe('system');
    expect(history[0].content).toBe('Updated prompt');
  });
});
