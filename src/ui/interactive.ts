// import { input } from '@inquirer/prompts'; // Replaced by LineEditor
import { LineEditor } from '../input/line-editor.js';
import chalk from 'chalk';
import ora from 'ora';
import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';
import { Agent, HistoryItem } from '../agent/index.js';
import { saveConversation } from '../commands/save.js';
import { loadConversation, listConversations } from '../commands/load.js';
import { MultiLineHandler, getModePrompt } from '../input/multiline.js';
import { getConfig } from '../config.js';
import { BranchManager } from '../context/branch-manager.js';

// Configure marked for terminal rendering
marked.setOptions({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderer: new TerminalRenderer() as any,
});

/**
 * Process a single prompt and stream the response.
 * Returns the full response text.
 */
async function processPrompt(agent: Agent, prompt: string, signal?: AbortSignal): Promise<string> {
  const spinner = ora({ text: 'Thinking...', color: 'cyan' }).start();
  let isStreaming = false;
  let fullText = '';

  try {
    for await (const event of agent.chat(prompt, signal)) {
      if (signal?.aborted) break;
      switch (event.type) {
        case 'context_compressed':
          spinner.info(chalk.yellow(`Context compressed: ${event.before} → ${event.after} tokens`));
          spinner.start('Thinking...');
          break;

        case 'usage_update':
          // Usage updated silently
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
  } catch (error) {
    if (signal?.aborted || (error as Error).name === 'AbortError') {
      spinner.stop();
      if (isStreaming) console.log(''); // Close line if streaming
      console.log(chalk.yellow('^C'));
      return fullText;
    }
    throw error;
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
  loadFilePath?: string,
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

  // Load conversation if requested
  if (loadFilePath) {
    try {
      const count = await loadConversation(agent, loadFilePath);
      console.log(chalk.green(`Loaded conversation with ${count} messages.`));
      console.log(chalk.dim('----------------------------------------'));
      // Show last few messages for context
      const history = agent.getHistory().filter((h) => h.role === 'user' || h.role === 'assistant');
      printMessages(history.slice(-5));
      console.log(chalk.dim('----------------------------------------'));
    } catch (error) {
      const err = error as Error;
      console.log(chalk.red(`Failed to load conversation: ${err.message}`));
    }
  }

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

  const multiLineHandler = new MultiLineHandler();
  const lineEditor = new LineEditor();

  const branchManager = new BranchManager();
  let currentBranch: string | null = null;
  let lastSigIntTime = 0;

  while (true) {
    try {
      const mode = multiLineHandler.getMode();
      let promptStr = getModePrompt(mode);

      // Add token count to prompt if in normal mode
      if (mode === 'normal') {
        const usage = agent.getSessionUsage();
        const tokens = usage.total.toLocaleString();

        const branchStr = currentBranch ? ` [${chalk.cyan(currentBranch)}]` : '';
        promptStr = `You${branchStr} (tokens: ${tokens}): `;
      }

      const answer = await lineEditor.read(
        mode === 'normal' ? chalk.green(promptStr) : chalk.yellow(promptStr),
      );

      // Pass to multi-line handler
      const result = multiLineHandler.processLine(answer);

      if (!result.complete) {
        continue;
      }

      const trimmed = result.content.trim();

      // Handle slash commands (only in normal mode)
      if (trimmed.startsWith('/') && multiLineHandler.getMode() === 'normal') {
        const handled = await handleSlashCommand(
          trimmed,
          agent,
          multiLineHandler,
          branchManager,
          lineEditor,
          currentBranch,
          (newBranch) => {
            currentBranch = newBranch;
          },
        );
        if (handled === 'exit') break;
        if (handled) continue;
      }

      // Skip empty input
      if (!trimmed) continue;

      // Create a fresh abort controller for this turn
      const abortController = new AbortController();

      // Setup SIGINT handler for agent execution
      const onSigInt = () => {
        const now = Date.now();
        if (now - lastSigIntTime < 1000) {
          console.log('\nGoodbye!');
          process.exit(0);
        }
        lastSigIntTime = now;
        abortController.abort();
      };

      process.on('SIGINT', onSigInt);

      try {
        await processPrompt(agent, result.content, abortController.signal);
        console.log(''); // Extra line for readability
      } finally {
        process.off('SIGINT', onSigInt);
      }

      // Auto-save branch if active
      if (currentBranch) {
        await branchManager.saveBranch(currentBranch, agent.getHistory());
      }

      // Check limits
      const config = getConfig();
      if (config.maxSessionTokens > 0) {
        const usage = agent.getSessionUsage();
        const percent = (usage.total / config.maxSessionTokens) * 100;

        if (percent >= 100) {
          console.log(
            chalk.red.bold(
              `⚠ Session limit reached (${usage.total}/${config.maxSessionTokens} tokens).`,
            ),
          );
        } else if (percent >= 80) {
          console.log(
            chalk.yellow(
              `⚠ Approaching session limit: ${usage.total}/${config.maxSessionTokens} tokens (${percent.toFixed(1)}%)`,
            ),
          );
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('User force closed')) {
        // Handle Ctrl+C during input
        const now = Date.now();
        if (now - lastSigIntTime < 1000) {
          console.log('\nGoodbye!');
          process.exit(0);
        }
        lastSigIntTime = now;
        console.log('^C');
        multiLineHandler.cancel();
        continue;
      }
      console.error(chalk.red('Error:'), error);
    }
  }
};

async function handleSlashCommand(
  command: string,
  agent: Agent,
  multiLineHandler: MultiLineHandler,
  branchManager: BranchManager,
  lineEditor: LineEditor,
  currentBranch: string | null,
  setBranch: (name: string | null) => void,
): Promise<boolean | 'exit'> {
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

    case 'tokens': {
      const usage = agent.getSessionUsage();
      const config = getConfig();

      console.log(chalk.bold('\nSession Token Usage:'));
      console.log(chalk.dim(`  Input:      ${usage.input.toLocaleString()}`));
      console.log(chalk.dim(`  Output:     ${usage.output.toLocaleString()}`));
      console.log(chalk.blue(`  Total:      ${usage.total.toLocaleString()}`));

      if (usage.cost > 0) {
        console.log(chalk.dim(`  Est. Cost:  $${usage.cost.toFixed(4)}`));
      }

      if (config.maxSessionTokens > 0) {
        const percent = (usage.total / config.maxSessionTokens) * 100;
        const color = percent > 80 ? chalk.yellow : chalk.dim;
        console.log(
          color(
            `  Limit:      ${usage.total.toLocaleString()} / ${config.maxSessionTokens.toLocaleString()} (${percent.toFixed(1)}%)`,
          ),
        );
      }
      console.log('');
      return true;
    }

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
      console.log(chalk.dim('  /tokens      - Show session token usage & cost'));
      console.log(chalk.dim('  /stats       - Show context/token statistics'));
      console.log(chalk.dim('  /exit        - Exit the session'));

      console.log(chalk.dim('  /system [prompt] - View or update system prompt'));
      console.log(chalk.dim('  /save [name] - Save conversation to file'));
      console.log(chalk.dim('  /load [file] - Load conversation from file (or list available)'));
      console.log(chalk.dim('  /multi       - Enter multi-line input mode (end with /end)'));
      console.log(chalk.dim('  /help        - Show this help\n'));
      return true;

    case 'branch':
      if (args.length === 0) {
        if (currentBranch) {
          console.log(chalk.blue(`Current branch: ${currentBranch}`));
        } else {
          console.log(chalk.dim('No active branch (main conversation).'));
        }
        return true;
      }

      if (args[0] === '--list' || args[0] === '-l') {
        const branches = await branchManager.listBranches();
        if (branches.length === 0) {
          console.log(chalk.dim('No branches found.'));
        } else {
          console.log(chalk.bold('\nBranches:'));
          for (const b of branches) {
            const isCurrent = b.name === currentBranch;
            const marker = isCurrent ? chalk.green('*') : ' ';
            const date = new Date(b.lastModified).toISOString().slice(0, 10);
            console.log(
              `${marker} ${chalk.blue(b.name.padEnd(20))} ${chalk.dim(`${b.messageCount} msgs`)} ${chalk.dim(date)}`,
            );
          }
          console.log('');
        }
        return true;
      }

      // Create new branch
      try {
        const newBranchName = args[0];

        // If it exists, error (per requirements "create")
        // But for better UX, if it exists and user might want to switch?
        // Requirements say: "As a user, I can create named conversation branches"
        // And "User can type /branch new-feature to create branch"
        // I will strictly implement create.
        // We can add switch later if needed, or if user asks.

        await branchManager.createBranch(newBranchName, agent.getHistory());
        setBranch(newBranchName);
        console.log(chalk.green(`Created and switched to branch '${newBranchName}'`));
      } catch (error) {
        const err = error as Error;
        console.log(chalk.red(`Error: ${err.message}`));
      }
      return true;

    case 'load':
      if (args.length === 0 || args[0] === '--list') {
        const files = listConversations();
        if (files.length === 0) {
          console.log(chalk.dim('No saved conversations found.'));
        } else {
          console.log(chalk.bold('\nSaved Conversations:'));
          files.forEach((f) => console.log(chalk.blue(`  ${f}`)));
          console.log('');
        }
        return true;
      }

      try {
        // Confirm before overwriting current session?
        // ideally yes, but for now let's just do it or maybe check if history is empty.
        // user explicitly typed /load, so they probably know what they are doing.

        const count = await loadConversation(agent, args[0]);
        console.log(chalk.green(`Loaded conversation with ${count} messages.`));
        console.log(chalk.dim('Context updated.'));
      } catch (error) {
        const err = error as Error;
        console.log(chalk.red(`Error loading conversation: ${err.message}`));
      }
      return true;

    case 'save':
      try {
        const socketPath = await saveConversation(agent, args[0]);
        console.log(chalk.green(`Conversation saved to: ${socketPath}`));
      } catch (error) {
        const err = error as Error;
        console.log(chalk.red(`Error saving conversation: ${err.message}`));
      }
      return true;

    case 'multi':
      multiLineHandler.setMode('explicit');
      console.log(
        chalk.yellow('Entering multi-line mode. Type /end to submit, /cancel to discard.'),
      );
      return true;

    case 'cancel':
      multiLineHandler.cancel();
      console.log(chalk.yellow('Input cancelled.'));
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
      await showHistory(agent, lineEditor, args[0]);
      return true;

    default:
      console.log(chalk.yellow(`Unknown command: /${cmd}. Type /help for available commands.`));
      return true;
  }
}

async function showHistory(agent: Agent, lineEditor: LineEditor, arg?: string): Promise<void> {
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

  while (true) {
    console.clear();
    console.log(
      chalk.bold(
        `Conversation History (Page ${currentPage + 1}/${totalPages}) - ${allHistory.length} messages\n`,
      ),
    );

    let start = allHistory.length - (currentPage + 1) * pageSize;
    let end = allHistory.length - currentPage * pageSize;

    if (start < 0) start = 0;
    if (end > allHistory.length) end = allHistory.length;

    const pageMessages = allHistory.slice(start, end);
    printMessages(pageMessages);

    console.log(chalk.dim('\n----------------------------------------'));
    console.log(chalk.dim(`Viewing ${start + 1}-${end} of ${allHistory.length} messages.`));

    const options = [];
    if (currentPage < totalPages - 1) options.push('[o]lder');
    if (currentPage > 0) options.push('[n]ewer');
    options.push('[q]uit');

    const prompt = `Navigate (${options.join(', ')}): `;
    const answer = await lineEditor.read(prompt);

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
