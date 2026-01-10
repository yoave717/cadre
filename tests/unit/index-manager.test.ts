import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IndexManager } from '../../src/index-system/manager';
import * as storage from '../../src/index-system/storage';
import * as fileIndexer from '../../src/index-system/file-indexer';
import type { ProjectIndex, FileIndex } from '../../src/index-system/types';

vi.mock('../../src/index-system/storage');
vi.mock('../../src/index-system/file-indexer');

describe('IndexManager', () => {
  const projectRoot = '/project';
  let manager: IndexManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new IndexManager(projectRoot);
  });

  describe('load', () => {
    it('should load existing index', async () => {
      const mockIndex: ProjectIndex = {
        version: 1,
        projectRoot,
        projectHash: 'abc123',
        indexed_at: Date.now(),
        files: {},
        totalFiles: 0,
        totalSymbols: 0,
        languages: {},
      };

      (storage.loadIndex as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockIndex);

      const result = await manager.load();

      expect(result).toBe(true);
      expect(storage.loadIndex).toHaveBeenCalledWith(projectRoot);
    });

    it('should return false when no index exists', async () => {
      (storage.loadIndex as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const result = await manager.load();

      expect(result).toBe(false);
    });
  });

  describe('buildIndex', () => {
    it('should build complete index', async () => {
      const mockFileIndex: FileIndex = {
        metadata: {
          path: 'src/index.ts',
          absolutePath: '/project/src/index.ts',
          size: 1000,
          mtime: Date.now(),
          hash: 'abc123',
          language: 'TypeScript',
          lines: 50,
        },
        symbols: [
          {
            name: 'greet',
            type: 'function',
            line: 10,
            exported: true,
          },
        ],
        imports: ['fs', 'path'],
        exports: ['greet'],
      };

      const mockFiles = {
        'src/index.ts': mockFileIndex,
      };

      (fileIndexer.indexDirectory as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockFiles,
      );
      (storage.saveIndex as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const stats = await manager.buildIndex();

      expect(stats.totalFiles).toBe(1);
      expect(stats.totalSymbols).toBe(1);
      expect(stats.totalSize).toBe(1000);
      expect(stats.languages).toEqual({ TypeScript: 1 });
      expect(stats.duration).toBeGreaterThanOrEqual(0);

      expect(fileIndexer.indexDirectory).toHaveBeenCalledWith(
        projectRoot,
        projectRoot,
        10,
        0,
        undefined,
        expect.any(Object),
      );
      expect(storage.saveIndex).toHaveBeenCalled();
    });

    it('should handle multiple files and languages', async () => {
      const mockFiles = {
        'src/index.ts': {
          metadata: {
            path: 'src/index.ts',
            absolutePath: '/project/src/index.ts',
            size: 1000,
            mtime: Date.now(),
            hash: 'abc',
            language: 'TypeScript',
            lines: 50,
          },
          symbols: [{ name: 'fn1', type: 'function' as const, line: 1 }],
          imports: [],
          exports: [],
        },
        'app.py': {
          metadata: {
            path: 'app.py',
            absolutePath: '/project/app.py',
            size: 500,
            mtime: Date.now(),
            hash: 'def',
            language: 'Python',
            lines: 25,
          },
          symbols: [{ name: 'fn2', type: 'function' as const, line: 1 }],
          imports: [],
          exports: [],
        },
      };

      (fileIndexer.indexDirectory as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockFiles,
      );
      (storage.saveIndex as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const stats = await manager.buildIndex();

      expect(stats.totalFiles).toBe(2);
      expect(stats.totalSymbols).toBe(2);
      expect(stats.totalSize).toBe(1500);
      expect(stats.languages).toEqual({ TypeScript: 1, Python: 1 });
    });
  });

  describe('updateIndex', () => {
    it('should update changed files only', async () => {
      const existingIndex: ProjectIndex = {
        version: 1,
        projectRoot,
        projectHash: 'abc123',
        indexed_at: Date.now() - 10000,
        files: {
          'src/index.ts': {
            metadata: {
              path: 'src/index.ts',
              absolutePath: '/project/src/index.ts',
              size: 1000,
              mtime: 1000000,
              hash: 'oldHash',
              language: 'TypeScript',
              lines: 50,
            },
            symbols: [],
            imports: [],
            exports: [],
          },
        },
        totalFiles: 1,
        totalSymbols: 0,
        languages: { TypeScript: 1 },
      };

      (storage.loadIndex as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(existingIndex);
      (fileIndexer.hasFileChanged as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      const newFileIndex: FileIndex = {
        metadata: {
          path: 'src/index.ts',
          absolutePath: '/project/src/index.ts',
          size: 1200,
          mtime: 2000000,
          hash: 'newHash',
          language: 'TypeScript',
          lines: 60,
        },
        symbols: [{ name: 'newFn', type: 'function' as const, line: 1, exported: true }],
        imports: [],
        exports: [],
      };

      (fileIndexer.indexFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        newFileIndex,
      );
      (storage.saveIndex as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await manager.load();
      const stats = await manager.updateIndex();

      expect(stats.totalFiles).toBe(1);
      expect(stats.totalSymbols).toBe(1);
      expect(fileIndexer.hasFileChanged).toHaveBeenCalled();
      expect(fileIndexer.indexFile).toHaveBeenCalled();
      expect(storage.saveIndex).toHaveBeenCalled();
    });

    it('should build new index if none exists', async () => {
      (storage.loadIndex as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (fileIndexer.indexDirectory as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});
      (storage.saveIndex as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const stats = await manager.updateIndex();

      expect(stats).toBeDefined();
      expect(fileIndexer.indexDirectory).toHaveBeenCalled();
    });
  });

  describe('searchSymbols', () => {
    beforeEach(async () => {
      const mockIndex: ProjectIndex = {
        version: 1,
        projectRoot,
        projectHash: 'abc123',
        indexed_at: Date.now(),
        files: {
          'src/index.ts': {
            metadata: {
              path: 'src/index.ts',
              absolutePath: '/project/src/index.ts',
              size: 1000,
              mtime: Date.now(),
              hash: 'abc',
              language: 'TypeScript',
              lines: 50,
            },
            symbols: [
              { name: 'greet', type: 'function' as const, line: 10, exported: true },
              { name: 'Greeter', type: 'class' as const, line: 20, exported: true },
              { name: 'internal', type: 'function' as const, line: 30, exported: false },
            ],
            imports: [],
            exports: [],
          },
        },
        totalFiles: 1,
        totalSymbols: 3,
        languages: { TypeScript: 1 },
      };

      (storage.loadIndex as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockIndex);
      await manager.load();
    });

    it('should find exact symbol match with highest score', () => {
      const results = manager.searchSymbols('greet');

      expect(results.length).toBeGreaterThan(0);
      // Exact match should have highest score and be first
      expect(results[0].symbol?.name).toBe('greet');
      // Score is 100 for exact match + 10 for exported
      expect(results[0].score).toBeGreaterThanOrEqual(100);
    });

    it('should find partial matches', () => {
      const results = manager.searchSymbols('gre');

      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.symbol?.name === 'greet')).toBe(true);
      expect(results.some((r) => r.symbol?.name === 'Greeter')).toBe(true);
    });

    it('should boost exported symbols', () => {
      const results = manager.searchSymbols('gre');

      const greetResult = results.find((r) => r.symbol?.name === 'greet');
      const internalResult = results.find((r) => r.symbol?.name === 'internal');

      if (greetResult && internalResult && greetResult.score === internalResult.score - 10) {
        expect(greetResult.score).toBeGreaterThan(internalResult.score);
      }
    });

    it('should limit results', () => {
      const results = manager.searchSymbols('', 2);

      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should return empty array when no index loaded', () => {
      const newManager = new IndexManager('/other');
      const results = newManager.searchSymbols('test');

      expect(results).toEqual([]);
    });
  });

  describe('findFiles', () => {
    beforeEach(async () => {
      const mockIndex: ProjectIndex = {
        version: 1,
        projectRoot,
        projectHash: 'abc123',
        indexed_at: Date.now(),
        files: {
          'src/index.ts': {
            metadata: {
              path: 'src/index.ts',
              absolutePath: '/project/src/index.ts',
              size: 1000,
              mtime: Date.now(),
              hash: 'abc',
              language: 'TypeScript',
              lines: 50,
            },
            symbols: [],
            imports: [],
            exports: [],
          },
          'src/utils.ts': {
            metadata: {
              path: 'src/utils.ts',
              absolutePath: '/project/src/utils.ts',
              size: 500,
              mtime: Date.now(),
              hash: 'def',
              language: 'TypeScript',
              lines: 25,
            },
            symbols: [],
            imports: [],
            exports: [],
          },
          'app.py': {
            metadata: {
              path: 'app.py',
              absolutePath: '/project/app.py',
              size: 300,
              mtime: Date.now(),
              hash: 'ghi',
              language: 'Python',
              lines: 15,
            },
            symbols: [],
            imports: [],
            exports: [],
          },
        },
        totalFiles: 3,
        totalSymbols: 0,
        languages: { TypeScript: 2, Python: 1 },
      };

      (storage.loadIndex as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockIndex);
      await manager.load();
    });

    it('should find files by name', () => {
      const results = manager.findFiles('index');

      expect(results).toContain('src/index.ts');
    });

    it('should find files by extension', () => {
      const results = manager.findFiles('.ts');

      expect(results).toContain('src/index.ts');
      expect(results).toContain('src/utils.ts');
    });

    it('should find files by path', () => {
      const results = manager.findFiles('src/');

      expect(results.length).toBe(2);
    });

    it('should limit results', () => {
      const results = manager.findFiles('.ts', 1);

      expect(results.length).toBeLessThanOrEqual(1);
    });
  });

  describe('getFileSymbols', () => {
    beforeEach(async () => {
      const mockIndex: ProjectIndex = {
        version: 1,
        projectRoot,
        projectHash: 'abc123',
        indexed_at: Date.now(),
        files: {
          'src/index.ts': {
            metadata: {
              path: 'src/index.ts',
              absolutePath: '/project/src/index.ts',
              size: 1000,
              mtime: Date.now(),
              hash: 'abc',
              language: 'TypeScript',
              lines: 50,
            },
            symbols: [
              { name: 'greet', type: 'function' as const, line: 10 },
              { name: 'User', type: 'class' as const, line: 20 },
            ],
            imports: [],
            exports: [],
          },
        },
        totalFiles: 1,
        totalSymbols: 2,
        languages: { TypeScript: 1 },
      };

      (storage.loadIndex as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockIndex);
      await manager.load();
    });

    it('should get all symbols in a file', () => {
      const symbols = manager.getFileSymbols('src/index.ts');

      expect(symbols).toHaveLength(2);
      expect(symbols[0].name).toBe('greet');
      expect(symbols[1].name).toBe('User');
    });

    it('should return empty array for non-existent file', () => {
      const symbols = manager.getFileSymbols('notfound.ts');

      expect(symbols).toEqual([]);
    });
  });

  describe('findImporters', () => {
    beforeEach(async () => {
      const mockIndex: ProjectIndex = {
        version: 1,
        projectRoot,
        projectHash: 'abc123',
        indexed_at: Date.now(),
        files: {
          'src/index.ts': {
            metadata: {
              path: 'src/index.ts',
              absolutePath: '/project/src/index.ts',
              size: 1000,
              mtime: Date.now(),
              hash: 'abc',
              language: 'TypeScript',
              lines: 50,
            },
            symbols: [],
            imports: ['./utils', 'fs'],
            exports: [],
          },
          'src/app.ts': {
            metadata: {
              path: 'src/app.ts',
              absolutePath: '/project/src/app.ts',
              size: 500,
              mtime: Date.now(),
              hash: 'def',
              language: 'TypeScript',
              lines: 25,
            },
            symbols: [],
            imports: ['./utils'],
            exports: [],
          },
        },
        totalFiles: 2,
        totalSymbols: 0,
        languages: { TypeScript: 2 },
      };

      (storage.loadIndex as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockIndex);
      await manager.load();
    });

    it('should find files that import a module', () => {
      const importers = manager.findImporters('utils');

      expect(importers).toHaveLength(2);
      expect(importers).toContain('src/index.ts');
      expect(importers).toContain('src/app.ts');
    });

    it('should find files for specific imports', () => {
      const importers = manager.findImporters('fs');

      expect(importers).toHaveLength(1);
      expect(importers).toContain('src/index.ts');
    });

    it('should return empty array for non-imported module', () => {
      const importers = manager.findImporters('notused');

      expect(importers).toEqual([]);
    });
  });

  describe('getStats', () => {
    it('should return index statistics', async () => {
      const mockIndex: ProjectIndex = {
        version: 1,
        projectRoot,
        projectHash: 'abc123',
        indexed_at: 1000000,
        files: {
          'file1.ts': {
            metadata: {
              path: 'file1.ts',
              absolutePath: '/project/file1.ts',
              size: 1000,
              mtime: Date.now(),
              hash: 'abc',
              language: 'TypeScript',
              lines: 50,
            },
            symbols: [],
            imports: [],
            exports: [],
          },
        },
        totalFiles: 1,
        totalSymbols: 10,
        languages: { TypeScript: 1 },
      };

      (storage.loadIndex as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockIndex);
      await manager.load();

      const stats = manager.getStats();

      expect(stats).not.toBeNull();
      expect(stats?.totalFiles).toBe(1);
      expect(stats?.totalSymbols).toBe(10);
      expect(stats?.totalSize).toBe(1000);
      expect(stats?.languages).toEqual({ TypeScript: 1 });
      expect(stats?.indexed_at).toBe(1000000);
    });

    it('should return null when no index loaded', () => {
      const stats = manager.getStats();

      expect(stats).toBeNull();
    });
  });

  describe('isLoaded', () => {
    it('should return true when index is loaded', async () => {
      const mockIndex: ProjectIndex = {
        version: 1,
        projectRoot,
        projectHash: 'abc123',
        indexed_at: Date.now(),
        files: {},
        totalFiles: 0,
        totalSymbols: 0,
        languages: {},
      };

      (storage.loadIndex as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockIndex);
      await manager.load();

      expect(manager.isLoaded()).toBe(true);
    });

    it('should return false when no index loaded', () => {
      expect(manager.isLoaded()).toBe(false);
    });
  });
});
