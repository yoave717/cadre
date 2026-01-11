// import { input } from '@inquirer/prompts'; // Replaced by LineEditor
import { LineEditor } from '../input/line-editor.js';
import { getCompletions, getInlineSuggestion } from '../input/completion.js';
import chalk from 'chalk';
import ora from 'ora';
import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';
import { Agent, HistoryItem } from '../agent/index.js';
import { saveConversation } from '../commands/save.js';
import { loadConversation, listConversations } from '../commands/load.js';
import { MultiLineHandler, getModePrompt } from '../input/multiline.js';
import { TaskCoordinator } from '../workers/index.js';
import { getMCPClientManager, getMCPServers } from '../mcp/index.js';
import {
  theme,
  formatSuccess,
  formatError,
  formatInfo,
  formatWarning,
  formatProgress,
  formatSeparator,
  formatTimestamp,
  formatRole,
} from './colors.js';

/**
 * Display a cool CLI entrance banner
 */
function displayBanner(): void {
  const banner = `
   ${theme.border('╔═══════════════════════════════════════════════════════╗')}
   ${theme.border('║')}                                                       ${theme.border('║')}
   ${theme.border('║')}        ${theme.emphasis('█████╗  █████╗ ██████╗ ██████╗ ███████╗')}        ${theme.border('║')}
   ${theme.border('║')}       ${theme.emphasis('██╔══██╗██╔══██╗██╔══██╗██╔══██╗██╔════╝')}        ${theme.border('║')}
   ${theme.border('║')}       ${theme.emphasis('██║  ╚═╝███████║██║  ██║██████╔╝█████╗')}          ${theme.border('║')}
   ${theme.border('║')}       ${theme.emphasis('██║  ██╗██╔══██║██║  ██║██╔══██╗██╔══╝')}          ${theme.border('║')}
   ${theme.border('║')}       ${theme.emphasis('╚█████╔╝██║  ██║██████╔╝██║  ██║███████╗')}        ${theme.border('║')}
   ${theme.border('║')}        ${theme.emphasis('╚════╝ ╚═╝  ╚═╝╚═════╝ ╚═╝  ╚═╝╚══════╝')}        ${theme.border('║')}
   ${theme.border('║')}                                                       ${theme.border('║')}
   ${theme.border('║')}          ${theme.dim('Your AI-Powered Development Co-Partner')}       ${theme.border('║')}
   ${theme.border('║')}                                                       ${theme.border('║')}
   ${theme.border('╚═══════════════════════════════════════════════════════╝')}

   
   ${theme.dim('Type')} ${theme.userInput('/help')} ${theme.dim('for commands ·')} ${theme.userInput('/exit')} ${theme.dim('to quit')}
`;
  console.log(banner);
}
import { getConfig } from '../config.js';
import { BranchManager } from '../context/branch-manager.js';
import { SessionManager } from '../context/session-manager.js';

// Configure marked for terminal rendering
marked.setOptions({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderer: new TerminalRenderer() as any,
});

/**
 * Process a prompt using multi-worker execution
 */
async function processWithMultiWorker(
  prompt: string,
  coordinator: TaskCoordinator,
): Promise<string> {
  const summary = await coordinator.execute(prompt);

  // Display the summary
  console.log(coordinator.formatSummary(summary));

  // Aggregate results
  const successfulResults = summary.results.filter((r) => r.success && r.result);
  if (successfulResults.length > 0) {
    console.log(theme.emphasis('\n📝 Aggregated Results:\n'));
    for (const result of successfulResults) {
      const task = summary.plan.subtasks.find((t) => t.id === result.taskId);
      if (task) {
        console.log(theme.info(`Task: ${task.description}`));
        console.log(result.result);
        console.log(theme.dim('---\n'));
      }
    }
  }

  // Return combined results
  return successfulResults.map((r) => r.result).join('\n\n');
}

/**
 * Process a single prompt and stream the response.
 * Returns the full response text.
 */
async function processPrompt(agent: Agent, prompt: string, signal?: AbortSignal): Promise<string> {
  const spinner = ora({ text: 'Thinking...' }).start();
  let isStreaming = false;
  let fullText = '';

  try {
    for await (const event of agent.chat(prompt, signal)) {
      if (signal?.aborted) break;
      switch (event.type) {
        case 'context_compressed':
          spinner.info(formatInfo(`Context compressed: ${event.before} → ${event.after} tokens`));
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
          spinner.start(theme.progress(`⚡ ${event.name}`));
          break;

        case 'tool_call':
          spinner.text = theme.progress(`⚡ ${event.name}`) + theme.dim(` ${formatArgs(event.args)}`);
          break;

        case 'tool_result': {
          spinner.succeed(theme.progress(`⚡ ${event.name}`) + theme.success(' ✓'));
          // Show truncated result for context
          const preview = event.result.slice(0, 200);
          if (event.result.length > 200) {
            console.log(theme.dim(`   ${preview}...`));
          } else if (preview.trim()) {
            console.log(theme.dim(`   ${preview}`));
          }
          spinner.start('Thinking...');
          break;
        }

        case 'turn_done':
          spinner.stop();
          break;

        case 'error':
          spinner.fail(formatError(`Error: ${event.message}`));
          break;

        default:
          break;
      }
    }
  } catch (error) {
    if (signal?.aborted || (error as Error).name === 'AbortError') {
      spinner.stop();
      if (isStreaming) console.log(''); // Close line if streaming
      console.log(theme.warning('^C'));
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
  console.log(theme.dim(`Model: ${config.modelName}\n`));

  const agent = new Agent(systemPrompt);

  try {
    await processPrompt(agent, prompt);
    console.log(''); // Extra line for readability
  } catch (error) {
    console.error(formatError('Error:'), error);
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
  displayBanner();

  // Check Config
  const config = getConfig();
  if (!config.openaiApiKey && !process.env.OPENAI_API_KEY) {
    console.log(
      formatWarning("No API key configured. Use 'cadre config --key <key>' or set OPENAI_API_KEY"),
    );
  }
  console.log(theme.dim(`Model: ${config.modelName} | Endpoint: ${config.openaiBaseUrl}\n`));

  const agent = new Agent(systemPrompt);

  // Initialize MCP connections
  const mcpServers = getMCPServers();
  const enabledServers = mcpServers.filter((s) => s.enabled);

  if (enabledServers.length > 0) {
    const mcpManager = getMCPClientManager();

    // Add all configured servers to the manager
    for (const server of mcpServers) {
      mcpManager.addServer(server);
    }

    // Attempt to connect to all enabled servers
    const mcpSpinner = ora('Connecting to MCP servers...').start();
    try {
      await mcpManager.connectAll();

      const connections = mcpManager.getConnectionStatus();
      const connected = connections.filter((c) => c.connected);
      const totalTools = connected.reduce((sum, c) => sum + c.tools.length, 0);

      if (connected.length > 0) {
        mcpSpinner.succeed(
          `Connected to ${connected.length} MCP server(s) with ${totalTools} external tool(s)`,
        );

        // Show connected servers in dim text
        for (const conn of connected) {
          console.log(
            theme.dim(`  ● ${conn.config.name} (${conn.tools.length} tools available)`),
          );
        }
      } else {
        mcpSpinner.warn('No MCP servers connected');
      }
    } catch (error) {
      mcpSpinner.fail(`MCP connection error: ${(error as Error).message}`);
    }
    console.log('');
  }

  // Initialize multi-worker coordinator
  const coordinator = new TaskCoordinator({
    maxWorkers: 4, // Configure based on system resources
    enableSharedContext: true,
    verbose: true,
    onProgress: (message) => console.log(message),
  });

  // Load conversation if requested
  if (loadFilePath) {
    try {
      const count = await loadConversation(agent, loadFilePath);
      console.log(formatSuccess(`Loaded conversation with ${count} messages.`));
      console.log(formatSeparator());
      // Show last few messages for context
      const history = agent.getHistory().filter((h) => h.role === 'user' || h.role === 'assistant');
      printMessages(history.slice(-5));
      console.log(formatSeparator());
    } catch (error) {
      const err = error as Error;
      console.log(formatError(`Failed to load conversation: ${err.message}`));
    }
  }

  // Process initial prompt if provided
  if (initialPrompt) {
    console.log(
      `${theme.userInput('❯')} ${theme.dim(
        initialPrompt.slice(0, 80) + (initialPrompt.length > 80 ? '...' : ''),
      )}`,
    );
    try {
      await processPrompt(agent, initialPrompt);
      console.log(''); // Extra line for readability
    } catch (error) {
      console.error(formatError('Error:'), error);
    }
  }

  // Interactive loop

  const multiLineHandler = new MultiLineHandler();
  const lineEditor = new LineEditor();

  const branchManager = new BranchManager();
  const sessionManager = new SessionManager();
  let currentBranch: string | null = null;
  let lastSigIntTime = 0;

  // Load last active branch from session
  try {
    const lastBranch = await sessionManager.getLastBranch();
    if (lastBranch && branchManager.branchExists(lastBranch)) {
      const history = await branchManager.loadBranch(lastBranch);
      // Replace agent history with branch history
      agent.clearHistory();
      history.forEach((msg) => agent.getHistory().push(msg));
      currentBranch = lastBranch;
      console.log(theme.info(`Resumed branch '${lastBranch}' from last session.`));
    }
  } catch {
    // Ignore errors loading last branch
  }

  // Cache branch names for tab completion
  let cachedBranchNames: string[] = [];

  while (true) {
    // Refresh cached branch names
    try {
      const branches = await branchManager.listBranches();
      cachedBranchNames = branches.map((b) => b.name);
    } catch {
      cachedBranchNames = [];
    }

    try {
      const mode = multiLineHandler.getMode();
      let promptStr = getModePrompt(mode);

      // Add token count to prompt if in normal mode
      if (mode === 'normal') {
        const usage = agent.getSessionUsage();
        const tokens = usage.total.toLocaleString();

        const branchStr = currentBranch ? ` [${theme.highlight(currentBranch)}]` : '';
        promptStr = `You${branchStr} (tokens: ${tokens}): `;
      }

      // Tab completion and inline suggestions
      const completionCallback = (text: string) => getCompletions(text, cachedBranchNames);
      const suggestionCallback = (text: string) => getInlineSuggestion(text, cachedBranchNames);

      const answer = await lineEditor.read(
        mode === 'normal' ? theme.userInput(promptStr) : theme.warning(promptStr),
        {
          completionCallback,
          suggestionCallback,
        },
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
          sessionManager,
          lineEditor,
          currentBranch,
          (newBranch) => {
            currentBranch = newBranch;
          },
          coordinator,
        );
        if (handled === 'exit') break;
        if (handled) continue;
      }

      // Skip empty input
      if (!trimmed) continue;

      // Check if this request would benefit from parallel execution
      const shouldUseParallel = await coordinator.shouldUseMultiWorker(result.content);
      let useParallelMode = false;

      if (shouldUseParallel) {
        // Ask user if they want to use parallel mode
        const answer = await lineEditor.read(
          theme.warning(
            '💡 This task might benefit from parallel execution. Use multi-worker mode? (y/n): ',
          ),
        );
        useParallelMode = answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
      }

      // Create a fresh abort controller for this turn
      const abortController = new AbortController();

      // Setup SIGINT handler for agent execution
      const onSigInt = async () => {
        const now = Date.now();
        if (now - lastSigIntTime < 1000) {
          console.log('\nGoodbye!');
          // Cleanup MCP connections
          const mcpManager = getMCPClientManager();
          await mcpManager.disconnectAll();
          process.exit(0);
        }
        lastSigIntTime = now;
        abortController.abort();
      };

      process.on('SIGINT', onSigInt);

      try {
        if (useParallelMode) {
          // Use multi-worker execution
          await processWithMultiWorker(result.content, coordinator);
        } else {
          // Use standard single-agent execution
          await processPrompt(agent, result.content, abortController.signal);
        }
        console.log(''); // Extra line for readability
      } finally {
        process.off('SIGINT', onSigInt);
      }

      // Auto-save branch if active
      if (currentBranch) {
        await branchManager.saveBranch(currentBranch, agent.getHistory());
        await sessionManager.setLastBranch(currentBranch);
      } else {
        await sessionManager.setLastBranch(null);
      }

      // Check limits
      const config = getConfig();
      if (config.maxSessionTokens > 0) {
        const usage = agent.getSessionUsage();
        const percent = (usage.total / config.maxSessionTokens) * 100;

        if (percent >= 100) {
          console.log(
            theme.error.bold(
              `⚠ Session limit reached (${usage.total}/${config.maxSessionTokens} tokens).`,
            ),
          );
        } else if (percent >= 80) {
          console.log(
            theme.warning(
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
          // Cleanup MCP connections
          const mcpManager = getMCPClientManager();
          await mcpManager.disconnectAll();
          process.exit(0);
        }
        lastSigIntTime = now;
        console.log('^C');
        multiLineHandler.cancel();
        continue;
      }
      console.error(theme.error('Error:'), error);
    }
  }

  // Cleanup on exit
  coordinator.shutdown();
};

async function handleSlashCommand(
  command: string,
  agent: Agent,
  multiLineHandler: MultiLineHandler,
  branchManager: BranchManager,
  sessionManager: SessionManager,
  lineEditor: LineEditor,
  currentBranch: string | null,
  setBranch: (name: string | null) => void,
  coordinator?: TaskCoordinator,
): Promise<boolean | 'exit'> {
  const parts = command.slice(1).split(' ');
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);

  switch (cmd) {
    case 'exit':
    case 'quit':
    case 'q':
      console.log(theme.dim('Goodbye!'));
      return 'exit';

    case 'clear':
      agent.clearHistory();
      console.clear();
      console.log(theme.dim('Context cleared.'));
      return true;

    case 'config': {
      console.log(theme.emphasis('Current Configuration:'));
      const config = getConfig();
      console.log(theme.dim(`  Model:    ${config.modelName}`));
      console.log(theme.dim(`  Endpoint: ${config.openaiBaseUrl}`));
      console.log(
        theme.dim(
          `  API Key:  ${config.openaiApiKey ? `****${config.openaiApiKey.slice(-4)}` : 'Not set'}`,
        ),
      );
      return true;
    }

    case 'tokens': {
      const usage = agent.getSessionUsage();
      const config = getConfig();

      console.log(theme.emphasis('\nSession Token Usage:'));
      console.log(theme.dim(`  Input:      ${usage.input.toLocaleString()}`));
      console.log(theme.dim(`  Output:     ${usage.output.toLocaleString()}`));
      console.log(theme.info(`  Total:      ${usage.total.toLocaleString()}`));

      if (usage.cost > 0) {
        console.log(theme.dim(`  Est. Cost:  $${usage.cost.toFixed(4)}`));
      }

      if (config.maxSessionTokens > 0) {
        const percent = (usage.total / config.maxSessionTokens) * 100;
        const color = percent > 80 ? theme.warning : theme.dim;
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
      console.log(theme.emphasis('\nContext Statistics:'));
      console.log(
        theme.dim(
          `  Tokens:     ~${stats.currentTokens} / ${stats.maxTokens} (${stats.percentUsed}%)`,
        ),
      );
      console.log(theme.dim(`  Messages:   ${stats.messageCount}`));
      console.log(theme.dim(`  Has summary: ${stats.hasSummary ? 'Yes' : 'No'}`));
      if (stats.needsCompression) {
        console.log(theme.warning(`  ⚠ Context will be compressed on next message`));
      }
      console.log('');
      return true;
    }

    case 'help':
    case '?':
      console.log(theme.emphasis('\nCommands:'));
      console.log(theme.dim('  /history [n] - View conversation history (default: all/paginated)'));
      console.log(theme.dim('  /clear       - Clear conversation history'));
      console.log(theme.dim('  /config      - Show current configuration'));
      console.log(theme.dim('  /tokens      - Show session token usage & cost'));
      console.log(theme.dim('  /stats       - Show context/token statistics'));
      console.log(theme.dim('  /exit        - Exit the session'));

      console.log(theme.dim('  /system [prompt] - View or update system prompt'));
      console.log(theme.dim('  /save [name] - Save conversation to file'));
      console.log(theme.dim('  /load [file] - Load conversation from file (or list available)'));
      console.log(theme.dim('  /branch [name] - Create a new branch or show current branch'));
      console.log(theme.dim('  /checkout <name> - Switch to a different branch'));
      console.log(theme.dim('  /multi       - Enter multi-line input mode (end with /end)'));
      console.log(theme.dim('  /parallel <prompt> - Execute task with multiple workers'));
      console.log(theme.dim('  /workers     - Show worker pool status'));
      console.log(theme.dim('  /help        - Show this help\n'));
      return true;

    case 'branch':
      if (args.length === 0) {
        if (currentBranch) {
          console.log(theme.info(`Current branch: ${currentBranch}`));
        } else {
          console.log(theme.dim('No active branch (main conversation).'));
        }
        return true;
      }

      if (args[0] === '--list' || args[0] === '-l') {
        const branches = await branchManager.listBranches();
        if (branches.length === 0) {
          console.log(theme.dim('No branches found.'));
        } else {
          console.log(theme.emphasis('\nBranches:'));
          for (const b of branches) {
            const isCurrent = b.name === currentBranch;
            const marker = isCurrent ? theme.success('*') : ' ';
            const date = new Date(b.lastModified).toISOString().slice(0, 10);
            console.log(
              `${marker} ${theme.info(b.name.padEnd(20))} ${theme.dim(`${b.messageCount} msgs`)} ${theme.dim(date)}`,
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
        await sessionManager.setLastBranch(newBranchName);
        console.log(theme.success(`Created and switched to branch '${newBranchName}'`));
      } catch (error) {
        const err = error as Error;
        console.log(theme.error(`Error: ${err.message}`));
      }
      return true;

    case 'checkout':
      if (args.length === 0) {
        console.log(theme.warning('Usage: /checkout <branch-name>'));
        return true;
      }

      try {
        const targetBranch = args[0];
        const config = getConfig();

        // Check if target branch exists
        if (!branchManager.branchExists(targetBranch)) {
          console.log(theme.error(`Branch '${targetBranch}' not found.`));
          return true;
        }

        // Warn about unsaved changes if configured
        if (config.warnUnsavedBranchSwitch && currentBranch) {
          const confirm = await lineEditor.read(
            theme.warning(`Switch from '${currentBranch}' to '${targetBranch}'? (y/n): `),
          );
          if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
            console.log(theme.dim('Checkout cancelled.'));
            return true;
          }
        }

        // Perform checkout
        const newHistory = await branchManager.checkout(
          targetBranch,
          currentBranch,
          agent.getHistory(),
        );

        // Replace agent history with loaded branch
        agent.clearHistory();
        newHistory.forEach((msg) => agent.getHistory().push(msg));

        setBranch(targetBranch);
        await sessionManager.setLastBranch(targetBranch);
        console.log(theme.success(`Switched to branch '${targetBranch}'`));
      } catch (error) {
        const err = error as Error;
        console.log(theme.error(`Error: ${err.message}`));
      }
      return true;

    case 'load':
      if (args.length === 0 || args[0] === '--list') {
        const files = listConversations();
        if (files.length === 0) {
          console.log(theme.dim('No saved conversations found.'));
        } else {
          console.log(theme.emphasis('\nSaved Conversations:'));
          files.forEach((f) => console.log(theme.info(`  ${f}`)));
          console.log('');
        }
        return true;
      }

      try {
        // Confirm before overwriting current session?
        // ideally yes, but for now let's just do it or maybe check if history is empty.
        // user explicitly typed /load, so they probably know what they are doing.

        const count = await loadConversation(agent, args[0]);
        console.log(theme.success(`Loaded conversation with ${count} messages.`));
        console.log(theme.dim('Context updated.'));
      } catch (error) {
        const err = error as Error;
        console.log(theme.error(`Error loading conversation: ${err.message}`));
      }
      return true;

    case 'save':
      try {
        const socketPath = await saveConversation(agent, args[0]);
        console.log(theme.success(`Conversation saved to: ${socketPath}`));
      } catch (error) {
        const err = error as Error;
        console.log(theme.error(`Error saving conversation: ${err.message}`));
      }
      return true;

    case 'multi':
      multiLineHandler.setMode('explicit');
      console.log(
        theme.warning('Entering multi-line mode. Type /end to submit, /cancel to discard.'),
      );
      return true;

    case 'cancel':
      multiLineHandler.cancel();
      console.log(theme.warning('Input cancelled.'));
      return true;

    case 'system':
      if (args.length === 0) {
        console.log(theme.emphasis('\nCurrent System Prompt:'));
        console.log(theme.dim(agent.getSystemPrompt()));
        console.log('');
      } else {
        const newPrompt = args.join(' ');
        try {
          agent.updateSystemPrompt(newPrompt);
          console.log(theme.success('System prompt updated.'));
        } catch (error) {
          const err = error as Error;
          console.log(theme.error(`Error updating system prompt: ${err.message}`));
        }
      }
      return true;

    case 'history':
    case 'log':
      await showHistory(agent, lineEditor, args[0]);
      return true;

    case 'parallel':
      if (!coordinator) {
        console.log(theme.error('Error: Multi-worker system not initialized.'));
        return true;
      }
      if (args.length === 0) {
        console.log(theme.warning('Usage: /parallel <your task description>'));
        console.log(
          theme.dim('Example: /parallel Refactor the authentication module and update tests'),
        );
        return true;
      }

      try {
        const parallelPrompt = args.join(' ');
        await processWithMultiWorker(parallelPrompt, coordinator);
      } catch (error) {
        const err = error as Error;
        console.log(theme.error(`Error executing parallel tasks: ${err.message}`));
      }
      return true;

    case 'workers': {
      if (!coordinator) {
        console.log(theme.error('Error: Multi-worker system not initialized.'));
        return true;
      }

      const stats = coordinator.getStats();
      console.log(theme.emphasis('\n👷 Worker Pool Status:\n'));
      console.log(theme.dim(`  Total Workers:     ${stats.total}`));
      console.log(theme.dim(`  Idle:              ${theme.success(stats.idle.toString())}`));
      console.log(theme.dim(`  Busy:              ${theme.warning(stats.busy.toString())}`));
      console.log(
        theme.dim(
          `  Error:             ${stats.error > 0 ? theme.error(stats.error.toString()) : '0'}`,
        ),
      );
      console.log(theme.dim(`  Stopped:           ${stats.stopped}`));
      console.log(theme.dim(`  Tasks Completed:   ${stats.totalTasksCompleted}`));
      console.log(theme.dim(`  Total Errors:      ${stats.totalErrors}`));
      console.log('');
      return true;
    }

    default:
      console.log(theme.warning(`Unknown command: /${cmd}. Type /help for available commands.`));
      return true;
  }
}

async function showHistory(agent: Agent, lineEditor: LineEditor, arg?: string): Promise<void> {
  const allHistory = agent
    .getHistory()
    .filter((item) => item.role === 'user' || item.role === 'assistant');

  if (allHistory.length === 0) {
    console.log(theme.dim('No history yet.'));
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
      theme.emphasis(
        `Conversation History (Page ${currentPage + 1}/${totalPages}) - ${allHistory.length} messages\n`,
      ),
    );

    let start = allHistory.length - (currentPage + 1) * pageSize;
    let end = allHistory.length - currentPage * pageSize;

    if (start < 0) start = 0;
    if (end > allHistory.length) end = allHistory.length;

    const pageMessages = allHistory.slice(start, end);
    printMessages(pageMessages);

    console.log(theme.dim('\n----------------------------------------'));
    console.log(theme.dim(`Viewing ${start + 1}-${end} of ${allHistory.length} messages.`));

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

    const roleColor = formatRole(item.role as 'user' | 'assistant' | 'system');
    const roleName = item.role.toUpperCase();

    console.log(theme.dim(`[${timeStr}] `) + roleColor(roleName) + ':');

    // Simple content rendering
    if (item.content) {
      console.log(item.content);
    } else if ('tool_calls' in item && item.tool_calls) {
      console.log(theme.dim('(Tool calls hidden)'));
    }
    console.log(theme.dim('---'));
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
