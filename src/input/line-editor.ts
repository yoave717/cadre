import * as readline from 'readline';

export interface LineEditorOptions {
  prompt?: string;
  mask?: boolean; // For future password support if needed/optional
}

export class LineEditor {
  private buffer: string = '';
  private cursor: number = 0;
  private prompt: string = '> ';
  private resolve: ((value: string) => void) | null = null;
  private reject: ((reason?: unknown) => void) | null = null;
  private active: boolean = false;

  constructor() {}

  /**
   * Read a line of input from stdout.
   */
  public async read(prompt: string): Promise<string> {
    if (this.active) {
      throw new Error('LineEditor is already active.');
    }

    this.prompt = prompt;
    this.buffer = '';
    this.cursor = 0;
    this.active = true;

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

  private handleData = (data: Buffer | string) => {
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
        this.cleanup();
        this.resolve?.(this.buffer);
        return;
      }

      // Backspace (127 or 8)
      if (charCode === 127 || charCode === 8) {
        this.handleBackspace();
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

      // Normal characters (printable)
      if (charCode >= 32 && charCode !== 127) {
        this.insert(input);
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
    switch (seq) {
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
    const left = this.buffer.slice(0, this.cursor);
    const right = this.buffer.slice(this.cursor);
    this.buffer = left + text + right;
    this.cursor += text.length;
    this.render();
  }

  private render() {
    if (!this.active) return;

    // Clear current line
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);

    // Print prompt and buffer
    process.stdout.write(this.prompt + this.buffer);

    // Move cursor to correct position
    readline.cursorTo(process.stdout, this.getPromptLength() + this.cursor);
  }

  private getPromptLength(): number {
    // Strip ANSI codes from prompt to get real length
    // eslint-disable-next-line no-control-regex
    const stripped = this.prompt.replace(/\u001b\[\d+m/g, '');
    return stripped.length;
  }

  private cleanup() {
    this.active = false;
    this.stopRawMode();
  }
}
