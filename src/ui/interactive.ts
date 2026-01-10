import { input } from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';
import { Agent, HistoryItem } from '../agent/index.js';
import { getConfig } from '../config.js';

// Configure marked for terminal rendering
marked.setOptions({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

      case 'tool_result': {
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
      }

      case 'turn_done':
        spinner.stop();
        break;

      case 'error':
        spinner.fail(chalk.red(`Error: ${event.message}`));
        break;

      default:
        break;
    }
  }

  spinner.stop();
  return fullText;
}

/**
 * Run a single prompt and exit (one-shot mode).
 */
export const runSinglePrompt = async (prompt: string, systemPrompt?: string): Promise<void> => {
  const config = getConfig();
  console.log(chalk.dim(`Model: ${config.modelName}\n`));

  const agent = new Agent(systemPrompt);

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
export const startInteractiveSession = async (
  initialPrompt?: string,
  systemPrompt?: string,
): Promise<void> => {
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

  const agent = new Agent(systemPrompt);

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
  const parts = command.slice(1).split(' ');
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  switch (cmd) {
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

    case 'config': {
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
    }

    case 'tokens':
    case 'context':
    case 'stats': {
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
    }

    case 'help':
    case '?':
      console.log(chalk.bold('\nCommands:'));
      console.log(chalk.dim('  /history [n] - View conversation history (default: all/paginated)'));
      console.log(chalk.dim('  /clear       - Clear conversation history'));
      console.log(chalk.dim('  /config      - Show current configuration'));
      console.log(chalk.dim('  /stats       - Show context/token statistics'));
      console.log(chalk.dim('  /exit        - Exit the session'));
      console.log(chalk.dim('  /system [prompt] - View or update system prompt'));
      console.log(chalk.dim('  /help        - Show this help\n'));
      return true;

    case 'system':
      if (args.length === 0) {
        console.log(chalk.bold('\nCurrent System Prompt:'));
        console.log(chalk.dim(agent.getSystemPrompt()));
        console.log('');
      } else {
        const newPrompt = args.join(' ');
        try {
          agent.updateSystemPrompt(newPrompt);
          console.log(chalk.green('System prompt updated.'));
        } catch (error) {
          const err = error as Error;
          console.log(chalk.red(`Error updating system prompt: ${err.message}`));
        }
      }
      return true;

    case 'history':
    case 'log':
      await showHistory(agent, args[0]);
      return true;

    default:
      console.log(chalk.yellow(`Unknown command: /${cmd}. Type /help for available commands.`));
      return true;
  }
}

async function showHistory(agent: Agent, arg?: string): Promise<void> {
  const allHistory = agent
    .getHistory()
    .filter((item) => item.role === 'user' || item.role === 'assistant');

  if (allHistory.length === 0) {
    console.log(chalk.dim('No history yet.'));
    return;
  }

  const limit = arg ? parseInt(arg, 10) : 0;

  if (limit > 0) {
    // Show last N messages
    const slice = allHistory.slice(-limit);
    printMessages(slice);
    return;
  }

  // Pagination logic if no limit and > 20 messages
  const pageSize = 20;
  if (allHistory.length <= pageSize) {
    printMessages(allHistory);
    return;
  }

  // Interactive pagination
  let currentPage = 0; // 0 = most recent page
  const totalPages = Math.ceil(allHistory.length / pageSize);

  // We want to loop until user exits
  // We need to dynamically import select to avoid issues if it's not at top level or use simple input
  // For now, let's use a simple input loop to keep it robust

  while (true) {
    console.clear();
    console.log(
      chalk.bold(
        `Conversation History (Page ${currentPage + 1}/${totalPages}) - ${allHistory.length} messages\n`,
      ),
    );

    // Calculate slice for current page
    // Page 0: last 20. Page 1: 20 before that.
    // Index logic:
    // Start index (inclusive) = total - (page + 1) * size
    // End index (exclusive) = total - page * size
    // Example: Total 50, Size 20.
    // Page 0: Start 30, End 50. (Correct, last 20)
    // Page 1: Start 10, End 30.
    // Page 2: Start -10 -> 0, End 10.

    let start = allHistory.length - (currentPage + 1) * pageSize;
    let end = allHistory.length - currentPage * pageSize;

    if (start < 0) start = 0;
    if (end > allHistory.length) end = allHistory.length; // Should not happen with this math but safety

    const pageMessages = allHistory.slice(start, end);
    printMessages(pageMessages);

    console.log(chalk.dim('\n----------------------------------------'));
    console.log(chalk.dim(`Viewing ${start + 1}-${end} of ${allHistory.length} messages.`));

    const options = [];
    if (currentPage < totalPages - 1) options.push('[o]lder');
    if (currentPage > 0) options.push('[n]ewer');
    options.push('[q]uit');

    const prompt = `Navigate (${options.join(', ')}): `;
    const answer = await input({ message: prompt });

    const choice = answer.trim().toLowerCase();

    if (choice === 'q' || choice === 'exit' || choice === 'quit') {
      break;
    } else if ((choice === 'o' || choice === 'older') && currentPage < totalPages - 1) {
      currentPage++;
    } else if ((choice === 'n' || choice === 'newer') && currentPage > 0) {
      currentPage--;
    }
  }
}

function printMessages(messages: HistoryItem[]) {
  for (const item of messages) {
    const date = new Date(item.timestamp || Date.now());
    const timeStr = date.toISOString().replace('T', ' ').slice(0, 19);

    const roleColor = item.role === 'user' ? chalk.green : chalk.magenta;
    const roleName = item.role.toUpperCase();

    console.log(chalk.dim(`[${timeStr}] `) + roleColor(roleName) + ':');

    // Simple content rendering
    if (item.content) {
      console.log(item.content);
    } else if ('tool_calls' in item && item.tool_calls) {
      console.log(chalk.dim('(Tool calls hidden)'));
    }
    console.log(chalk.dim('---'));
  }
}

function formatArgs(args: unknown): string {
  if (!args) return '';
  const str = JSON.stringify(args);
  if (str.length > 60) {
    return `${str.slice(0, 57)}...`;
  }
  return str;
}
