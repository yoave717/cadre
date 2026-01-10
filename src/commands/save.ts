import fs from 'fs';
import path from 'path';
import os from 'os';
import { Agent } from '../agent/index.js';
import { getConfig } from '../config.js';

/**
 * Save the current conversation to a markdown file.
 * @param agent - The agent instance containing the history.
 * @param filename - Optional custom filename.
 * @returns The absolute path of the saved file.
 */
export async function saveConversation(agent: Agent, filename?: string): Promise<string> {
  const history = agent.getHistory().filter((item: any) => item.role !== 'system');
  const config = getConfig();

  // Determine save directory
  let saveDir = config.saveDirectory;
  if (!saveDir) {
    saveDir = path.join(os.homedir(), '.ai', 'conversations');
  } else if (saveDir.startsWith('~')) {
    saveDir = path.join(os.homedir(), saveDir.slice(1));
  }

  // Ensure directory exists
  if (!fs.existsSync(saveDir)) {
    fs.mkdirSync(saveDir, { recursive: true });
  }

  // Determine filename
  let finalFilename = filename;
  if (!finalFilename) {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    finalFilename = `conversation_${timestamp}.md`;
  }

  // Add extension if missing
  if (!finalFilename.endsWith('.md')) {
    finalFilename += '.md';
  }

  const fullPath = path.join(saveDir, finalFilename);

  // Generate Markdown content
  let content = `# Conversation Log\n\n`;
  content += `**Date:** ${new Date().toLocaleString()}\n`;
  content += `**Model:** ${config.modelName}\n`;
  content += `**Messages:** ${history.length}\n`;
  content += `**Tokens:** ~${agent.getTokenEstimate()}\n\n`;
  content += `---\n\n`;

  for (const item of history) {
    const role = item.role.toUpperCase();
    const timestamp = new Date(item.timestamp || Date.now()).toLocaleString();

    content += `### ${role} (${timestamp})\n\n`;

    if (item.content) {
      content += `${item.content}\n\n`;
    } else if (item.role === 'tool' && item.tool_call_id) {
      // Tool result
      content += `\`Tool Output\`\n\`\`\`\n${item.content}\n\`\`\`\n\n`;
    } else if (item.role === 'assistant' && 'tool_calls' in item && (item as any).tool_calls) {
      // Tool call
      for (const call of (item as any).tool_calls) {
        const toolCall = call as any;
        if (toolCall.function) {
          content += `\`Tool Call: ${toolCall.function.name}\`\n\`\`\`json\n${toolCall.function.arguments}\n\`\`\`\n\n`;
        }
      }
    }

    content += `---\n\n`;
  }

  fs.writeFileSync(fullPath, content, 'utf8');
  return fullPath;
}
