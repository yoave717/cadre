import { getClient } from '../client.js';
import { getConfig } from '../config.js';
import { estimateTokens } from './tokenizer.js';

// Generic message type for compatibility
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Message = { role: string; content?: any; tool_calls?: any[]; [key: string]: any };

/**
 * Extract string content from a message.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getContent(content: any): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return (
      content
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((p: any) => p.type === 'text')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((p: any) => p.text || '')
        .join(' ')
    );
  }
  return '';
}

/**
 * Summarize a conversation history into a compact format.
 * Uses the LLM to generate a summary.
 */
export async function summarizeConversation(
  messages: Message[],
  maxSummaryTokens: number = 2000,
): Promise<string> {
  const client = getClient();
  const config = getConfig();

  // Build a prompt to summarize the conversation
  const conversationText = messages
    .map((msg) => {
      if (msg.role === 'system') return '';
      if (msg.role === 'user') return `User: ${getContent(msg.content)}`;
      if (msg.role === 'assistant') {
        let text = `Assistant: ${getContent(msg.content) || ''}`;
        if (msg.tool_calls) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const toolNames = msg.tool_calls.map((t: any) => t.function?.name).join(', ');
          text += ` [Used tools: ${toolNames}]`;
        }
        return text;
      }
      if (msg.role === 'tool') return `Tool result: ${getContent(msg.content).slice(0, 200)}...`;
      return '';
    })
    .filter(Boolean)
    .join('\n\n');

  const summaryPrompt = `Summarize the following conversation between a user and an AI coding assistant.
Focus on:
- What the user wanted to accomplish
- Key decisions and changes made
- Important files and code locations mentioned
- Current state of the task
- Any pending issues or next steps

Keep the summary concise but include all important technical details.

Conversation:
${conversationText}

Summary:`;

  try {
    const response = await client.chat.completions.create({
      model: config.modelName,
      messages: [{ role: 'user', content: summaryPrompt }],
      max_tokens: maxSummaryTokens,
      temperature: 0.3, // Lower temperature for more factual summary
    });

    return response.choices[0]?.message?.content || 'Unable to generate summary.';
  } catch {
    // If summarization fails, return a simple fallback

    return generateFallbackSummary(messages);
  }
}

/**
 * Generate a simple fallback summary without using the LLM.
 */
function generateFallbackSummary(messages: Message[]): string {
  const userMessages = messages.filter((m) => m.role === 'user');
  const toolCalls = messages
    .filter((m) => m.role === 'assistant' && m.tool_calls)
    .flatMap((m) => m.tool_calls || [])
    .map((t) => t.function?.name)
    .filter(Boolean);

  const uniqueTools = [...new Set(toolCalls)];

  let summary = 'Previous conversation summary:\n';

  if (userMessages.length > 0) {
    const firstRequest = getContent(userMessages[0]?.content).slice(0, 200);
    summary += `- Initial request: ${firstRequest}\n`;

    if (userMessages.length > 1) {
      const lastRequest = getContent(userMessages[userMessages.length - 1]?.content).slice(0, 200);
      summary += `- Most recent request: ${lastRequest}\n`;
    }
  }

  if (uniqueTools.length > 0) {
    summary += `- Tools used: ${uniqueTools.join(', ')}\n`;
  }

  summary += `- Total exchanges: ${userMessages.length} user messages\n`;

  return summary;
}

/**
 * Summarize tool results that are too large.
 */
export function summarizeToolResult(result: string, maxTokens: number = 500): string {
  const currentTokens = estimateTokens(result);

  if (currentTokens <= maxTokens) {
    return result;
  }

  // For file contents, keep first and last portions
  const lines = result.split('\n');
  if (lines.length > 20) {
    const firstLines = lines.slice(0, 10).join('\n');
    const lastLines = lines.slice(-10).join('\n');
    return `${firstLines}\n\n... [${lines.length - 20} lines omitted] ...\n\n${lastLines}`;
  }

  // For other content, truncate
  const maxChars = maxTokens * 4;
  return `${result.slice(0, maxChars)}\n... [truncated]`;
}

/**
 * Create a rolling summary that updates incrementally.
 */
export async function updateRollingSummary(
  existingSummary: string,
  newMessages: Message[],
  maxSummaryTokens: number = 2000,
): Promise<string> {
  const client = getClient();
  const config = getConfig();

  const newContent = newMessages
    .map((msg) => {
      if (msg.role === 'user') return `User: ${getContent(msg.content)}`;
      if (msg.role === 'assistant')
        return `Assistant: ${getContent(msg.content) || '[tool calls]'}`;
      return '';
    })
    .filter(Boolean)
    .join('\n');

  const updatePrompt = `Update this conversation summary with the new exchanges.
Keep all important details from the existing summary and add the new information.

Existing summary:
${existingSummary}

New exchanges:
${newContent}

Updated summary:`;

  try {
    const response = await client.chat.completions.create({
      model: config.modelName,
      messages: [{ role: 'user', content: updatePrompt }],
      max_tokens: maxSummaryTokens,
      temperature: 0.3,
    });

    return response.choices[0]?.message?.content || existingSummary;
  } catch {
    // If update fails, append to existing summary
    return `${existingSummary}\n\nRecent: ${newContent.slice(0, 500)}`;
  }
}
