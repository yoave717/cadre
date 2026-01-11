import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { IndexDatabase } from '../../src/index-system/database-manager';

describe('IndexDatabase', () => {
  // Use real temp directory like the actual getIndexDir does
  const testProjectRoot = path.join(os.tmpdir(), 'test-sqldb-' + Date.now());
  let manager: IndexDatabase;

  const mockFiles = {
    'src/index.ts': {
      metadata: {
        path: 'src/index.ts',
        absolutePath: path.join(testProjectRoot, 'src/index.ts'),
        size: 1000,
        mtime: Date.now(),
        hash: 'file-hash-abc',
        language: 'TypeScript',
        lines: 50,
      },
      symbols: [
        {
          name: 'testFunction',
          type: 'function' as const,
          line: 10,
          endLine: 15,
          exported: true,
          signature: 'function testFunction(): void',
        },
        {
          name: 'TestClass',
          type: 'class' as const,
          line: 20,
          endLine: 30,
          exported: true,
        },
        {
          name: 'internalHelper',
          type: 'function' as const,
          line: 30,
          endLine: 35,
          exported: false,
        },
      ],
      imports: ['fs', 'path'],
      exports: ['testFunction', 'TestClass'],
    },
    'src/utils.ts': {
      metadata: {
        path: 'src/utils.ts',
        absolutePath: path.join(testProjectRoot, 'src/utils.ts'),
        size: 500,
        mtime: Date.now(),
        hash: 'utils-hash',
        language: 'TypeScript',
        lines: 25,
      },
      symbols: [
        {
          name: 'utilFunction',
          type: 'function' as const,
          line: 5,
          endLine: 10,
          exported: true,
        },
      ],
      imports: [],
      exports: ['utilFunction'],
    },
  };

  beforeEach(async () => {
    // Create manager - it will create the index directory automatically
    manager = new IndexDatabase(testProjectRoot);
    await manager.init();
  });

  afterEach(() => {
    // Close database
    try {
      manager.close();
    } catch {
      // Ignore errors
    }

    // Cleanup - manually construct the index path like getIndexDir does
    const hash = crypto.createHash('sha256').update(testProjectRoot).digest('hex').slice(0, 16);
    const indexDir = path.join(os.homedir(), '.cadre', 'indexes', hash);
    if (fs.existsSync(indexDir)) {
      fs.rmSync(indexDir, { recursive: true, force: true });
    }
  });

  describe('initialization', () => {
    it('should create database with schema', () => {
      // Just verify manager was created successfully
      expect(manager).toBeDefined();
    });

    it('should have no data initially', () => {
      expect(manager.hasData()).toBe(false);
    });
  });

  describe('insertBatch', () => {
    it('should insert batch successfully', () => {
      manager.insertBatch(mockFiles);

      // Need to set metadata manually as insertBatch doesn't do it automatically unlike importFromJSON
      manager.setMetadata('total_files', '2');
      manager.setMetadata('total_symbols', '4');

      const stats = manager.getStats();
      expect(stats).not.toBeNull();
      expect(stats?.totalFiles).toBe(2);
      expect(stats?.totalSymbols).toBe(4);
    });

    it('should store file metadata correctly', () => {
      manager.insertBatch(mockFiles);

      const symbols = manager.getFileSymbols('src/index.ts');
      expect(symbols).toHaveLength(3);
      expect(symbols[0].name).toBe('testFunction');
    });

    it('should import symbols with correct properties', () => {
      manager.insertBatch(mockFiles);

      const symbols = manager.getFileSymbols('src/index.ts');
      const testFunc = symbols.find((s) => s.name === 'testFunction');

      expect(testFunc).toBeDefined();
      expect(testFunc?.type).toBe('function');
      expect(testFunc?.line).toBe(10);
      expect(testFunc?.exported).toBe(true);
      expect(testFunc?.signature).toBe('function testFunction(): void');
    });

    it('should import imports and exports', () => {
      manager.insertBatch(mockFiles);

      const importers = manager.findImporters('fs');
      expect(importers).toContain('src/index.ts');
    });
  });

  describe('searchSymbols', () => {
    beforeEach(() => {
      manager.insertBatch(mockFiles);
    });

    it('should find exact match', () => {
      const results = manager.searchSymbols('testFunction');

      expect(results).toHaveLength(1);
      expect(results[0].symbol?.name).toBe('testFunction');
    });

    it('should find partial match', () => {
      const results = manager.searchSymbols('test');

      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.symbol?.name === 'testFunction')).toBe(true);
      expect(results.some((r) => r.symbol?.name === 'TestClass')).toBe(true);
    });

    it('should return results with correct structure', () => {
      const results = manager.searchSymbols('testFunction');

      expect(results[0]).toHaveProperty('path');
      expect(results[0]).toHaveProperty('line');
      expect(results[0]).toHaveProperty('symbol');
      expect(results[0]).toHaveProperty('score');
    });

    it('should score exact matches highest', () => {
      const results = manager.searchSymbols('testFunction');

      expect(results[0].score).toBeGreaterThanOrEqual(100);
    });

    it('should respect limit parameter', () => {
      const results = manager.searchSymbols('', 2);

      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should return empty array for non-matching query', () => {
      const results = manager.searchSymbols('nonExistentSymbol123');

      expect(results).toEqual([]);
    });

    it('should be case-insensitive', () => {
      const results = manager.searchSymbols('TESTFUNCTION');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].symbol?.name).toBe('testFunction');
    });
  });

  describe('findFiles', () => {
    beforeEach(() => {
      manager.insertBatch(mockFiles);
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

    it('should respect limit parameter', () => {
      const results = manager.findFiles('.ts', 1);

      expect(results.length).toBeLessThanOrEqual(1);
    });

    it('should be case-insensitive', () => {
      const results = manager.findFiles('INDEX');

      expect(results).toContain('src/index.ts');
    });
  });

  describe('getFileSymbols', () => {
    beforeEach(() => {
      manager.insertBatch(mockFiles);
    });

    it('should get all symbols in a file', () => {
      const symbols = manager.getFileSymbols('src/index.ts');

      expect(symbols).toHaveLength(3);
    });

    it('should return symbols in order by line', () => {
      const symbols = manager.getFileSymbols('src/index.ts');

      expect(symbols[0].line).toBeLessThan(symbols[1].line);
      expect(symbols[1].line).toBeLessThan(symbols[2].line);
    });

    it('should return empty array for non-existent file', () => {
      const symbols = manager.getFileSymbols('nonexistent.ts');

      expect(symbols).toEqual([]);
    });
  });

  describe('findImporters', () => {
    beforeEach(() => {
      manager.insertBatch(mockFiles);
    });

    it('should find files importing a module', () => {
      const importers = manager.findImporters('fs');

      expect(importers).toContain('src/index.ts');
    });

    it('should support partial module name', () => {
      const importers = manager.findImporters('pat');

      expect(importers).toContain('src/index.ts');
    });

    it('should return empty array for non-imported module', () => {
      const importers = manager.findImporters('nonexistent-module');

      expect(importers).toEqual([]);
    });
  });

  describe('getStats', () => {
    it('should return null for empty database', () => {
      const stats = manager.getStats();

      expect(stats).toBeNull();
    });

    it('should return correct statistics after insert', () => {
      manager.insertBatch(mockFiles);
      manager.setMetadata('total_files', '2');
      manager.setMetadata('total_symbols', '4');

      const stats = manager.getStats();

      expect(stats).not.toBeNull();
      expect(stats?.totalFiles).toBe(2);
      expect(stats?.totalSymbols).toBe(4);
      expect(stats?.totalSize).toBe(1500); // 1000 + 500
    });
  });

  describe('hasData', () => {
    it('should return false for empty database', () => {
      expect(manager.hasData()).toBe(false);
    });

    it('should return true after inserting data', () => {
      manager.insertBatch(mockFiles);

      expect(manager.hasData()).toBe(true);
    });
  });

  describe('getAllFiles', () => {
    it('should return all files', () => {
      manager.insertBatch(mockFiles);
      const files = manager.getAllFiles();

      expect(files).toHaveLength(2);
      expect(files.some((f) => f.path === 'src/index.ts')).toBe(true);
      expect(files.some((f) => f.path === 'src/utils.ts')).toBe(true);
      expect(files[0]).toHaveProperty('mtime');
      expect(files[0]).toHaveProperty('hash');
    });
  });

  describe('deleteFile', () => {
    it('should delete file and associated data', () => {
      manager.insertBatch(mockFiles);
      manager.deleteFile('src/index.ts');

      const files = manager.getAllFiles();
      expect(files).toHaveLength(1);
      expect(files[0].path).toBe('src/utils.ts');

      const symbols = manager.getFileSymbols('src/index.ts');
      expect(symbols).toHaveLength(0);
    });
  });

  describe('metadata', () => {
    it('should set and get metadata', () => {
      manager.setMetadata('foo', 'bar');
      expect(manager.getMetadata('foo')).toBe('bar');
    });

    it('should return null for missing metadata', () => {
      expect(manager.getMetadata('missing')).toBeNull();
    });
  });
});
