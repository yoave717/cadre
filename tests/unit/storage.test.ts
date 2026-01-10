import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import zlib from 'zlib';
import { promisify } from 'util';
import { saveIndex, loadIndex, getIndexDir, getIndexFile } from '../../src/index-system/storage';
import type { ProjectIndex } from '../../src/index-system/types';

const gunzip = promisify(zlib.gunzip);

describe('Storage - Compressed JSON', () => {
  const testProjectRoot = '/tmp/test-project-' + Date.now();
  const mockIndex: ProjectIndex = {
    version: 1,
    projectRoot: testProjectRoot,
    projectHash: 'test-hash-123',
    indexed_at: Date.now(),
    files: {
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
            type: 'function',
            line: 10,
            exported: true,
            signature: 'function testFunction(): void',
          },
          {
            name: 'TestClass',
            type: 'class',
            line: 20,
            exported: true,
          },
        ],
        imports: ['fs', 'path'],
        exports: ['testFunction', 'TestClass'],
      },
    },
    totalFiles: 1,
    totalSymbols: 2,
    languages: { TypeScript: 1 },
  };

  afterEach(async () => {
    // Cleanup test directory
    try {
      const indexDir = getIndexDir(testProjectRoot);
      await fs.rm(indexDir, { recursive: true, force: true });
    } catch {
      // Ignore errors
    }
  });

  describe('saveIndex', () => {
    it('should save index as compressed gzip file', async () => {
      await saveIndex(mockIndex);

      const indexFile = getIndexFile(testProjectRoot);
      const fileData = await fs.readFile(indexFile);

      // Verify file exists and is not plain JSON
      expect(fileData).toBeDefined();

      // Verify it can be decompressed
      const decompressed = await gunzip(fileData);
      const parsed = JSON.parse(decompressed.toString('utf-8'));

      expect(parsed).toEqual(mockIndex);
    });

    it('should create index directory if it does not exist', async () => {
      const indexDir = getIndexDir(testProjectRoot);

      // Ensure directory doesn't exist
      await fs.rm(indexDir, { recursive: true, force: true }).catch(() => {});

      await saveIndex(mockIndex);

      // Verify directory was created
      const stats = await fs.stat(indexDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should produce smaller file than uncompressed JSON', async () => {
      await saveIndex(mockIndex);

      const indexFile = getIndexFile(testProjectRoot);
      const compressedData = await fs.readFile(indexFile);
      const uncompressedData = Buffer.from(JSON.stringify(mockIndex), 'utf-8');

      // Compressed should be significantly smaller
      expect(compressedData.length).toBeLessThan(uncompressedData.length * 0.9);
    });

    it('should not use pretty-printed JSON', async () => {
      await saveIndex(mockIndex);

      const indexFile = getIndexFile(testProjectRoot);
      const compressedData = await fs.readFile(indexFile);
      const decompressed = await gunzip(compressedData);
      const jsonString = decompressed.toString('utf-8');

      // Pretty-printed JSON has newlines and indentation
      // Minified JSON should not have these
      const prettyJsonSize = JSON.stringify(mockIndex, null, 2).length;
      const minifiedJsonSize = jsonString.length;

      expect(minifiedJsonSize).toBeLessThan(prettyJsonSize);
      expect(jsonString).not.toContain('\n  '); // No indentation
    });
  });

  describe('loadIndex', () => {
    it('should load compressed index', async () => {
      await saveIndex(mockIndex);

      const loaded = await loadIndex(testProjectRoot);

      expect(loaded).toEqual(mockIndex);
    });

    it('should handle backward compatibility with uncompressed JSON', async () => {
      // Save uncompressed JSON (legacy format)
      const indexFile = getIndexFile(testProjectRoot);
      const indexDir = getIndexDir(testProjectRoot);

      await fs.mkdir(indexDir, { recursive: true });
      await fs.writeFile(indexFile, JSON.stringify(mockIndex, null, 2), 'utf-8');

      // Should still load successfully
      const loaded = await loadIndex(testProjectRoot);

      expect(loaded).toEqual(mockIndex);
    });

    it('should return null for non-existent index', async () => {
      const nonExistentProject = '/tmp/non-existent-' + Date.now();
      const loaded = await loadIndex(nonExistentProject);

      expect(loaded).toBeNull();
    });

    it('should return null for corrupted gzip file', async () => {
      const indexFile = getIndexFile(testProjectRoot);
      const indexDir = getIndexDir(testProjectRoot);

      await fs.mkdir(indexDir, { recursive: true });
      // Write invalid gzip data
      await fs.writeFile(indexFile, Buffer.from('not valid gzip data'));

      const loaded = await loadIndex(testProjectRoot);

      // Should fall back and try as JSON, but that will also fail
      expect(loaded).toBeNull();
    });

    it('should preserve all data fields after save/load cycle', async () => {
      await saveIndex(mockIndex);
      const loaded = await loadIndex(testProjectRoot);

      // Check all fields are preserved
      expect(loaded?.version).toBe(mockIndex.version);
      expect(loaded?.projectRoot).toBe(mockIndex.projectRoot);
      expect(loaded?.projectHash).toBe(mockIndex.projectHash);
      expect(loaded?.indexed_at).toBe(mockIndex.indexed_at);
      expect(loaded?.totalFiles).toBe(mockIndex.totalFiles);
      expect(loaded?.totalSymbols).toBe(mockIndex.totalSymbols);
      expect(loaded?.languages).toEqual(mockIndex.languages);

      // Check file data
      const file = loaded?.files['src/index.ts'];
      expect(file).toBeDefined();
      expect(file?.metadata.path).toBe('src/index.ts');
      expect(file?.symbols).toHaveLength(2);
      expect(file?.imports).toEqual(['fs', 'path']);
      expect(file?.exports).toEqual(['testFunction', 'TestClass']);
    });
  });

  describe('compression efficiency', () => {
    it('should achieve at least 50% compression for typical index', async () => {
      // Create a larger mock index to test compression
      const largeIndex: ProjectIndex = {
        ...mockIndex,
        files: {},
      };

      // Add 100 files with symbols
      for (let i = 0; i < 100; i++) {
        largeIndex.files[`src/file${i}.ts`] = {
          metadata: {
            path: `src/file${i}.ts`,
            absolutePath: path.join(testProjectRoot, `src/file${i}.ts`),
            size: 1000 + i,
            mtime: Date.now(),
            hash: `hash-${i}`,
            language: 'TypeScript',
            lines: 50,
          },
          symbols: [
            {
              name: `function${i}`,
              type: 'function',
              line: 10,
              exported: true,
            },
            {
              name: `Class${i}`,
              type: 'class',
              line: 20,
              exported: true,
            },
          ],
          imports: ['fs', 'path', 'crypto'],
          exports: [`function${i}`, `Class${i}`],
        };
      }

      largeIndex.totalFiles = 100;
      largeIndex.totalSymbols = 200;

      await saveIndex(largeIndex);

      const indexFile = getIndexFile(testProjectRoot);
      const compressedSize = (await fs.stat(indexFile)).size;
      const uncompressedSize = Buffer.from(JSON.stringify(largeIndex), 'utf-8').length;

      const compressionRatio = compressedSize / uncompressedSize;

      // Should achieve at least 50% compression (ratio < 0.5)
      expect(compressionRatio).toBeLessThan(0.5);

      // Most likely will achieve 60-70% compression (ratio < 0.4)
      console.log(
        `Compression: ${uncompressedSize} bytes -> ${compressedSize} bytes (${(compressionRatio * 100).toFixed(1)}% of original)`,
      );
    });
  });

  describe('migration scenario', () => {
    it('should automatically upgrade legacy index on next save', async () => {
      // Save as legacy format
      const indexFile = getIndexFile(testProjectRoot);
      const indexDir = getIndexDir(testProjectRoot);

      await fs.mkdir(indexDir, { recursive: true });
      await fs.writeFile(indexFile, JSON.stringify(mockIndex, null, 2), 'utf-8');

      const legacySize = (await fs.stat(indexFile)).size;

      // Load and re-save (this should upgrade to compressed format)
      const loaded = await loadIndex(testProjectRoot);
      if (loaded) {
        await saveIndex(loaded);
      }

      const compressedSize = (await fs.stat(indexFile)).size;

      // New file should be smaller
      expect(compressedSize).toBeLessThan(legacySize);

      // Should still load correctly
      const reloaded = await loadIndex(testProjectRoot);
      expect(reloaded).toEqual(mockIndex);
    });
  });
});
