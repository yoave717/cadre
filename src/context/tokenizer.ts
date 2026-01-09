/**
 * Simple token counting utilities.
 * Uses character-based approximation (roughly 4 chars per token for English).
 * For production, consider using tiktoken or similar.
 */

const CHARS_PER_TOKEN = 4;

/**
 * Estimate token count from a string.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Extract text content from a message content field.
 * Handles both string and array formats from OpenAI types.
 */
function extractTextContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .filter((part: any) => part.type === 'text')
      .map((part: any) => part.text || '')
      .join('\n');
  }
  return '';
}

/**
 * Estimate token count from a message.
 * Compatible with OpenAI ChatCompletionMessageParam types.
 */
export function estimateMessageTokens(message: any): number {
  let tokens = 4; // Base overhead per message

  // Role tokens
  tokens += estimateTokens(message.role || '');

  // Content tokens - handle string or array format
  const textContent = extractTextContent(message.content);
  tokens += estimateTokens(textContent);

  // Tool call tokens
  if (message.tool_calls && Array.isArray(message.tool_calls)) {
    for (const toolCall of message.tool_calls) {
      tokens += estimateTokens(toolCall.function?.name || '');
      tokens += estimateTokens(toolCall.function?.arguments || '');
      tokens += 10; // Overhead for tool call structure
    }
  }

  return tokens;
}

/**
 * Estimate total tokens in a conversation.
 * Compatible with OpenAI ChatCompletionMessageParam types.
 */
export function estimateConversationTokens(messages: any[]): number {
  return messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);
}

/**
 * Truncate text to fit within a token budget.
 */
export function truncateToTokens(text: string, maxTokens: number): string {
  const maxChars = maxTokens * CHARS_PER_TOKEN;
  if (text.length <= maxChars) return text;

  // Truncate and add indicator
  const truncated = text.slice(0, maxChars - 20);
  return `${truncated}\n... [truncated]`;
}

/**
 * Truncate text from the beginning to fit within a token budget.
 * Useful for keeping recent content.
 */
export function truncateFromStart(text: string, maxTokens: number): string {
  const maxChars = maxTokens * CHARS_PER_TOKEN;
  if (text.length <= maxChars) return text;

  // Truncate from beginning and add indicator
  const truncated = text.slice(text.length - maxChars + 20);
  return `[truncated] ...\n${truncated}`;
}

/**
 * Smart truncation that tries to preserve complete lines/sentences.
 */
export function smartTruncate(text: string, maxTokens: number): string {
  const maxChars = maxTokens * CHARS_PER_TOKEN;
  if (text.length <= maxChars) return text;

  // Try to truncate at line boundary
  const lines = text.split('\n');
  let result = '';
  let charCount = 0;

  for (const line of lines) {
    if (charCount + line.length + 1 > maxChars - 30) {
      break;
    }
    result += `${line}\n`;
    charCount += line.length + 1;
  }

  if (result.length < text.length) {
    return `${result.trimEnd()}\n... [truncated]`;
  }

  return result;
}
