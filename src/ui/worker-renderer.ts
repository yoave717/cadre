import chalk from 'chalk';
import type { WorkerMessage } from '../workers/index.js';

interface WorkerDisplayState {
  id: string;
  status: 'idle' | 'busy' | 'error' | 'stopped';
  subStatus?: 'thinking' | 'tool-use';
  taskId?: string;
  taskDescription?: string;
  lastTool?: string;
  lastToolArgs?: string;
  error?: string;
}

export class WorkerStatusRenderer {
  private workers: Map<string, WorkerDisplayState> = new Map();
  private isRendering = false;
  private lastLineCount = 0;
  private spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private frameIndex = 0;
  private spinnerInterval?: NodeJS.Timeout;

  start() {
    this.isRendering = true;
    process.stdout.write('\n'); // Start with a newline
    this.spinnerInterval = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % this.spinnerFrames.length;
      this.render();
    }, 80);
  }

  stop() {
    this.isRendering = false;
    if (this.spinnerInterval) {
      clearInterval(this.spinnerInterval);
      this.spinnerInterval = undefined;
    }
    // Force one last render
    this.render();
    console.log('');
    this.lastLineCount = 0;
  }

  update(message: WorkerMessage) {
    if (!this.isRendering) return;

    let worker = this.workers.get(message.workerId);
    if (!worker) {
      worker = { id: message.workerId, status: 'idle' };
      this.workers.set(message.workerId, worker);
    }

    switch (message.type) {
      case 'task-start':
        worker.status = 'busy';
        worker.subStatus = 'thinking'; // Default to thinking at start
        worker.taskId = message.taskId;
        worker.taskDescription = message.data?.description as string;
        worker.lastTool = undefined;
        worker.error = undefined;
        break;
      case 'task-progress':
        worker.status = 'busy';
        if (message.data?.status === 'thinking') {
          worker.subStatus = 'thinking';
        } else if (message.data?.status === 'tool-use') {
          worker.subStatus = 'tool-use';
          if (message.data?.tool) {
            worker.lastTool = message.data.tool as string;
          }
        } else if (message.data?.tool) {
          // Fallback for backward compatibility if status isn't sent
          worker.subStatus = 'tool-use';
          worker.lastTool = message.data.tool as string;
        }
        break;
      case 'task-complete':
        worker.status = 'idle';
        worker.taskId = undefined;
        // worker.taskDescription = undefined; // Keep description or clear? Maybe clear to show idle
        worker.lastTool = undefined;
        break;
      case 'task-error':
        worker.status = 'error';
        worker.error = message.data?.error as string;
        break;
    }

    this.render();
  }

  clear() {
    if (this.lastLineCount > 0) {
      process.stdout.write(`\x1B[${this.lastLineCount}A`); // Move up N lines
      process.stdout.write('\x1B[0J'); // Clear from cursor to end of screen
      this.lastLineCount = 0;
    }
  }

  private render() {
    if (!this.isRendering) return;

    // Clear previous lines
    if (this.lastLineCount > 0) {
      // Move cursor up and clear lines
      process.stdout.write(`\x1B[${this.lastLineCount}A`); // Move up N lines
      process.stdout.write('\x1B[0J'); // Clear from cursor to end of screen
    }

    const lines: string[] = [];
    lines.push(chalk.bold('Worker Pool Status:'));

    // Sort workers by ID
    const sortedWorkers = Array.from(this.workers.values()).sort((a, b) => {
      // Extract number from worker-N
      const numA = parseInt(a.id.split('-')[1] || '0');
      const numB = parseInt(b.id.split('-')[1] || '0');
      return numA - numB;
    });

    if (sortedWorkers.length === 0) {
      lines.push(chalk.dim('  Waiting for workers to initialize...'));
    }

    const spinner = this.spinnerFrames[this.frameIndex];

    for (const worker of sortedWorkers) {
      let statusIcon = chalk.gray('○');
      let statusText = chalk.dim('Idle');

      if (worker.status === 'busy') {
        statusIcon = chalk.cyan(spinner);
        statusText = chalk.cyan('Working');
      } else if (worker.status === 'error') {
        statusIcon = chalk.red('✖');
        statusText = chalk.red('Error');
      } else if (worker.status === 'stopped') {
        statusIcon = chalk.gray('■');
        statusText = chalk.gray('Stopped');
      }

      let line = `  ${statusIcon} ${chalk.bold(worker.id)}: `;

      if (worker.status === 'busy') {
        if (worker.subStatus === 'thinking') {
          line += chalk.dim('Thinking...');
        } else if (worker.subStatus === 'tool-use') {
          const toolName = worker.lastTool || 'tool...';
          const displayTool = toolName.length > 30 ? toolName.slice(0, 27) + '...' : toolName;
          line += chalk.yellow(worker.lastTool ? `Using ${displayTool}` : 'Using tool...');
        } else {
          line += chalk.dim('Working...');
        }

        if (worker.taskId) {
          line += ` [${worker.taskId}]`;
        }
        if (worker.taskDescription) {
          let desc = worker.taskDescription;
          if (desc.length > 40) desc = desc.slice(0, 37) + '...';
          line += ` ${chalk.white(desc)}`;
        }
      } else if (worker.status === 'error') {
        line += chalk.red('Error');
        let err = worker.error || '';
        if (err.length > 50) err = err.slice(0, 47) + '...';
        line += ` ${chalk.red(err)}`;
      } else if (worker.status === 'stopped') {
        line += chalk.gray('Stopped');
      } else {
        line += chalk.dim('Idle');
      }

      lines.push(line);
    }

    // Join lines and print
    const output = lines.join('\n') + '\n';
    process.stdout.write(output);

    // Calculate physical lines occupied (handling wrapping)
    const columns = process.stdout.columns || 80;
    this.lastLineCount = lines.reduce((acc, line) => {
      // Strip ANSI codes to get visible length
      // eslint-disable-next-line no-control-regex
      const visibleLen = line.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').length;
      return acc + Math.ceil(Math.max(1, visibleLen) / columns);
    }, 0);
  }
}
