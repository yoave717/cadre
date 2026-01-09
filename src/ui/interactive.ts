import { input } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';
import { Agent } from '../agent/index.js';
import { clearConfig, getConfig, setConfig } from '../config.js';

// Configure marked
marked.setOptions({
    // Define options for the renderer
    renderer: new TerminalRenderer() as any
});

export const startInteractiveSession = async () => {
    console.log(chalk.bold.blue("Welcome to Cadre (Claude-like CLI)"));

    // Check Config
    const config = getConfig();
    if (config.openaiBaseUrl === 'http://localhost:8000/v1' && !process.env.OPENAI_BASE_URL) {
        console.log(chalk.yellow("Using default vLLM endpoint: http://localhost:8000/v1"));
    }

    const agent = new Agent();

    while (true) {
        try {
            const answer = await input({ message: chalk.green('>') });

            if (answer.trim() === '/exit' || answer.trim() === 'exit') {
                console.log("Goodbye!");
                break;
            }
            if (answer.trim() === '/clear') {
                agent.clearHistory();
                console.clear();
                console.log(chalk.gray("Context cleared."));
                continue;
            }
            if (answer.trim().startsWith('/config')) {
                // TODO: Basic config set handling
                console.log("Config: ", getConfig());
                continue;
            }

            const spinner = ora('Thinking...').start();

            // Collect full text response to render markdown at the end? 
            // Or stream? The agent yields chunks but they are full message contents in my implementation currently (not streaming tokens).
            // So we can just print the content.

            for await (const event of agent.chat(answer)) {
                if (event.type === 'text') {
                    spinner.stop();
                    console.log(marked(event.content));
                } else if (event.type === 'tool_call') {
                    spinner.text = `Executing ${event.name}...`;
                } else if (event.type === 'tool_result') {
                    // Maybe don't show result content unless debug?
                    // spinner.succeed(`Tool ${event.type} finished.`);
                    // Reset spinner for next thought
                    spinner.start('Thinking...');
                } else if (event.type === 'error') {
                    spinner.fail(chalk.red(event.message));
                }
            }
            spinner.stop();

        } catch (error) {
            if (error instanceof Error && error.message.includes('User force closed')) {
                break;
            }
            console.error(error);
        }
    }
};
