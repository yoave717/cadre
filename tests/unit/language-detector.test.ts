import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs/promises';
import { LanguageDetector } from '../../src/tools/language-detector.js';

vi.mock('fs/promises');

describe('LanguageDetector', () => {
  let detector: LanguageDetector;
  const mockCwd = '/test/project';

  beforeEach(() => {
    detector = new LanguageDetector();
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should identify a single language project', async () => {
    // Mock readdir
    vi.mocked(fs.readdir).mockImplementation(async (dir) => {
      if (dir === mockCwd) {
        return [
          { name: 'index.ts', isDirectory: () => false, isFile: () => true },
          { name: 'utils.ts', isDirectory: () => false, isFile: () => true },
        ] as any;
      }
      return [];
    });

    // Mock readFile (gitignore empty)
    vi.mocked(fs.readFile).mockRejectedValue(new Error('No file'));

    const result = await detector.scan(mockCwd);

    expect(result.primary).toBe('TypeScript');
    expect(result.languages['TypeScript']).toBe(2);
    expect(result.percentages['TypeScript']).toBe(100);
  });

  it('should identify a multi-language project', async () => {
    vi.mocked(fs.readdir).mockImplementation(async (dir) => {
      if (dir === mockCwd) {
        return [
          { name: 'main.py', isDirectory: () => false, isFile: () => true },
          { name: 'script.js', isDirectory: () => false, isFile: () => true },
          { name: 'utils.js', isDirectory: () => false, isFile: () => true },
          { name: 'styles.css', isDirectory: () => false, isFile: () => true },
        ] as any;
      }
      return [];
    });

    vi.mocked(fs.readFile).mockRejectedValue(new Error('No file'));

    const result = await detector.scan(mockCwd);

    // Total 4 files: 1 py, 2 js, 1 css
    expect(result.totalFiles).toBe(4);
    expect(result.languages['JavaScript']).toBe(2);
    expect(result.languages['Python']).toBe(1);
    expect(result.languages['CSS']).toBe(1);

    expect(result.primary).toBe('JavaScript');
    expect(result.percentages['JavaScript']).toBe(50);
    expect(result.percentages['Python']).toBe(25);
    expect(result.percentages['CSS']).toBe(25);
  });

  it('should respect .gitignore', async () => {
    vi.mocked(fs.readdir).mockImplementation(async (dir) => {
      if (dir === mockCwd) {
        return [
          { name: 'src', isDirectory: () => true, isFile: () => false },
          { name: 'build', isDirectory: () => true, isFile: () => false },
        ] as any;
      }
      if (dir === path.join(mockCwd, 'src')) {
        return [{ name: 'index.ts', isDirectory: () => false, isFile: () => true }] as any;
      }
      if (dir === path.join(mockCwd, 'build')) {
        return [{ name: 'output.js', isDirectory: () => false, isFile: () => true }] as any;
      }
      return [];
    });

    // Mock .gitignore
    vi.mocked(fs.readFile).mockImplementation(async (p) => {
      if (typeof p === 'string' && p.endsWith('.gitignore')) {
        return 'build/';
      }
      throw new Error('No file');
    });

    const result = await detector.scan(mockCwd);

    expect(result.languages['TypeScript']).toBe(1);
    expect(result.languages['JavaScript']).toBeUndefined(); // Should be ignored
  });

  it('should cache results', async () => {
    const mockResult = {
      primary: 'Go',
      languages: { Go: 10 },
      percentages: { Go: 100 },
      totalFiles: 10,
      timestamp: Date.now(),
    };

    vi.mocked(fs.readFile).mockImplementation(async (p) => {
      if (typeof p === 'string' && p.endsWith('.cadre/cache.json')) {
        return JSON.stringify(mockResult);
      }
      throw new Error('No file');
    });

    // It should NOT call scan (which uses readdir)
    const scanSpy = vi.spyOn(detector, 'scan');

    const result = await detector.detect(mockCwd);

    expect(result.primary).toBe('Go');
    expect(scanSpy).not.toHaveBeenCalled();
  });
});
