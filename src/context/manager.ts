import { estimateTokens, estimateMessageTokens, estimateConversationTokens } from './tokenizer.js';
import { summarizeConversation, summarizeToolResult, updateRollingSummary } from './summarizer.js';

// Use generic message type to avoid OpenAI type conflicts
export type Message = {
  role: string;
  content?: string | null | any;
  tool_calls?: any[];
  tool_call_id?: string;
  [key: string]: any;
};

export interface ContextConfig {
  maxContextTokens: number; // Total context window size
  maxOutputTokens: number; // Reserved for response
  compressionThreshold: number; // Compress when at this % of max
  maxToolResultTokens: number; // Max tokens per tool result
  summaryTokenBudget: number; // Tokens allocated for summary
}

const DEFAULT_CONFIG: ContextConfig = {
  maxContextTokens: 128000,
  maxOutputTokens: 16000,
  compressionThreshold: 0.8,
  maxToolResultTokens: 2000,
  summaryTokenBudget: 4000,
};

/**
 * Manages conversation context to stay within token limits.
 */
export class ContextManager {
  private config: ContextConfig;

  private rollingSummary: string = '';

  private summaryMessageCount: number = 0;

  constructor(config: Partial<ContextConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get available tokens for new content.
   */
  getAvailableTokens(): number {
    return this.config.maxContextTokens - this.config.maxOutputTokens;
  }

  /**
   * Get compression threshold in tokens.
   */
  getCompressionThreshold(): number {
    return Math.floor(this.getAvailableTokens() * this.config.compressionThreshold);
  }

  /**
   * Check if context needs compression.
   */
  needsCompression<T extends Message>(messages: T[]): boolean {
    const currentTokens = estimateConversationTokens(messages);
    return currentTokens > this.getCompressionThreshold();
  }

  /**
   * Compress context to fit within limits.
   * Returns compressed message array.
   */
  async compressContext<T extends Message>(messages: T[]): Promise<T[]> {
    const currentTokens = estimateConversationTokens(messages);
    const targetTokens = Math.floor(this.getAvailableTokens() * 0.6);

    if (currentTokens <= targetTokens) {
      return messages;
    }

    // Separate system prompt from conversation
    const systemMessage = messages.find((m) => m.role === 'system');
    const conversationMessages = messages.filter((m) => m.role !== 'system');

    // Calculate how many messages to summarize
    const summaryBudget = this.config.summaryTokenBudget;
    const recentBudget =
      targetTokens - summaryBudget - estimateMessageTokens(systemMessage || { role: 'system' });

    // Find split point - keep recent messages within budget
    let recentTokens = 0;
    let splitIndex = conversationMessages.length;

    for (let i = conversationMessages.length - 1; i >= 0; i--) {
      const msgTokens = estimateMessageTokens(conversationMessages[i]);
      if (recentTokens + msgTokens > recentBudget) {
        splitIndex = i + 1;
        break;
      }
      recentTokens += msgTokens;
    }

    // If we can't keep any messages, just keep the last few
    if (splitIndex >= conversationMessages.length) {
      splitIndex = Math.max(0, conversationMessages.length - 5);
    }

    const messagesToSummarize = conversationMessages.slice(0, splitIndex);
    const recentMessages = conversationMessages.slice(splitIndex);

    // Generate or update summary
    if (messagesToSummarize.length > 0) {
      if (this.rollingSummary && this.summaryMessageCount > 0) {
        // Update existing summary with new messages since last summary
        const newMessages = messagesToSummarize.slice(this.summaryMessageCount);
        if (newMessages.length > 0) {
          this.rollingSummary = await updateRollingSummary(
            this.rollingSummary,
            newMessages,
            summaryBudget,
          );
        }
      } else {
        // Generate new summary
        this.rollingSummary = await summarizeConversation(messagesToSummarize, summaryBudget);
      }
      this.summaryMessageCount = messagesToSummarize.length;
    }

    // Build compressed message array
    const compressed: T[] = [];

    // Add system message
    if (systemMessage) {
      compressed.push(systemMessage);
    }

    // Add summary as a system message if we have one
    if (this.rollingSummary) {
      compressed.push({
        role: 'system',
        content: `[Previous conversation summary]\n${this.rollingSummary}`,
      } as T);
    }

    // Add recent messages
    compressed.push(...recentMessages);

    return compressed;
  }

  /**
   * Truncate a tool result if it's too large.
   */
  truncateToolResult(result: string): string {
    const maxTokens = this.config.maxToolResultTokens;
    const currentTokens = estimateTokens(result);

    if (currentTokens <= maxTokens) {
      return result;
    }

    return summarizeToolResult(result, maxTokens);
  }

  /**
   * Get current summary if available.
   */
  getSummary(): string | null {
    return this.rollingSummary || null;
  }

  /**
   * Clear the rolling summary.
   */
  clearSummary(): void {
    this.rollingSummary = '';
    this.summaryMessageCount = 0;
  }

  /**
   * Get context statistics.
   */
  getStats<T extends Message>(
    messages: T[],
  ): {
    currentTokens: number;
    maxTokens: number;
    percentUsed: number;
    needsCompression: boolean;
    messageCount: number;
    hasSummary: boolean;
  } {
    const currentTokens = estimateConversationTokens(messages);
    const maxTokens = this.getAvailableTokens();

    return {
      currentTokens,
      maxTokens,
      percentUsed: Math.round((currentTokens / maxTokens) * 100),
      needsCompression: this.needsCompression(messages),
      messageCount: messages.length,
      hasSummary: !!this.rollingSummary,
    };
  }
}

// Singleton instance
let instance: ContextManager | null = null;

export function getContextManager(config?: Partial<ContextConfig>): ContextManager {
  if (!instance || config) {
    instance = new ContextManager(config);
  }
  return instance;
}
