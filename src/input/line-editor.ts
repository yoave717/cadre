import * as readline from 'readline';
import { HistoryManager } from './history-manager.js';

export interface LineEditorOptions {
  prompt?: string;
  mask?: boolean; // For future password support if needed/optional
  completionCallback?: (text: string) => string[] | Promise<string[]>; // Tab completion callback
  suggestionCallback?: (text: string) => string; // Inline suggestion callback (for grayed-out text)
}

export class LineEditor {
  private buffer: string = '';
  private cursor: number = 0;
  private prompt: string = '> ';
  private resolve: ((value: string) => void) | null = null;
  private reject: ((reason?: unknown) => void) | null = null;
  private active: boolean = false;
  private history: HistoryManager = new HistoryManager();
  private searchMode: boolean = false;
  private searchQuery: string = '';
  private searchMatches: string[] = [];
  private searchIndex: number = 0;
  private completionCallback: ((text: string) => string[] | Promise<string[]>) | null = null;
  private suggestionCallback: ((text: string) => string) | null = null;
  private completions: string[] = [];
  private completionIndex: number = 0;
  private completionPrefix: string = '';

  constructor() {}

  /**
   * Read a line of input from stdout.
   */
  public async read(prompt: string, options?: LineEditorOptions): Promise<string> {
    if (this.active) {
      throw new Error('LineEditor is already active.');
    }

    this.prompt = prompt;
    this.buffer = '';
    this.cursor = 0;
    this.active = true;
    this.history.reset();
    this.searchMode = false;
    this.searchQuery = '';
    this.searchMatches = [];
    this.searchIndex = 0;
    this.completionCallback = options?.completionCallback || null;
    this.suggestionCallback = options?.suggestionCallback || null;
    this.completions = [];
    this.completionIndex = 0;
    this.completionPrefix = '';

    return new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;

      this.startRawMode();
      this.render();
    });
  }

  private startRawMode() {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', this.handleData);
    } else {
      // Fallback for non-TTY (testing or pipe) - usage might differ, but for interactive CLI we expect TTY
      // If not TTY, we might just read line by line standard way, but this class is specifically for interactive
      // For now, we assume TTY or mock in tests.
    }
  }

  private stopRawMode() {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('data', this.handleData);
    }
  }

  private handleData = async (data: Buffer | string) => {
    const input = data.toString();

    // Handle special keys
    // We might get multiple chars in one chunk, but for typing usually it's one or escape sequences

    // Check for escape sequences first
    if (input.startsWith('\u001b')) {
      this.handleEscapeSequence(input);
      return;
    }

    // Control characters
    if (input.length === 1) {
      const charCode = input.charCodeAt(0);

      // Ctrl+C
      if (charCode === 3) {
        this.cleanup();
        this.reject?.(new Error('User force closed'));
        return;
      }

      // Enter / Return
      if (charCode === 13) {
        process.stdout.write('\n'); // New line
        if (this.searchMode) {
          this.selectSearchResult();
        } else {
          this.cleanup();
          // Add to history before resolving
          this.history.add(this.buffer);
          this.resolve?.(this.buffer);
        }
        return;
      }

      // Backspace (127 or 8)
      if (charCode === 127 || charCode === 8) {
        if (this.searchMode) {
          this.handleSearchBackspace();
        } else {
          this.handleBackspace();
        }
        return;
      }

      // Ctrl+A (Start)
      if (charCode === 1) {
        this.cursor = 0;
        this.render();
        return;
      }

      // Ctrl+E (End)
      if (charCode === 5) {
        this.cursor = this.buffer.length;
        this.render();
        return;
      }

      // Ctrl+U (Clear Line)
      if (charCode === 21) {
        this.buffer = '';
        this.cursor = 0;
        this.render();
        return;
      }

      // Ctrl+K (Kill to end)
      if (charCode === 11) {
        this.buffer = this.buffer.slice(0, this.cursor);
        this.render();
        return;
      }

      // Ctrl+R (Reverse search)
      if (charCode === 18) {
        this.enterSearchMode();
        return;
      }

      // Tab (9) - Tab completion
      if (charCode === 9) {
        await this.handleTab();
        return;
      }

      // Normal characters (printable)
      if (charCode >= 32 && charCode !== 127) {
        if (this.searchMode) {
          this.updateSearch(input);
        } else {
          this.insert(input);
        }
        return;
      }
    }

    // If we receive a chunk of text (paste), insert it
    // But we need to filter out control chars?
    // For simplicity, just insert printable stuff
    if ([...input].every((c) => c.charCodeAt(0) >= 32)) {
      this.insert(input);
    }
  };

  private handleEscapeSequence(seq: string) {
    // ESC key to exit search mode
    if (seq === '\u001b' && this.searchMode) {
      this.exitSearchMode();
      return;
    }

    switch (seq) {
      case '\u001b[A': // Up Arrow
        if (this.searchMode) {
          this.navigateSearchUp();
        } else {
          this.loadPreviousHistory();
        }
        break;
      case '\u001b[B': // Down Arrow
        if (this.searchMode) {
          this.navigateSearchDown();
        } else {
          this.loadNextHistory();
        }
        break;
      case '\u001b[D': // Left Arrow
        if (this.cursor > 0) {
          this.cursor--;
          this.render();
        }
        break;
      case '\u001b[C': // Right Arrow
        if (this.cursor < this.buffer.length) {
          this.cursor++;
          this.render();
        } else if (this.cursor === this.buffer.length && this.suggestionCallback) {
          // Accept inline suggestion when pressing right arrow at end
          const suggestion = this.suggestionCallback(this.buffer);
          if (suggestion) {
            this.buffer += suggestion;
            this.cursor = this.buffer.length;
            this.render();
          }
        }
        break;
      case '\u001b[H': // Home (some terms)
      case '\u001b[1~': // Home (others)
        this.cursor = 0;
        this.render();
        break;
      case '\u001b[F': // End (some terms)
      case '\u001b[4~': // End (others)
        this.cursor = this.buffer.length;
        this.render();
        break;
      case '\u001b[3~': // Delete (Forward)
        if (this.cursor < this.buffer.length) {
          const left = this.buffer.slice(0, this.cursor);
          const right = this.buffer.slice(this.cursor + 1);
          this.buffer = left + right;
          this.render();
        }
        break;
      default:
        // Ignore unknown
        break;
    }
  }

  private handleBackspace() {
    if (this.cursor > 0) {
      const left = this.buffer.slice(0, this.cursor - 1);
      const right = this.buffer.slice(this.cursor);
      this.buffer = left + right;
      this.cursor--;
      this.render();
    }
  }

  private insert(text: string) {
    // Reset completions when user types (not tab)
    this.completions = [];
    this.completionIndex = 0;
    this.completionPrefix = '';

    const left = this.buffer.slice(0, this.cursor);
    const right = this.buffer.slice(this.cursor);
    this.buffer = left + text + right;
    this.cursor += text.length;
    this.render();
  }

  private render() {
    if (!this.active) return;

    // Save cursor position, clear from cursor to end of line, restore cursor
    // This is more efficient than clearing the entire line
    const promptLength = this.getPromptLength();
    
    if (this.searchMode) {
      // For search mode, we need to redraw everything
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
      
      // Display search mode UI
      const currentMatch =
        this.searchMatches.length > 0 ? this.searchMatches[this.searchIndex] : '';
      const matchInfo =
        this.searchMatches.length > 0
          ? ` [${this.searchIndex + 1}/${this.searchMatches.length}]`
          : ' [no matches]';
      const searchPrompt = `(reverse-i-search)\`${this.searchQuery}': ${currentMatch}${matchInfo}`;
      process.stdout.write(searchPrompt);
    } else {
      // Move cursor to start of line
      readline.cursorTo(process.stdout, 0);
      
      // Write prompt and buffer
      process.stdout.write(this.prompt + this.buffer);

      // Show inline suggestion if cursor is at end and we have a suggestion callback
      if (this.cursor === this.buffer.length && this.suggestionCallback) {
        const suggestion = this.suggestionCallback(this.buffer);
        if (suggestion) {
          // Display suggestion in gray (dim)
          process.stdout.write('\u001b[90m' + suggestion + '\u001b[0m');
        }
      }

      // Clear from cursor to end of line (removes any leftover characters)
      process.stdout.write('\u001b[K');

      // Move cursor to correct position
      readline.cursorTo(process.stdout, promptLength + this.cursor);
    }
  }

  private getPromptLength(): number {
    // Strip ALL ANSI escape sequences from prompt to get real visible length
    // This regex matches all ANSI escape sequences including:
    // - Simple color codes: \u001b[31m
    // - 256-color codes: \u001b[38;5;217m
    // - RGB color codes: \u001b[38;2;255;181;167m
    // - Reset codes: \u001b[0m
    // - Bold, dim, etc: \u001b[1m, \u001b[2m
    // eslint-disable-next-line no-control-regex
    const stripped = this.prompt.replace(/\u001b\[[0-9;]*m/g, '');
    return stripped.length;
  }

  private cleanup() {
    this.active = false;
    this.stopRawMode();
  }

  private loadPreviousHistory() {
    const prev = this.history.getPrevious(this.buffer);
    if (prev !== null) {
      this.buffer = prev;
      this.cursor = this.buffer.length;
      this.render();
    }
  }

  private loadNextHistory() {
    const next = this.history.getNext();
    if (next !== null) {
      this.buffer = next;
      this.cursor = this.buffer.length;
      this.render();
    }
  }

  private enterSearchMode() {
    this.searchMode = true;
    this.searchQuery = '';
    this.searchMatches = [];
    this.searchIndex = 0;
    this.render();
  }

  private exitSearchMode() {
    this.searchMode = false;
    this.searchQuery = '';
    this.searchMatches = [];
    this.searchIndex = 0;
    this.render();
  }

  private updateSearch(char: string) {
    this.searchQuery += char;
    this.searchMatches = this.history.search(this.searchQuery);
    this.searchIndex = 0;
    this.render();
  }

  private navigateSearchUp() {
    if (this.searchMatches.length > 0 && this.searchIndex > 0) {
      this.searchIndex--;
      this.render();
    }
  }

  private navigateSearchDown() {
    if (this.searchMatches.length > 0 && this.searchIndex < this.searchMatches.length - 1) {
      this.searchIndex++;
      this.render();
    }
  }

  private selectSearchResult() {
    if (this.searchMatches.length > 0) {
      this.buffer = this.searchMatches[this.searchIndex];
      this.cursor = this.buffer.length;
    }
    this.exitSearchMode();
  }

  private handleSearchBackspace() {
    if (this.searchQuery.length > 0) {
      this.searchQuery = this.searchQuery.slice(0, -1);
      this.searchMatches = this.history.search(this.searchQuery);
      this.searchIndex = 0;
      this.render();
    }
  }

  private async handleTab() {
    if (!this.completionCallback) {
      // No completion callback, ignore Tab
      return;
    }

    // If we don't have active completions, start a new completion cycle
    if (this.completions.length === 0) {
      const result = this.completionCallback(this.buffer);
      this.completions = result instanceof Promise ? await result : result;
      this.completionIndex = 0;
      this.completionPrefix = this.buffer;

      if (this.completions.length === 0) {
        // No completions available
        return;
      }
    }

    // Cycle through completions
    const completion = this.completions[this.completionIndex];

    // Replace buffer with completion
    this.buffer = completion;
    this.cursor = this.buffer.length;

    // Move to next completion for next Tab press
    this.completionIndex = (this.completionIndex + 1) % this.completions.length;

    this.render();
  }
}
