import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';

vi.mock('fs/promises');
vi.mock('os', () => ({
  default: {
    homedir: () => '/home/user',
  },
}));

import {
  hashProjectPath,
  getIndexDir,
  getIndexFile,
  loadIndex,
  saveIndex,
  deleteIndex,
  listIndexedProjects,
  getIndexStats,
  clearAllIndexes,
} from '../../src/index-system/storage';
import type { ProjectIndex } from '../../src/index-system/types';

describe('Index Storage', () => {
  const mockHomeDir = '/home/user';
  const mockProjectPath = '/home/user/projects/myapp';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('hashProjectPath', () => {
    it('should generate consistent hash for same path', () => {
      const hash1 = hashProjectPath(mockProjectPath);
      const hash2 = hashProjectPath(mockProjectPath);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(16);
    });

    it('should generate different hashes for different paths', () => {
      const hash1 = hashProjectPath('/path1');
      const hash2 = hashProjectPath('/path2');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('getIndexDir', () => {
    it('should return correct index directory path', () => {
      const hash = hashProjectPath(mockProjectPath);
      const expected = path.join(mockHomeDir, '.cadre', 'indexes', hash);
      const result = getIndexDir(mockProjectPath);

      expect(result).toBe(expected);
    });
  });

  describe('getIndexFile', () => {
    it('should return correct index file path', () => {
      const hash = hashProjectPath(mockProjectPath);
      const expected = path.join(mockHomeDir, '.cadre', 'indexes', hash, 'index.json');
      const result = getIndexFile(mockProjectPath);

      expect(result).toBe(expected);
    });
  });

  describe('loadIndex', () => {
    it('should load valid index from disk', async () => {
      const mockIndex: ProjectIndex = {
        version: 1,
        projectRoot: mockProjectPath,
        projectHash: 'abc123',
        indexed_at: Date.now(),
        files: {},
        totalFiles: 0,
        totalSymbols: 0,
        languages: {},
      };

      (fs.readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        JSON.stringify(mockIndex),
      );

      const result = await loadIndex(mockProjectPath);

      expect(result).toEqual(mockIndex);
    });

    it('should return null for non-existent index', async () => {
      (fs.readFile as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('File not found'),
      );

      const result = await loadIndex(mockProjectPath);

      expect(result).toBeNull();
    });

    it('should return null for invalid JSON', async () => {
      (fs.readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('invalid json');

      const result = await loadIndex(mockProjectPath);

      expect(result).toBeNull();
    });
  });

  describe('saveIndex', () => {
    it('should save index to disk', async () => {
      const mockIndex: ProjectIndex = {
        version: 1,
        projectRoot: mockProjectPath,
        projectHash: 'abc123',
        indexed_at: Date.now(),
        files: {},
        totalFiles: 0,
        totalSymbols: 0,
        languages: {},
      };

      (fs.mkdir as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (fs.writeFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await saveIndex(mockIndex);

      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('index.json'),
        expect.stringContaining(mockIndex.projectRoot),
        'utf-8',
      );
    });
  });

  describe('deleteIndex', () => {
    it('should delete index directory', async () => {
      (fs.rm as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await deleteIndex(mockProjectPath);

      expect(fs.rm).toHaveBeenCalledWith(expect.any(String), {
        recursive: true,
        force: true,
      });
    });

    it('should handle deletion errors gracefully', async () => {
      (fs.rm as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Permission denied'),
      );

      await expect(deleteIndex(mockProjectPath)).resolves.not.toThrow();
    });
  });

  describe('listIndexedProjects', () => {
    it('should list all indexed projects', async () => {
      interface MockDirent {
        name: string;
        isDirectory: () => boolean;
      }

      const mockDirents: MockDirent[] = [
        { name: 'abc123', isDirectory: () => true },
        { name: 'def456', isDirectory: () => true },
      ];

      const mockIndex1: ProjectIndex = {
        version: 1,
        projectRoot: '/project1',
        projectHash: 'abc123',
        indexed_at: 1000000,
        files: {},
        totalFiles: 10,
        totalSymbols: 50,
        languages: {},
      };

      const mockIndex2: ProjectIndex = {
        version: 1,
        projectRoot: '/project2',
        projectHash: 'def456',
        indexed_at: 2000000,
        files: {},
        totalFiles: 20,
        totalSymbols: 100,
        languages: {},
      };

      (fs.mkdir as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (fs.readdir as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockDirents);
      (fs.readFile as unknown as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(JSON.stringify(mockIndex1))
        .mockResolvedValueOnce(JSON.stringify(mockIndex2));

      const result = await listIndexedProjects();

      expect(result).toHaveLength(2);
      expect(result[0].path).toBe('/project1');
      expect(result[0].hash).toBe('abc123');
      expect(result[1].path).toBe('/project2');
      expect(result[1].hash).toBe('def456');
    });

    it('should return empty array if no indexes exist', async () => {
      (fs.mkdir as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (fs.readdir as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const result = await listIndexedProjects();

      expect(result).toEqual([]);
    });

    it('should skip invalid indexes', async () => {
      interface MockDirent {
        name: string;
        isDirectory: () => boolean;
      }

      const mockDirents: MockDirent[] = [
        { name: 'abc123', isDirectory: () => true },
        { name: 'invalid', isDirectory: () => true },
      ];

      const mockIndex: ProjectIndex = {
        version: 1,
        projectRoot: '/project1',
        projectHash: 'abc123',
        indexed_at: 1000000,
        files: {},
        totalFiles: 10,
        totalSymbols: 50,
        languages: {},
      };

      (fs.mkdir as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (fs.readdir as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockDirents);
      (fs.readFile as unknown as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(JSON.stringify(mockIndex))
        .mockRejectedValueOnce(new Error('Invalid JSON'));

      const result = await listIndexedProjects();

      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('/project1');
    });
  });

  describe('getIndexStats', () => {
    it('should return index statistics', async () => {
      const mockIndex: ProjectIndex = {
        version: 1,
        projectRoot: mockProjectPath,
        projectHash: 'abc123',
        indexed_at: 1000000,
        files: {},
        totalFiles: 50,
        totalSymbols: 200,
        languages: {},
      };

      (fs.readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        JSON.stringify(mockIndex),
      );
      (fs.stat as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        size: 1024,
      });

      const result = await getIndexStats(mockProjectPath);

      expect(result).not.toBeNull();
      expect(result?.files).toBe(50);
      expect(result?.symbols).toBe(200);
      expect(result?.size).toBe(1024);
      expect(result?.indexed_at).toBe(1000000);
    });

    it('should return null for non-existent index', async () => {
      (fs.readFile as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('File not found'),
      );

      const result = await getIndexStats(mockProjectPath);

      expect(result).toBeNull();
    });
  });

  describe('clearAllIndexes', () => {
    it('should remove all indexes', async () => {
      (fs.rm as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await clearAllIndexes();

      expect(fs.rm).toHaveBeenCalledWith(expect.stringContaining('.cadre/indexes'), {
        recursive: true,
        force: true,
      });
    });

    it('should handle errors gracefully', async () => {
      (fs.rm as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Permission denied'),
      );

      await expect(clearAllIndexes()).resolves.not.toThrow();
    });
  });
});
