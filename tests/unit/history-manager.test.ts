import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HistoryManager } from '../../src/input/history-manager';
import fs from 'fs';
import path from 'path';
import os from 'os';

const HISTORY_DIR = path.join(os.homedir(), '.cadre');
const HISTORY_FILE = path.join(HISTORY_DIR, 'history');

describe('HistoryManager', () => {
  let historyManager: HistoryManager;

  beforeEach(() => {
    // Clear any existing history
    if (fs.existsSync(HISTORY_FILE)) {
      fs.unlinkSync(HISTORY_FILE);
    }
    historyManager = new HistoryManager();
  });

  afterEach(() => {
    // Clean up test files
    if (fs.existsSync(HISTORY_FILE)) {
      fs.unlinkSync(HISTORY_FILE);
    }
  });

  describe('add', () => {
    it('should add entries to history', () => {
      historyManager.add('command1');
      historyManager.add('command2');

      const all = historyManager.getAll();
      expect(all).toEqual(['command1', 'command2']);
    });

    it('should skip empty entries', () => {
      historyManager.add('command1');
      historyManager.add('');
      historyManager.add('   ');
      historyManager.add('command2');

      const all = historyManager.getAll();
      expect(all).toEqual(['command1', 'command2']);
    });

    it('should skip consecutive duplicates', () => {
      historyManager.add('command1');
      historyManager.add('command1');
      historyManager.add('command2');
      historyManager.add('command2');
      historyManager.add('command1');

      const all = historyManager.getAll();
      expect(all).toEqual(['command1', 'command2', 'command1']);
    });

    it('should enforce FIFO with 1000 entry limit', () => {
      // Add 1005 entries
      for (let i = 0; i < 1005; i++) {
        historyManager.add(`command${i}`);
      }

      const all = historyManager.getAll();
      expect(all.length).toBe(1000);
      // Should keep the most recent 1000
      expect(all[0]).toBe('command5');
      expect(all[999]).toBe('command1004');
    });
  });

  describe('navigation', () => {
    beforeEach(() => {
      historyManager.add('cmd1');
      historyManager.add('cmd2');
      historyManager.add('cmd3');
    });

    it('should navigate backward through history', () => {
      expect(historyManager.getPrevious('current')).toBe('cmd3');
      expect(historyManager.getPrevious('current')).toBe('cmd2');
      expect(historyManager.getPrevious('current')).toBe('cmd1');
    });

    it('should stay at beginning when going back from first entry', () => {
      historyManager.getPrevious('current');
      historyManager.getPrevious('current');
      historyManager.getPrevious('current');
      expect(historyManager.getPrevious('current')).toBe('cmd1');
    });

    it('should navigate forward through history', () => {
      historyManager.getPrevious('current');
      historyManager.getPrevious('current');
      expect(historyManager.getNext()).toBe('cmd3');
    });

    it('should return original input when navigating past the end', () => {
      historyManager.getPrevious('current input');
      historyManager.getPrevious('current');
      historyManager.getPrevious('current');
      expect(historyManager.getNext()).toBe('cmd2');
      expect(historyManager.getNext()).toBe('cmd3');
      expect(historyManager.getNext()).toBe('current input');
    });

    it('should reset navigation state', () => {
      historyManager.getPrevious('current');
      historyManager.reset();
      expect(historyManager.getPrevious('new input')).toBe('cmd3');
    });

    it('should return null when no history is available', () => {
      const emptyManager = new HistoryManager();
      expect(emptyManager.getPrevious('input')).toBeNull();
      expect(emptyManager.getNext()).toBeNull();
    });
  });

  describe('search', () => {
    beforeEach(() => {
      historyManager.add('npm install');
      historyManager.add('git commit -m "test"');
      historyManager.add('npm test');
      historyManager.add('git push');
    });

    it('should find matching commands', () => {
      const results = historyManager.search('npm');
      expect(results).toEqual(['npm test', 'npm install']);
    });

    it('should search case-insensitive', () => {
      const results = historyManager.search('GIT');
      expect(results).toEqual(['git push', 'git commit -m "test"']);
    });

    it('should return empty array for empty query', () => {
      expect(historyManager.search('')).toEqual([]);
    });

    it('should return matches in reverse chronological order', () => {
      const results = historyManager.search('git');
      expect(results[0]).toBe('git push');
      expect(results[1]).toBe('git commit -m "test"');
    });

    it('should return empty array when no matches', () => {
      expect(historyManager.search('nonexistent')).toEqual([]);
    });
  });

  describe('persistence', () => {
    // Note: File saving is tested implicitly by other tests.
    // The add() method automatically saves asynchronously.

    it('should load existing history on initialization', () => {
      // Create history file manually
      if (!fs.existsSync(HISTORY_DIR)) {
        fs.mkdirSync(HISTORY_DIR, { recursive: true });
      }
      fs.writeFileSync(HISTORY_FILE, 'saved command 1\nsaved command 2\n', 'utf-8');

      const newManager = new HistoryManager();
      expect(newManager.getAll()).toEqual(['saved command 1', 'saved command 2']);
    });

    it('should handle missing history file gracefully', () => {
      const newManager = new HistoryManager();
      expect(newManager.getAll()).toEqual([]);
    });
  });

  describe('performance', () => {
    it('should load 1000 entries in less than 50ms', () => {
      // Create history file with 1000 entries
      if (!fs.existsSync(HISTORY_DIR)) {
        fs.mkdirSync(HISTORY_DIR, { recursive: true });
      }

      const entries: string[] = [];
      for (let i = 0; i < 1000; i++) {
        entries.push(`command ${i}`);
      }
      fs.writeFileSync(HISTORY_FILE, entries.join('\n'), 'utf-8');

      // Measure load time
      const start = Date.now();
      const newManager = new HistoryManager();
      const elapsed = Date.now() - start;

      expect(newManager.getAll().length).toBe(1000);
      expect(elapsed).toBeLessThan(50);
    });
  });

  describe('clear', () => {
    it('should clear all history and reset state', () => {
      historyManager.add('cmd1');
      historyManager.add('cmd2');
      historyManager.getPrevious('input');

      historyManager.clear();

      expect(historyManager.getAll()).toEqual([]);
      expect(historyManager.getPrevious('input')).toBeNull();
    });
  });
});
