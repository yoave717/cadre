import { ChatCompletionMessageParam } from 'openai/resources';
import { getClient } from '../client.js';
import { getConfig } from '../config.js';
import { TOOLS, handleToolCall } from './tools.js';
import { ContextManager, getContextManager, estimateConversationTokens } from '../context/index.js';

export type AgentEvent =
  | { type: 'text_delta'; content: string } // Streaming text chunk
  | { type: 'text_done'; content: string } // Full text when complete
  | { type: 'tool_call_start'; name: string } // Tool call beginning
  | { type: 'tool_call'; name: string; args: Record<string, unknown> }
  | { type: 'tool_result'; name: string; result: string }
  | { type: 'error'; message: string }
  | { type: 'turn_done' } // Agent turn complete
  | { type: 'turn_done' } // Agent turn complete
  | { type: 'context_compressed'; before: number; after: number } // Context was compressed
  | { type: 'usage_update'; usage: TokenUsage };

interface ToolCallAccumulator {
  id: string;
  name: string;
  arguments: string;
}

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
  cost: number;
}

export type HistoryItem = ChatCompletionMessageParam & { timestamp: number };

export class Agent {
  private history: HistoryItem[] = [];

  private sessionUsage: TokenUsage = { input: 0, output: 0, total: 0, cost: 0 };

  private contextManager: ContextManager;

  /**
   * Execution context (e.g., worker ID) for this agent.
   * Used to identify the requester in permission prompts.
   */
  private executionContext?: string;

  private systemPrompt: string = `You are Cadre, a helpful AI coding assistant running in a CLI environment.

You have access to the file system and can run commands. Your capabilities include:
- Reading and writing files
- Running shell commands
- Searching code with index-based tools (search_symbols, find_files) or glob/grep
- Making surgical edits to files

Guidelines:
- Always read files before modifying them
- Use run_command only when necessary and be cautious with destructive commands
- Prefer edit_file for small changes over write_file for entire file rewrites
- PRIORITIZE "search_symbols" and "find_files" for code navigation over "grep" or "glob"
- Use "grep" only for content not covered by the index (e.g. comments, dynamic strings)
- Use "multi_edit_file" when making multiple changes to the same file to ensure atomicity and speed.
- Be concise in your responses`;

  constructor(systemPrompt?: string) {
    const config = getConfig();
    if (systemPrompt) {
      this.systemPrompt = systemPrompt;
    } else if (config.systemPrompt) {
      this.systemPrompt = config.systemPrompt;
    }
    // Else use default initialized in property

    this.history.push({
      role: 'system',
      content: this.systemPrompt,
      timestamp: Date.now(),
    });
    this.contextManager = getContextManager();
  }

  updateSystemPrompt(prompt: string) {
    if (prompt.length > 2000) {
      throw new Error(`System prompt exceeds 2000 characters (length: ${prompt.length})`);
    }
    this.systemPrompt = prompt;

    // Update the system message in history (always the first message)
    if (this.history.length > 0 && this.history[0].role === 'system') {
      this.history[0].content = prompt;
    } else {
      // Should not happen if history initialized correctly
      this.history.unshift({
        role: 'system',
        content: prompt,
        timestamp: Date.now(),
      });
    }
  }

  getSystemPrompt(): string {
    return this.systemPrompt;
  }

  /**
   * Set the execution context for this agent (e.g., worker ID).
   * This context is used to identify the requester in permission prompts.
   */
  setExecutionContext(context: string | undefined): void {
    this.executionContext = context;
  }

  /**
   * Get the execution context for this agent.
   */
  getExecutionContext(): string | undefined {
    return this.executionContext;
  }

  async *chat(userInput: string, signal?: AbortSignal): AsyncGenerator<AgentEvent> {
    this.history.push({
      role: 'user',
      content: userInput,
      timestamp: Date.now(),
    });

    // Check if context needs compression before making API call
    if (this.contextManager.needsCompression(this.history)) {
      const beforeTokens = estimateConversationTokens(this.history);
      const compressed = await this.contextManager.compressContext(this.history);

      // Ensure all messages have timestamps (summary messages created by compression won't)
      this.history = compressed.map((msg) => {
        if ('timestamp' in msg) {
          return msg as HistoryItem;
        }
        return { ...(msg as object), timestamp: Date.now() } as HistoryItem;
      });

      const afterTokens = estimateConversationTokens(this.history);
      yield { type: 'context_compressed', before: beforeTokens, after: afterTokens };
    }

    const client = getClient();
    const config = getConfig();

    try {
      while (true) {
        // Use streaming API

        const stream = await client.chat.completions.create(
          {
            model: config.modelName,
            // Strip timestamps for OpenAI API
            messages: this.history.map(
              ({ timestamp: _ts, ...msg }) => msg as ChatCompletionMessageParam,
            ),
            tools: TOOLS,
            tool_choice: 'auto',
            stream: true,
            stream_options: { include_usage: true },
          },
          { signal },
        );

        let textContent = '';
        const toolCalls: ToolCallAccumulator[] = [];

        // Process stream chunks
        for await (const chunk of stream) {
          if (chunk.usage) {
            const usage = chunk.usage;
            // Update session usage
            this.sessionUsage.input += usage.prompt_tokens;
            this.sessionUsage.output += usage.completion_tokens;
            this.sessionUsage.total += usage.total_tokens;

            // Calculate cost
            const inputCost = (usage.prompt_tokens / 1_000_000) * config.tokenCostInput;
            const outputCost = (usage.completion_tokens / 1_000_000) * config.tokenCostOutput;
            this.sessionUsage.cost += inputCost + outputCost;

            yield { type: 'usage_update', usage: { ...this.sessionUsage } };
            continue;
          }

          const delta = chunk.choices[0]?.delta;

          // Handle text content streaming
          if (delta?.content) {
            textContent += delta.content;
            yield { type: 'text_delta', content: delta.content };
          }

          // Handle tool calls being built up
          if (delta?.tool_calls) {
            for (const toolCallDelta of delta.tool_calls) {
              const { index } = toolCallDelta;

              // New tool call starting
              if (toolCallDelta.id) {
                toolCalls[index] = {
                  id: toolCallDelta.id,
                  name: toolCallDelta.function?.name || '',
                  arguments: toolCallDelta.function?.arguments || '',
                };
                if (toolCallDelta.function?.name) {
                  yield { type: 'tool_call_start', name: toolCallDelta.function.name };
                }
              } else if (toolCalls[index]) {
                // Accumulating function name or arguments
                if (toolCallDelta.function?.name) {
                  toolCalls[index].name += toolCallDelta.function.name;
                }
                if (toolCallDelta.function?.arguments) {
                  toolCalls[index].arguments += toolCallDelta.function.arguments;
                }
              }
            }
          }
        }

        // Add assistant message to history
        if (textContent || toolCalls.length > 0) {
          const assistantMessage: HistoryItem = {
            role: 'assistant',
            content: textContent || null,
            timestamp: Date.now(),
          };

          if (toolCalls.length > 0) {
            assistantMessage.tool_calls = toolCalls.map((tc) => ({
              id: tc.id,
              type: 'function' as const,
              function: {
                name: tc.name,
                arguments: tc.arguments,
              },
            }));
          }

          this.history.push(assistantMessage as HistoryItem);
        }

        // Yield complete text if any
        if (textContent) {
          yield { type: 'text_done', content: textContent };
        }

        // Execute tool calls if any
        if (toolCalls.length > 0) {
          const toolResults = await Promise.all(
            toolCalls.map(async (toolCall) => {
              let args: Record<string, unknown> = {};
              try {
                args = JSON.parse(toolCall.arguments);
              } catch {
                args = {};
              }

              return {
                toolCall,
                args,
                result: await handleToolCall(toolCall.name, args, this.executionContext),
              };
            }),
          );

          for (const { toolCall, args, result } of toolResults) {
            yield { type: 'tool_call', name: toolCall.name, args };

            // Truncate large tool results to save context
            const truncatedResult = this.contextManager.truncateToolResult(result);
            yield { type: 'tool_result', name: toolCall.name, result: truncatedResult };

            this.history.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: truncatedResult,
              timestamp: Date.now(),
            } as HistoryItem);
          }
          // Loop back to send tool results to LLM
        } else {
          // No tool calls, we are done with this turn
          yield { type: 'turn_done' };
          break;
        }
      }
    } catch (error) {
      const err = error as Error;
      yield { type: 'error', message: err.message };
    }
  }

  clearHistory() {
    this.history = [
      {
        role: 'system',
        content: this.systemPrompt,
        timestamp: Date.now(),
      },
    ];
    this.contextManager.clearSummary();
    this.sessionUsage = { input: 0, output: 0, total: 0, cost: 0 };
  }

  getHistory(): HistoryItem[] {
    return [...this.history];
  }

  getTokenEstimate(): number {
    return estimateConversationTokens(this.history);
  }

  getContextStats() {
    return this.contextManager.getStats(this.history);
  }

  getSessionUsage(): TokenUsage {
    return { ...this.sessionUsage };
  }

  loadHistory(history: HistoryItem[]) {
    // Validate history
    if (!Array.isArray(history) || history.length === 0) {
      throw new Error('Invalid history: must be a non-empty array');
    }

    this.history = history;

    // Reset context summary if any (assume loaded history is full/raw for now, or re-summarize later if needed)
    this.contextManager.clearSummary();

    // Ensure system prompt is synced if present in history
    const systemMsg = this.history.find((h) => h.role === 'system');
    if (systemMsg && systemMsg.content) {
      this.systemPrompt = systemMsg.content as string;
    }
  }
}
