import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import os from 'os';

const MAX_HISTORY_ENTRIES = 1000;
const HISTORY_DIR = path.join(os.homedir(), '.ai');
const HISTORY_FILE = path.join(HISTORY_DIR, 'history');

export class HistoryManager {
  private history: string[] = [];
  private currentIndex: number = -1;
  private originalInput: string = '';

  constructor() {
    // Load history synchronously during construction for performance
    this.loadHistorySync();
  }

  /**
   * Load history from file synchronously for fast initialization.
   * Performance requirement: <50ms
   */
  private loadHistorySync(): void {
    try {
      // Ensure directory exists
      if (!fs.existsSync(HISTORY_DIR)) {
        fs.mkdirSync(HISTORY_DIR, { recursive: true });
      }

      // Read file if it exists
      if (fs.existsSync(HISTORY_FILE)) {
        const content = fs.readFileSync(HISTORY_FILE, 'utf-8');
        this.history = content
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0);

        // Enforce max entries (keep most recent)
        if (this.history.length > MAX_HISTORY_ENTRIES) {
          this.history = this.history.slice(-MAX_HISTORY_ENTRIES);
        }
      }
    } catch (error) {
      // Silently fail - history is not critical
      // eslint-disable-next-line no-console
      console.error('Failed to load history:', error);
    }
  }

  /**
   * Add a new entry to history.
   * Skips empty entries and consecutive duplicates.
   */
  public add(entry: string): void {
    const trimmed = entry.trim();

    // Skip empty entries
    if (!trimmed) {
      return;
    }

    // Skip consecutive duplicates
    const lastEntry = this.history[this.history.length - 1];
    if (lastEntry === trimmed) {
      return;
    }

    // Add entry
    this.history.push(trimmed);

    // Enforce max entries (FIFO)
    if (this.history.length > MAX_HISTORY_ENTRIES) {
      this.history.shift(); // Remove oldest
    }

    // Save asynchronously (don't block)
    this.save().catch(() => {
      // Silently fail - history save is not critical
    });
  }

  /**
   * Get the previous entry in history.
   * Returns null if at the beginning.
   */
  public getPrevious(currentInput: string): string | null {
    if (this.history.length === 0) {
      return null;
    }

    // First time navigating - save current input
    if (this.currentIndex === -1) {
      this.originalInput = currentInput;
      this.currentIndex = this.history.length;
    }

    // Move backward
    if (this.currentIndex > 0) {
      this.currentIndex--;
      return this.history[this.currentIndex];
    }

    // At the beginning - wrap around or stay
    return this.history[0];
  }

  /**
   * Get the next entry in history.
   * Returns null if at the end (returns to original input).
   */
  public getNext(): string | null {
    if (this.history.length === 0 || this.currentIndex === -1) {
      return null;
    }

    // Move forward
    this.currentIndex++;

    // Past the end - return original input
    if (this.currentIndex >= this.history.length) {
      this.currentIndex = -1;
      return this.originalInput;
    }

    return this.history[this.currentIndex];
  }

  /**
   * Search history for entries matching the query.
   * Returns matches in reverse chronological order (most recent first).
   */
  public search(query: string): string[] {
    if (!query) {
      return [];
    }

    const lowerQuery = query.toLowerCase();
    const matches: string[] = [];

    // Search backwards (most recent first)
    for (let i = this.history.length - 1; i >= 0; i--) {
      if (this.history[i].toLowerCase().includes(lowerQuery)) {
        matches.push(this.history[i]);
      }
    }

    return matches;
  }

  /**
   * Reset navigation state.
   * Call this when starting a new input.
   */
  public reset(): void {
    this.currentIndex = -1;
    this.originalInput = '';
  }

  /**
   * Save history to disk asynchronously.
   */
  private async save(): Promise<void> {
    try {
      // Ensure directory exists
      await fsPromises.mkdir(HISTORY_DIR, { recursive: true });

      // Write history file
      const content = this.history.join('\n');
      await fsPromises.writeFile(HISTORY_FILE, content, 'utf-8');
    } catch (error) {
      // Silently fail - history save is not critical
      throw error;
    }
  }

  /**
   * Get all history entries (for testing).
   */
  public getAll(): string[] {
    return [...this.history];
  }

  /**
   * Clear all history (for testing).
   */
  public clear(): void {
    this.history = [];
    this.currentIndex = -1;
    this.originalInput = '';
  }
}
