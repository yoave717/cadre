import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import {
  getCompletions,
  getInlineSuggestion,
  getCommandSuggestions,
} from '../../src/input/completion.js';

describe('Completion System', () => {
  let testDir: string;

  beforeEach(async () => {
    // Create a temporary directory for testing
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cadre-completion-test-'));

    // Create some test files and directories
    await fs.mkdir(path.join(testDir, 'src'));
    await fs.mkdir(path.join(testDir, 'docs'));
    await fs.writeFile(path.join(testDir, 'test.txt'), 'test content');
    await fs.writeFile(path.join(testDir, 'test2.txt'), 'test content 2');
    await fs.writeFile(path.join(testDir, 'src', 'index.ts'), 'export {}');
    await fs.writeFile(path.join(testDir, 'README.md'), '# Test');
  });

  afterEach(async () => {
    // Clean up
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('Command Completion', () => {
    it('should suggest all commands when input is empty', async () => {
      const completions = await getCompletions('');
      expect(completions.length).toBeGreaterThan(0);
      expect(completions).toContain('/help');
      expect(completions).toContain('/save');
      expect(completions).toContain('/exit');
    });

    it('should suggest all commands when input is just /', async () => {
      const completions = await getCompletions('/');
      expect(completions.length).toBeGreaterThan(0);
      expect(completions).toContain('/help');
      expect(completions).toContain('/save');
    });

    it('should filter commands by prefix', async () => {
      const completions = await getCompletions('/he');
      expect(completions).toContain('/help');
      expect(completions).not.toContain('/history');
      expect(completions).not.toContain('/save');
      expect(completions).not.toContain('/exit');
    });

    it('should filter commands with longer prefix', async () => {
      const completions = await getCompletions('/hist');
      expect(completions).toContain('/history');
      expect(completions).not.toContain('/help');
    });

    it('should be case-insensitive', async () => {
      const completions = await getCompletions('/HE');
      expect(completions).toContain('/help');
      expect(completions).not.toContain('/history');
    });
  });

  describe('Branch Completion', () => {
    it('should complete branch names for /checkout', async () => {
      const branches = ['main', 'develop', 'feature/new-ui', 'hotfix/bug-123'];
      const completions = await getCompletions('/checkout ', branches);

      expect(completions).toContain('/checkout main');
      expect(completions).toContain('/checkout develop');
      expect(completions).toContain('/checkout feature/new-ui');
      expect(completions).toContain('/checkout hotfix/bug-123');
    });

    it('should filter branches by prefix', async () => {
      const branches = ['main', 'develop', 'feature/new-ui', 'hotfix/bug-123'];
      const completions = await getCompletions('/checkout fe', branches);

      expect(completions).toContain('/checkout feature/new-ui');
      expect(completions).not.toContain('/checkout main');
      expect(completions).not.toContain('/checkout develop');
    });

    it('should be case-insensitive for branch filtering', async () => {
      const branches = ['Main', 'Develop', 'Feature/new-ui'];
      const completions = await getCompletions('/checkout mai', branches);

      expect(completions).toContain('/checkout Main');
    });
  });

  describe('Path Completion', () => {
    it('should complete file paths for /save command', async () => {
      const originalCwd = process.cwd();
      process.chdir(testDir);

      try {
        const completions = await getCompletions('/save ');

        expect(completions.some((c) => c.includes('test.txt'))).toBe(true);
        expect(completions.some((c) => c.includes('test2.txt'))).toBe(true);
        expect(completions.some((c) => c.includes('src/'))).toBe(true);
        expect(completions.some((c) => c.includes('docs/'))).toBe(true);
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should complete directory contents', async () => {
      const originalCwd = process.cwd();
      process.chdir(testDir);

      try {
        const completions = await getCompletions('/save src/');

        expect(completions.some((c) => c.includes('src/index.ts'))).toBe(true);
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should filter files by prefix', async () => {
      const originalCwd = process.cwd();
      process.chdir(testDir);

      try {
        const completions = await getCompletions('/save test');

        expect(completions.some((c) => c.includes('test.txt'))).toBe(true);
        expect(completions.some((c) => c.includes('test2.txt'))).toBe(true);
        expect(completions.some((c) => c.includes('README.md'))).toBe(false);
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should work with /load command', async () => {
      const originalCwd = process.cwd();
      process.chdir(testDir);

      try {
        const completions = await getCompletions('/load ');

        expect(completions.some((c) => c.includes('test.txt'))).toBe(true);
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  describe('Inline Suggestions', () => {
    it('should suggest command completion', () => {
      const suggestion = getInlineSuggestion('/he');
      expect(suggestion).toBe('lp');
    });

    it('should suggest full command from partial', () => {
      const suggestion = getInlineSuggestion('/his');
      expect(suggestion).toBe('tory');
    });

    it('should return empty string when no match', () => {
      const suggestion = getInlineSuggestion('/xyz');
      expect(suggestion).toBe('');
    });

    it('should return empty string when command is complete', () => {
      const suggestion = getInlineSuggestion('/help');
      expect(suggestion).toBe('');
    });

    it('should return empty string when in middle of command arguments', () => {
      const suggestion = getInlineSuggestion('/checkout main');
      expect(suggestion).toBe('');
    });

    it('should not suggest for regular text', () => {
      const suggestion = getInlineSuggestion('hello world');
      expect(suggestion).toBe('');
    });
  });

  describe('Command Suggestions', () => {
    it('should return top suggestions for partial command', () => {
      const suggestions = getCommandSuggestions('/h');
      expect(suggestions).toContain('/help');
      expect(suggestions).toContain('/history');
    });

    it('should limit suggestions to 5', () => {
      const suggestions = getCommandSuggestions('/');
      expect(suggestions.length).toBeLessThanOrEqual(5);
    });

    it('should return empty for non-command input', () => {
      const suggestions = getCommandSuggestions('hello');
      expect(suggestions).toEqual([]);
    });

    it('should return empty for just /', () => {
      const suggestions = getCommandSuggestions('/');
      expect(suggestions).toEqual([]);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty input gracefully', async () => {
      const completions = await getCompletions('');
      expect(Array.isArray(completions)).toBe(true);
    });

    it('should handle non-existent paths gracefully', async () => {
      const completions = await getCompletions('/save /non/existent/path/');
      expect(completions).toEqual([]);
    });

    it('should limit path completions to 50 items', async () => {
      // This is more of a documentation test
      const originalCwd = process.cwd();
      process.chdir(testDir);

      try {
        const completions = await getCompletions('/save ');
        expect(completions.length).toBeLessThanOrEqual(50);
      } finally {
        process.chdir(originalCwd);
      }
    });
  });
});
