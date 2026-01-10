import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import {
  indexFile,
  indexDirectory,
  hasFileChanged,
  DEFAULT_INDEXING_LIMITS,
} from '../../src/index-system/file-indexer';
import type { IndexingWarning } from '../../src/index-system/types';

vi.mock('fs/promises');

describe('File Indexer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock for realpath to simply return the input path
    (fs.realpath as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (p) => p);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('indexFile', () => {
    it('should index a TypeScript file', async () => {
      const projectRoot = '/project';
      const filePath = '/project/src/index.ts';
      const content = `
export function hello() {
  return "Hello, World!";
}

export class Greeter {
  greet() {
    return "Hi!";
  }
}
      `;

      (fs.stat as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        isFile: () => true,
        size: content.length,
        mtimeMs: Date.now(),
      });

      (fs.readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(content);

      const result = await indexFile(filePath, projectRoot);

      expect(result).not.toBeNull();
      expect(result?.metadata.path).toBe('src/index.ts');
      expect(result?.metadata.language).toBe('TypeScript');
      expect(result?.metadata.size).toBe(content.length);
      expect(result?.symbols.length).toBeGreaterThan(0);

      const functionSymbol = result?.symbols.find((s) => s.name === 'hello');
      expect(functionSymbol).toBeDefined();
      expect(functionSymbol?.type).toBe('function');
      expect(functionSymbol?.exported).toBe(true);

      const classSymbol = result?.symbols.find((s) => s.name === 'Greeter');
      expect(classSymbol).toBeDefined();
      expect(classSymbol?.type).toBe('class');
    });

    it('should index a Python file', async () => {
      const projectRoot = '/project';
      const filePath = '/project/app.py';
      const content = `
def greet(name):
    return f"Hello, {name}"

class User:
    def __init__(self, name):
        self.name = name
      `;

      (fs.stat as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        isFile: () => true,
        size: content.length,
        mtimeMs: Date.now(),
      });

      (fs.readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(content);

      const result = await indexFile(filePath, projectRoot);

      expect(result).not.toBeNull();
      expect(result?.metadata.language).toBe('Python');
      expect(result?.symbols.length).toBeGreaterThan(0);
    });

    it('should skip binary files', async () => {
      const projectRoot = '/project';
      const filePath = '/project/image.png';

      const result = await indexFile(filePath, projectRoot);

      expect(result).toBeNull();
    });

    it('should skip files in ignored directories', async () => {
      const projectRoot = '/project';
      const filePath = '/project/node_modules/package/index.js';

      const result = await indexFile(filePath, projectRoot);

      expect(result).toBeNull();
    });

    it('should skip very large files', async () => {
      const projectRoot = '/project';
      const filePath = '/project/large.ts';

      (fs.stat as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        isFile: () => true,
        size: 2 * 1024 * 1024, // 2MB
        mtimeMs: Date.now(),
      });

      const result = await indexFile(filePath, projectRoot);

      expect(result).toBeNull();
    });

    it('should handle file read errors gracefully', async () => {
      const projectRoot = '/project';
      const filePath = '/project/error.ts';

      (fs.stat as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Access denied'),
      );

      const result = await indexFile(filePath, projectRoot);

      expect(result).toBeNull();
    });
  });

  describe('indexDirectory', () => {
    it('should index all files in a directory', async () => {
      const projectRoot = '/project';
      const dirPath = '/project/src';

      interface MockDirent {
        name: string;
        isDirectory: () => boolean;
        isFile: () => boolean;
      }

      const mockFiles: MockDirent[] = [
        { name: 'index.ts', isDirectory: () => false, isFile: () => true },
        { name: 'utils.ts', isDirectory: () => false, isFile: () => true },
      ];

      (fs.readdir as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockFiles);

      (fs.stat as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        isFile: () => true,
        size: 100,
        mtimeMs: Date.now(),
      });

      (fs.readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        'export function test() {}',
      );

      const result = await indexDirectory(dirPath, projectRoot);

      expect(Object.keys(result).length).toBeGreaterThan(0);
      expect(result['src/index.ts']).toBeDefined();
      expect(result['src/utils.ts']).toBeDefined();
    });

    it('should recursively index subdirectories', async () => {
      const projectRoot = '/project';
      const dirPath = '/project';

      interface MockDirent {
        name: string;
        isDirectory: () => boolean;
        isFile: () => boolean;
      }

      const rootFiles: MockDirent[] = [
        { name: 'index.ts', isDirectory: () => false, isFile: () => true },
        { name: 'src', isDirectory: () => true, isFile: () => false },
      ];

      const srcFiles: MockDirent[] = [
        { name: 'utils.ts', isDirectory: () => false, isFile: () => true },
      ];

      (fs.readdir as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        async (path: string) => {
          if (path === '/project') return rootFiles;
          if (path === '/project/src') return srcFiles;
          return [];
        },
      );

      (fs.stat as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        isFile: () => true,
        size: 100,
        mtimeMs: Date.now(),
      });

      (fs.readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        'export function test() {}',
      );

      const result = await indexDirectory(dirPath, projectRoot);

      expect(Object.keys(result).length).toBeGreaterThan(0);
      expect(result['index.ts']).toBeDefined();
      expect(result['src/utils.ts']).toBeDefined();
    });

    it('should skip ignored directories', async () => {
      const projectRoot = '/project';
      const dirPath = '/project';

      interface MockDirent {
        name: string;
        isDirectory: () => boolean;
        isFile: () => boolean;
      }

      const mockFiles: MockDirent[] = [
        { name: 'index.ts', isDirectory: () => false, isFile: () => true },
        { name: 'node_modules', isDirectory: () => true, isFile: () => false },
        { name: '.git', isDirectory: () => true, isFile: () => false },
      ];

      (fs.readdir as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockFiles);

      (fs.stat as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        isFile: () => true,
        size: 100,
        mtimeMs: Date.now(),
      });

      (fs.readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        'export function test() {}',
      );

      const result = await indexDirectory(dirPath, projectRoot);

      expect(Object.keys(result).length).toBe(1);
      expect(result['index.ts']).toBeDefined();
    });

    it('should respect max depth', async () => {
      const projectRoot = '/project';
      const dirPath = '/project';

      interface MockDirent {
        name: string;
        isDirectory: () => boolean;
        isFile: () => boolean;
      }

      const mockFiles: MockDirent[] = [
        { name: 'deep', isDirectory: () => true, isFile: () => false },
      ];

      (fs.readdir as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockFiles);

      const result = await indexDirectory(dirPath, projectRoot, 0);
      expect(Object.keys(result).length).toBe(0);
    });

    it('should handle symlink loops gracefully', async () => {
      const projectRoot = '/project';
      const dirPath = '/project';

      // Setup a structure where /project/loop points back to /project
      interface MockDirent {
        name: string;
        isDirectory: () => boolean;
        isFile: () => boolean;
        isSymbolicLink: () => boolean;
      }

      // Root contains 'loop' (dir/link) and 'file.ts'
      (fs.readdir as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        async (path: string) => {
          if (path === '/project') {
            return [
              {
                name: 'loop',
                isDirectory: () => true,
                isFile: () => false,
                isSymbolicLink: () => true,
              },
              {
                name: 'file.ts',
                isDirectory: () => false,
                isFile: () => true,
                isSymbolicLink: () => false,
              },
            ];
          }
          // Attempting to read inside the loop should return the same content as root
          // Because loop -> /project
          if (path === '/project/loop') {
            return [
              {
                name: 'loop',
                isDirectory: () => true,
                isFile: () => false,
                isSymbolicLink: () => true,
              },
              {
                name: 'file.ts',
                isDirectory: () => false,
                isFile: () => true,
                isSymbolicLink: () => false,
              },
            ];
          }
          return [];
        },
      );

      // Mock realpath to simulate loop resolution
      // /project/loop -> /project
      (fs.realpath as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (p: string) => {
        if (p === '/project/loop') return '/project';
        return p;
      });

      (fs.stat as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        isFile: () => true,
        size: 100,
        mtimeMs: Date.now(),
      });

      (fs.readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('export const x = 1;');

      const result = await indexDirectory(dirPath, projectRoot);

      // Should contain file.ts
      expect(result['file.ts']).toBeDefined();

      // Should NOT contain loop/file.ts (deduplicated by realpath check)
      // or at least shouldn't crash with stack overflow
      expect(Object.keys(result).length).toBe(1);
    });
  });

  describe('hasFileChanged', () => {
    it('should detect changed file based on mtime', async () => {
      const filePath = '/project/file.ts';
      const oldMtime = 1000000;
      const newMtime = 2000000;
      const hash = 'abc123';

      (fs.stat as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        mtimeMs: newMtime,
      });

      (fs.readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('new content');

      const changed = await hasFileChanged(filePath, oldMtime, hash);

      expect(changed).toBe(true);
    });

    it('should return false for unchanged file', async () => {
      const filePath = '/project/file.ts';
      const mtime = 1000000;
      const hash = 'abc123';

      (fs.stat as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        mtimeMs: mtime,
      });

      const changed = await hasFileChanged(filePath, mtime, hash);

      expect(changed).toBe(false);
    });

    it('should return true if file does not exist', async () => {
      const filePath = '/project/deleted.ts';
      const mtime = 1000000;
      const hash = 'abc123';

      (fs.stat as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('File not found'),
      );

      const changed = await hasFileChanged(filePath, mtime, hash);

      expect(changed).toBe(true);
    });
  });

  describe('Defensive Indexing', () => {
    it('should skip files exceeding line count limit', async () => {
      const projectRoot = '/project';
      const filePath = '/project/many-lines.ts';
      const warnings: IndexingWarning[] = [];

      // Create content with 15,000 lines (exceeds default 10k limit)
      const content = 'line\n'.repeat(15000);

      (fs.stat as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        isFile: () => true,
        size: content.length,
        mtimeMs: Date.now(),
      });

      (fs.readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(content);

      const result = await indexFile(filePath, projectRoot, DEFAULT_INDEXING_LIMITS, warnings);

      expect(result).toBeNull();
      expect(warnings).toHaveLength(1);
      expect(warnings[0].reason).toBe('lines');
      expect(warnings[0].file).toBe('many-lines.ts');
    });

    it('should skip files with extremely long lines', async () => {
      const projectRoot = '/project';
      const filePath = '/project/long-line.ts';
      const warnings: IndexingWarning[] = [];

      // Create content with one line exceeding 10k chars
      const content = 'a'.repeat(15000);

      (fs.stat as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        isFile: () => true,
        size: content.length,
        mtimeMs: Date.now(),
      });

      (fs.readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(content);

      const result = await indexFile(filePath, projectRoot, DEFAULT_INDEXING_LIMITS, warnings);

      expect(result).toBeNull();
      expect(warnings).toHaveLength(1);
      expect(warnings[0].reason).toBe('line-length');
      expect(warnings[0].file).toBe('long-line.ts');
    });

    it('should timeout on slow file operations', async () => {
      const projectRoot = '/project';
      const filePath = '/project/slow.ts';
      const warnings: IndexingWarning[] = [];

      const content = 'export function test() {}';

      (fs.stat as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        isFile: () => true,
        size: content.length,
        mtimeMs: Date.now(),
      });

      // Mock a slow read operation
      (fs.readFile as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(content), 10000); // 10 seconds
          }),
      );

      const result = await indexFile(
        filePath,
        projectRoot,
        { ...DEFAULT_INDEXING_LIMITS, fileTimeout: 100 }, // 100ms timeout
        warnings,
      );

      expect(result).toBeNull();
      expect(warnings).toHaveLength(1);
      expect(warnings[0].reason).toBe('timeout');
      expect(warnings[0].file).toBe('slow.ts');
    });

    it('should track multiple warnings during directory indexing', async () => {
      const projectRoot = '/project';
      const dirPath = '/project';
      const warnings: IndexingWarning[] = [];

      interface MockDirent {
        name: string;
        isDirectory: () => boolean;
        isFile: () => boolean;
      }

      const mockFiles: MockDirent[] = [
        { name: 'normal.ts', isDirectory: () => false, isFile: () => true },
        { name: 'large.ts', isDirectory: () => false, isFile: () => true },
        { name: 'many-lines.ts', isDirectory: () => false, isFile: () => true },
      ];

      (fs.readdir as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockFiles);

      (fs.stat as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (path: string) => {
        if (path === '/project/large.ts') {
          return {
            isFile: () => true,
            size: 2 * 1024 * 1024, // 2MB - exceeds limit
            mtimeMs: Date.now(),
          };
        }
        return {
          isFile: () => true,
          size: 100,
          mtimeMs: Date.now(),
        };
      });

      (fs.readFile as unknown as ReturnType<typeof vi.fn>).mockImplementation(
        async (path: string) => {
          if (path === '/project/many-lines.ts') {
            return 'line\n'.repeat(15000); // Exceeds line count
          }
          return 'export function test() {}';
        },
      );

      const result = await indexDirectory(
        dirPath,
        projectRoot,
        10,
        0,
        undefined,
        undefined,
        undefined,
        undefined,
        DEFAULT_INDEXING_LIMITS,
        warnings,
      );

      // Should index normal.ts but skip large.ts and many-lines.ts
      expect(Object.keys(result)).toContain('normal.ts');
      expect(warnings.length).toBeGreaterThanOrEqual(2);
    });

    it('should use custom limits when provided', async () => {
      const projectRoot = '/project';
      const filePath = '/project/custom.ts';
      const warnings: IndexingWarning[] = [];

      // 6000 lines - exceeds custom limit but not default
      const content = 'line\n'.repeat(6000);

      (fs.stat as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        isFile: () => true,
        size: content.length,
        mtimeMs: Date.now(),
      });

      (fs.readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(content);

      const customLimits = {
        ...DEFAULT_INDEXING_LIMITS,
        maxLineCount: 5000, // Custom lower limit
      };

      const result = await indexFile(filePath, projectRoot, customLimits, warnings);

      expect(result).toBeNull();
      expect(warnings).toHaveLength(1);
      expect(warnings[0].reason).toBe('lines');
    });

    it('should successfully index files within all limits', async () => {
      const projectRoot = '/project';
      const filePath = '/project/normal.ts';
      const warnings: IndexingWarning[] = [];

      const content = `
export function hello() {
  return "Hello, World!";
}
      `;

      (fs.stat as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        isFile: () => true,
        size: content.length,
        mtimeMs: Date.now(),
      });

      (fs.readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(content);

      const result = await indexFile(filePath, projectRoot, DEFAULT_INDEXING_LIMITS, warnings);

      expect(result).not.toBeNull();
      expect(warnings).toHaveLength(0);
      expect(result?.metadata.path).toBe('normal.ts');
    });
  });
});
