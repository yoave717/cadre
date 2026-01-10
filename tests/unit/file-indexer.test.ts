import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { indexFile, indexDirectory, hasFileChanged } from '../../src/index-system/file-indexer';

vi.mock('fs/promises');

describe('File Indexer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
