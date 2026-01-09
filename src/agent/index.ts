import { ChatCompletionMessageParam } from "openai/resources";
import { getClient } from "../client.js";
import { getConfig } from "../config.js";
import { TOOLS, handleToolCall } from "./tools.js";

export type AgentEvent =
    | { type: 'text', content: string }
    | { type: 'tool_call', name: string, args: any }
    | { type: 'tool_result', result: string }
    | { type: 'error', message: string };

export class Agent {
    private history: ChatCompletionMessageParam[] = [];
    private systemPrompt: string = "You are a helpful AI coding assistant. You are running in a CLI environment. You have access to the file system and can run commands. When asked to create or edit code, always try to read the relevant files first. Use `run_command` only when necessary and safe.";

    constructor() {
        this.history.push({ role: "system", content: this.systemPrompt });
    }

    async *chat(userInput: string): AsyncGenerator<AgentEvent> {
        this.history.push({ role: "user", content: userInput });

        const client = getClient();
        const config = getConfig();

        try {
            while (true) {
                const response = await client.chat.completions.create({
                    model: config.modelName,
                    messages: this.history,
                    tools: TOOLS,
                    tool_choice: "auto",
                });

                const message = response.choices[0].message;
                this.history.push(message);

                if (message.content) {
                    yield { type: 'text', content: message.content };
                }

                if (message.tool_calls && message.tool_calls.length > 0) {
                    for (const toolCall of message.tool_calls) {
                        if (toolCall.type !== 'function') continue;
                        const args = JSON.parse(toolCall.function.arguments);
                        yield { type: 'tool_call', name: toolCall.function.name, args };

                        // TODO: Add User Confirmation Hook here for sensitive tools?
                        // For now we assume the UI handles confirmation before calling `chat` again? 
                        // No, the agent loop executes tools. We need a way to delegate confirmation to UI.
                        // I will pause here? No, let's auto-run for now and add confirmation logic in the UI layer interception if possible, 
                        // or just rely on the tool wrapper.

                        const result = await handleToolCall(toolCall.function.name, args);
                        yield { type: 'tool_result', result };

                        this.history.push({
                            role: "tool",
                            tool_call_id: toolCall.id,
                            content: result
                        });
                    }
                    // Loop back to send tool results to LLM
                } else {
                    // No tool calls, we are done with this turn
                    break;
                }
            }
        } catch (error: any) {
            yield { type: 'error', message: error.message };
        }
    }

    clearHistory() {
        this.history = [{ role: "system", content: this.systemPrompt }];
    }
}
