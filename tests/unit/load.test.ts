import { describe, it, expect } from 'vitest';
import { parseConversation } from '../../src/commands/load.js';

describe('parseConversation', () => {
  it('should parse a simple conversation with user and assistant', () => {
    const markdown = `# Conversation Log
...header...
---

### USER (2023-01-01T12:00:00.000Z)

Hello world

---

### ASSISTANT (2023-01-01T12:00:01.000Z)

Hi there!

---
`;
    const history = parseConversation(markdown);
    expect(history).toHaveLength(2);
    expect(history[0].role).toBe('user');
    expect(history[0].content).toBe('Hello world');
    expect(history[1].role).toBe('assistant');
    expect(history[1].content).toBe('Hi there!');
    expect(history[0].timestamp).toBeDefined();
  });

  it('should parse tool calls and outputs', () => {
    const markdown = `# Header
---

### ASSISTANT (2024-01-01T00:00:00.000Z)

Searching...

\`Tool Call: grep_search\`
\`\`\`json
{"query": "foo", "path": "src"}
\`\`\`

---

### TOOL (2024-01-01T00:00:01.000Z)

\`Tool Output\`
\`\`\`
Found foo in bar.ts
\`\`\`

---
`;
    const history = parseConversation(markdown);
    expect(history).toHaveLength(2);
    
    // Assistant with tool call
    const assistant = history[0];
    expect(assistant.role).toBe('assistant');
    
    expect(assistant.tool_calls).toBeDefined();
    expect(assistant.tool_calls![0].function.name).toBe('grep_search');
    const args = JSON.parse(assistant.tool_calls![0].function.arguments);
    expect(args.query).toBe('foo');

    // Tool output
    const tool = history[1];
    expect(tool.role).toBe('tool');
    expect(tool.content).toContain('Found foo in bar.ts');
    expect(tool.content).not.toContain('Tool Output'); // Should be stripped
  });

  it('should handle system prompt if present', () => {
    const markdown = `# Header
---

### SYSTEM (2024-01-01)

You are a bot.

---
`;
    const history = parseConversation(markdown);
    expect(history[0].role).toBe('system');
    expect(history[0].content).toBe('You are a bot.');
  });
});
