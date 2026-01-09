import { input } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';
import { Agent, AgentEvent } from '../agent/index.js';
import { getConfig } from '../config.js';

// Configure marked for terminal rendering
marked.setOptions({
  renderer: new TerminalRenderer() as any,
});

/**
 * Process a single prompt and stream the response.
 * Returns the full response text.
 */
async function processPrompt(agent: Agent, prompt: string): Promise<string> {
  const spinner = ora({ text: 'Thinking...', color: 'cyan' }).start();
  let isStreaming = false;
  let fullText = '';

  for await (const event of agent.chat(prompt)) {
    switch (event.type) {
      case 'context_compressed':
        spinner.info(chalk.yellow(`Context compressed: ${event.before} → ${event.after} tokens`));
        spinner.start('Thinking...');
        break;

      case 'text_delta':
        // First chunk - stop spinner and start streaming
        if (!isStreaming) {
          spinner.stop();
          isStreaming = true;
        }
        // Write directly to stdout for real-time streaming
        process.stdout.write(event.content);
        fullText += event.content;
        break;

      case 'text_done':
        // Add newline after streamed text
        if (isStreaming) {
          console.log('');
        }
        isStreaming = false;
        break;

      case 'tool_call_start':
        if (isStreaming) {
          console.log('');
          isStreaming = false;
        }
        spinner.start(chalk.blue(`⚡ ${event.name}`));
        break;

      case 'tool_call':
        spinner.text = chalk.blue(`⚡ ${event.name}`) + chalk.dim(` ${formatArgs(event.args)}`);
        break;

      case 'tool_result':
        spinner.succeed(chalk.blue(`⚡ ${event.name}`) + chalk.green(' ✓'));
        // Show truncated result for context
        const preview = event.result.slice(0, 200);
        if (event.result.length > 200) {
          console.log(chalk.dim(`   ${preview}...`));
        } else if (preview.trim()) {
          console.log(chalk.dim(`   ${preview}`));
        }
        spinner.start('Thinking...');
        break;

      case 'turn_done':
        spinner.stop();
        break;

      case 'error':
        spinner.fail(chalk.red(`Error: ${event.message}`));
        break;
    }
  }

  spinner.stop();
  return fullText;
}

/**
 * Run a single prompt and exit (one-shot mode).
 */
export const runSinglePrompt = async (prompt: string): Promise<void> => {
  const config = getConfig();
  console.log(chalk.dim(`Model: ${config.modelName}\n`));

  const agent = new Agent();

  try {
    await processPrompt(agent, prompt);
    console.log(''); // Extra line for readability
  } catch (error) {
    console.error(chalk.red('Error:'), error);
    process.exit(1);
  }
};

/**
 * Start an interactive session, optionally with an initial prompt.
 */
export const startInteractiveSession = async (initialPrompt?: string): Promise<void> => {
  console.log(chalk.bold.blue('Welcome to Cadre'));
  console.log(chalk.dim('Type /help for commands, /exit to quit\n'));

  // Check Config
  const config = getConfig();
  if (!config.openaiApiKey && !process.env.OPENAI_API_KEY) {
    console.log(
      chalk.yellow("⚠ No API key configured. Use 'cadre config --key <key>' or set OPENAI_API_KEY"),
    );
  }
  console.log(chalk.dim(`Model: ${config.modelName} | Endpoint: ${config.openaiBaseUrl}\n`));

  const agent = new Agent();

  // Process initial prompt if provided
  if (initialPrompt) {
    console.log(
      `${chalk.green('❯')} ${chalk.dim(
        initialPrompt.slice(0, 80) + (initialPrompt.length > 80 ? '...' : ''),
      )}`,
    );
    try {
      await processPrompt(agent, initialPrompt);
      console.log(''); // Extra line for readability
    } catch (error) {
      console.error(chalk.red('Error:'), error);
    }
  }

  // Interactive loop
  while (true) {
    try {
      const answer = await input({ message: chalk.green('❯') });
      const trimmed = answer.trim();

      // Handle slash commands
      if (trimmed.startsWith('/')) {
        const handled = await handleSlashCommand(trimmed, agent);
        if (handled === 'exit') break;
        if (handled) continue;
      }

      // Skip empty input
      if (!trimmed) continue;

      await processPrompt(agent, answer);
      console.log(''); // Extra line for readability
    } catch (error) {
      if (error instanceof Error && error.message.includes('User force closed')) {
        break;
      }
      console.error(chalk.red('Error:'), error);
    }
  }
};

async function handleSlashCommand(command: string, agent: Agent): Promise<boolean | 'exit'> {
  const [cmd, ...args] = command.slice(1).split(' ');

  switch (cmd.toLowerCase()) {
    case 'exit':
    case 'quit':
    case 'q':
      console.log(chalk.dim('Goodbye!'));
      return 'exit';

    case 'clear':
      agent.clearHistory();
      console.clear();
      console.log(chalk.dim('Context cleared.'));
      return true;

    case 'config':
      console.log(chalk.bold('Current Configuration:'));
      const config = getConfig();
      console.log(chalk.dim(`  Model:    ${config.modelName}`));
      console.log(chalk.dim(`  Endpoint: ${config.openaiBaseUrl}`));
      console.log(
        chalk.dim(
          `  API Key:  ${config.openaiApiKey ? `****${config.openaiApiKey.slice(-4)}` : 'Not set'}`,
        ),
      );
      return true;

    case 'tokens':
    case 'context':
    case 'stats':
      const stats = agent.getContextStats();
      console.log(chalk.bold('\nContext Statistics:'));
      console.log(
        chalk.dim(
          `  Tokens:     ~${stats.currentTokens} / ${stats.maxTokens} (${stats.percentUsed}%)`,
        ),
      );
      console.log(chalk.dim(`  Messages:   ${stats.messageCount}`));
      console.log(chalk.dim(`  Has summary: ${stats.hasSummary ? 'Yes' : 'No'}`));
      if (stats.needsCompression) {
        console.log(chalk.yellow(`  ⚠ Context will be compressed on next message`));
      }
      console.log('');
      return true;

    case 'help':
    case '?':
      console.log(chalk.bold('\nCommands:'));
      console.log(chalk.dim('  /clear    - Clear conversation history'));
      console.log(chalk.dim('  /config   - Show current configuration'));
      console.log(chalk.dim('  /stats    - Show context/token statistics'));
      console.log(chalk.dim('  /exit     - Exit the session'));
      console.log(chalk.dim('  /help     - Show this help\n'));
      return true;

    default:
      console.log(chalk.yellow(`Unknown command: /${cmd}. Type /help for available commands.`));
      return true;
  }
}

function formatArgs(args: any): string {
  if (!args) return '';
  const str = JSON.stringify(args);
  if (str.length > 60) {
    return `${str.slice(0, 57)}...`;
  }
  return str;
}
