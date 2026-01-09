/**
 * Multi-line input handling for CLI.
 * Supports:
 * - Triple backtick blocks (```...```)
 * - Here-doc style (<<EOF...EOF)
 * - Continuation detection (unclosed brackets, trailing backslash)
 * - Bracketed paste mode
 */

export type InputMode = 'normal' | 'backtick' | 'heredoc' | 'continuation';

export interface MultiLineResult {
  complete: boolean;
  content: string;
  mode: InputMode;
}

/**
 * Multi-line input handler that accumulates input until complete.
 */
export class MultiLineHandler {
  private buffer: string[] = [];

  private mode: InputMode = 'normal';

  private delimiter: string = '';

  /**
   * Process a line of input and determine if the input is complete.
   */
  processLine(line: string): MultiLineResult {
    // Check for mode triggers when in normal mode
    if (this.mode === 'normal') {
      // Triple backtick start
      if (line.trim() === '```' || line.trim().startsWith('```')) {
        this.mode = 'backtick';
        this.buffer = [line];
        return { complete: false, content: '', mode: this.mode };
      }

      // Here-doc start (<<EOF or <<END)
      const heredocMatch = line.match(/^<<(\w+)$/);
      if (heredocMatch) {
        this.mode = 'heredoc';
        this.delimiter = heredocMatch[1];
        this.buffer = [];
        return { complete: false, content: '', mode: this.mode };
      }

      // Check for unclosed constructs
      if (this.hasUnclosedConstruct(line)) {
        this.mode = 'continuation';
        this.buffer = [line];
        return { complete: false, content: '', mode: this.mode };
      }

      // Normal single-line input
      return { complete: true, content: line, mode: 'normal' };
    }

    // Accumulate in multi-line mode
    this.buffer.push(line);

    // Check for mode exit conditions
    if (this.mode === 'backtick') {
      if (line.trim() === '```') {
        const content = this.buffer.join('\n');
        this.reset();
        return { complete: true, content, mode: 'normal' };
      }
    }

    if (this.mode === 'heredoc') {
      if (line.trim() === this.delimiter) {
        // Don't include the delimiter in the content
        const content = this.buffer.slice(0, -1).join('\n');
        this.reset();
        return { complete: true, content, mode: 'normal' };
      }
    }

    if (this.mode === 'continuation') {
      const fullContent = this.buffer.join('\n');
      if (!this.hasUnclosedConstruct(fullContent)) {
        this.reset();
        return { complete: true, content: fullContent, mode: 'normal' };
      }
    }

    return { complete: false, content: '', mode: this.mode };
  }

  /**
   * Check if text has unclosed constructs that suggest continuation.
   */
  private hasUnclosedConstruct(text: string): boolean {
    // Trailing backslash (line continuation)
    if (text.trimEnd().endsWith('\\')) {
      return true;
    }

    // Count brackets (basic check - doesn't handle strings properly)
    const stripped = this.stripStrings(text);

    const opens = (stripped.match(/[\{\[\(]/g) || []).length;
    const closes = (stripped.match(/[\}\]\)]/g) || []).length;

    if (opens > closes) {
      return true;
    }

    return false;
  }

  /**
   * Strip string contents to avoid false positives on bracket counting.
   * This is a simplified version - doesn't handle all edge cases.
   */
  private stripStrings(text: string): string {
    // Remove double-quoted strings
    let result = text.replace(/"(?:[^"\\]|\\.)*"/g, '""');
    // Remove single-quoted strings
    result = result.replace(/'(?:[^'\\]|\\.)*'/g, "''");
    // Remove template literals (backtick strings)
    result = result.replace(/`(?:[^`\\]|\\.)*`/g, '``');
    return result;
  }

  /**
   * Reset the handler state.
   */
  reset(): void {
    this.buffer = [];
    this.mode = 'normal';
    this.delimiter = '';
  }

  /**
   * Get current mode.
   */
  getMode(): InputMode {
    return this.mode;
  }

  /**
   * Get current buffer contents.
   */
  getBuffer(): string {
    return this.buffer.join('\n');
  }

  /**
   * Check if currently in multi-line mode.
   */
  isMultiLine(): boolean {
    return this.mode !== 'normal';
  }

  /**
   * Force completion of current input (e.g., on Ctrl+D).
   */
  forceComplete(): string {
    const content = this.buffer.join('\n');
    this.reset();
    return content;
  }
}

/**
 * Bracketed paste mode handler.
 * Terminals wrap pasted content with escape sequences.
 */
export class BracketedPasteHandler {
  private static readonly PASTE_START = '\x1b[200~';

  private static readonly PASTE_END = '\x1b[201~';

  private isPasting = false;

  private pasteBuffer = '';

  /**
   * Enable bracketed paste mode in terminal.
   */
  static enable(stream: NodeJS.WriteStream): void {
    stream.write('\x1b[?2004h');
  }

  /**
   * Disable bracketed paste mode in terminal.
   */
  static disable(stream: NodeJS.WriteStream): void {
    stream.write('\x1b[?2004l');
  }

  /**
   * Process input chunk and detect paste events.
   */
  processChunk(chunk: string): { isPaste: boolean; content: string; complete: boolean } {
    // Start of paste
    if (chunk.includes(BracketedPasteHandler.PASTE_START)) {
      this.isPasting = true;
      this.pasteBuffer = chunk.replace(BracketedPasteHandler.PASTE_START, '');

      // Check if paste also ends in this chunk
      if (this.pasteBuffer.includes(BracketedPasteHandler.PASTE_END)) {
        const content = this.pasteBuffer.replace(BracketedPasteHandler.PASTE_END, '');
        this.reset();
        return { isPaste: true, content, complete: true };
      }

      return { isPaste: true, content: '', complete: false };
    }

    // Continuing paste
    if (this.isPasting) {
      this.pasteBuffer += chunk;

      if (this.pasteBuffer.includes(BracketedPasteHandler.PASTE_END)) {
        const content = this.pasteBuffer.replace(BracketedPasteHandler.PASTE_END, '');
        this.reset();
        return { isPaste: true, content, complete: true };
      }

      return { isPaste: true, content: '', complete: false };
    }

    // Not a paste event
    return { isPaste: false, content: chunk, complete: true };
  }

  /**
   * Reset paste state.
   */
  reset(): void {
    this.isPasting = false;
    this.pasteBuffer = '';
  }

  /**
   * Check if currently processing a paste.
   */
  isProcessingPaste(): boolean {
    return this.isPasting;
  }
}

/**
 * Get prompt indicator based on current input mode.
 */
export function getModePrompt(mode: InputMode): string {
  switch (mode) {
    case 'backtick':
      return '... ';
    case 'heredoc':
      return '> ';
    case 'continuation':
      return '... ';
    default:
      return '❯ ';
  }
}
