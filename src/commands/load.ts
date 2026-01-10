import fs from 'fs';
import path from 'path';
import os from 'os';
import { Agent, HistoryItem } from '../agent/index.js';
import { getConfig } from '../config.js';

/**
 * Parse a markdown conversation file into HistoryItems.
 * @param content - The raw markdown content.
 * @returns Array of HistoryItems.
 */
export function parseConversation(content: string): HistoryItem[] {
  const history: HistoryItem[] = [];
  const lines = content.split('\n');

  // Skip header section (until first ---)
  let i = 0;
  while (i < lines.length && lines[i].trim() !== '---') {
    i++;
  }
  i++; // Skip '---'

  let currentRole: string | null = null;
  let currentTimestamp: number = Date.now();
  let currentContent: string[] = [];

  const flushMessage = () => {
    if (!currentRole) return;

    // Join lines and clean up
    const text = currentContent.join('\n').trim();

    if (currentRole === 'TOOL' || currentRole === 'TOOL OUTPUT') {
      // Trying to reconstruct tool output
      // Format: `Tool Output`\n```\n...content...\n```
      // We need to extract the content inside the code block
      const match = text.match(/`Tool Output`\s*```\s*([\s\S]*?)\s*```/);
      if (match) {
        history.push({
          role: 'tool',
          tool_call_id: 'restored_tool_' + Date.now(), // We don't save ID in markdown currently, so generate one
          content: match[1],
          timestamp: currentTimestamp,
        } as HistoryItem);
      } else {
        // Fallback for simple content if parsing fails
        history.push({
          role: 'tool',
          tool_call_id: 'unknown',
          content: text,
          timestamp: currentTimestamp,
        } as HistoryItem);
      }
    } else if (currentRole === 'ASSISTANT' && text.includes('`Tool Call:')) {
      // Reconstruct tool calls
      // Format: `Tool Call: name`\n```json\nargs\n```
      const toolCalls = [];
      const regex = /`Tool Call: ([\w-]+)`\s*```json\s*([\s\S]*?)\s*```/g;
      let match;

      while ((match = regex.exec(text)) !== null) {
        toolCalls.push({
          id: 'call_' + Math.random().toString(36).slice(2, 9),
          type: 'function' as const,
          function: {
            name: match[1],
            arguments: match[2].trim(),
          },
        });
      }

      if (toolCalls.length > 0) {
        history.push({
          role: 'assistant',
          content: null,
          tool_calls: toolCalls,
          timestamp: currentTimestamp,
        } as HistoryItem);
      } else {
        // Maybe it had mixed content?
        // For now, simpler implementation: if it looked like a tool call but failed regex, just treat as text
        history.push({
          role: 'assistant',
          content: text,
          timestamp: currentTimestamp,
        } as HistoryItem);
      }
    } else {
      // Standard Text Message (User or Assistant)
      history.push({
        role: currentRole.toLowerCase() as 'user' | 'assistant' | 'system',
        content: text,
        timestamp: currentTimestamp,
      } as HistoryItem);
    }

    currentContent = [];
    currentRole = null;
  };

  while (i < lines.length) {
    const line = lines[i];

    // Check for delimiter
    if (line.trim() === '---') {
      flushMessage();
      i++;
      continue;
    }

    // Check for Role Header: ### ROLE (TIMESTAMP)
    const roleMatch = line.match(/^### (USER|ASSISTANT|SYSTEM|TOOL) \((.*?)\)/);
    if (roleMatch) {
      if (currentRole) flushMessage(); // Should have been flushed by ---, but safety check

      currentRole = roleMatch[1];
      const timeStr = roleMatch[2];
      currentTimestamp = new Date(timeStr).getTime();
      i++;
      continue;
    }

    // Accumulate content
    if (currentRole) {
      currentContent.push(line);
    }

    i++;
  }

  // Flush last message
  flushMessage();

  return history;
}

/**
 * Load a conversation from a file and update the agent.
 * @param agent - The agent instance.
 * @param filepath - Path or name of the file to load.
 * @returns Number of messages loaded.
 */
export async function loadConversation(agent: Agent, filepath: string): Promise<number> {
  const config = getConfig();
  let loadPath = filepath;

  // Resolve path
  // If it's just a filename, look in default save dir
  if (!filepath.includes('/') && !filepath.includes('\\')) {
    let saveDir = config.saveDirectory;
    if (!saveDir) {
      saveDir = path.join(os.homedir(), '.ai', 'conversations');
    } else if (saveDir.startsWith('~')) {
      saveDir = path.join(os.homedir(), saveDir.slice(1));
    }

    loadPath = path.join(saveDir, filepath);
    if (!loadPath.endsWith('.md')) {
      loadPath += '.md';
    }
  } else {
    // Expand ~ if present
    if (loadPath.startsWith('~')) {
      loadPath = path.join(os.homedir(), loadPath.slice(1));
    }
    // ensure absolute
    loadPath = path.resolve(loadPath);
  }

  if (!fs.existsSync(loadPath)) {
    throw new Error(`Conversation file not found: ${loadPath}`);
  }

  const content = fs.readFileSync(loadPath, 'utf8');
  const history = parseConversation(content);

  if (history.length === 0) {
    throw new Error('No valid messages found in conversation file.');
  }

  // Restore system prompt if found in history, else keep current
  const systemMsg = history.find((h) => h.role === 'system');
  if (systemMsg && systemMsg.content) {
    agent.updateSystemPrompt(systemMsg.content as string);
  }

  // Replace agent history
  agent.loadHistory(history);

  return history.length;
}

/**
 * List available saved conversations.
 */
export function listConversations(): string[] {
  const config = getConfig();
  let saveDir = config.saveDirectory;

  if (!saveDir) {
    saveDir = path.join(os.homedir(), '.ai', 'conversations');
  } else if (saveDir.startsWith('~')) {
    saveDir = path.join(os.homedir(), saveDir.slice(1));
  }

  if (!fs.existsSync(saveDir)) {
    return [];
  }

  return fs
    .readdirSync(saveDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace('.md', ''))
    .sort()
    .reverse(); // Newest first usually (by timestamp name) if named by timestamp.
  // Actually alpha sort of ISO timestamps works for chronological.
  // If names are random, sort by mtime is better.
}
