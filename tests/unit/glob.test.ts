import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import * as glob from '../../src/tools/glob';

vi.mock('fs/promises');
vi.mock('../../src/tools/index', () => ({
  getAllFilePaths: vi.fn().mockResolvedValue([]),
}));

describe('Glob Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  interface MockEntry {
    name: string;
    isDirectory: () => boolean;
    isFile: () => boolean;
  }

  const mockFileSystem: Record<string, MockEntry[]> = {
    '/app': [
      { name: 'file1.txt', isDirectory: () => false, isFile: () => true },
      { name: 'src', isDirectory: () => true, isFile: () => false },
      { name: 'node_modules', isDirectory: () => true, isFile: () => false },
    ],
    '/app/src': [
      { name: 'index.ts', isDirectory: () => false, isFile: () => true },
      { name: 'utils.ts', isDirectory: () => false, isFile: () => true },
      { name: 'component.tsx', isDirectory: () => false, isFile: () => true },
    ],
    '/app/node_modules': [{ name: 'pkg', isDirectory: () => true, isFile: () => false }],
  };

  // Helper to setup readdir mock
  const setupFsMock = () => {
    (fs.readdir as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      async (dirPath: string) => {
        // Normalize path to match mock keys (simplified)
        // Assuming tests run with a predictable base or we control the path
        // For this test, we can assume absolute paths or just match basic structure
        const normalized = dirPath === process.cwd() ? '/app' : dirPath;

        // If normalized is relative, assume /app base for simplicity in this mock context
        const lookupPath = normalized.startsWith('/') ? normalized : path.join('/app', normalized);

        if (mockFileSystem[lookupPath]) {
          return mockFileSystem[lookupPath];
        }
        return []; // Empty dir or not found
      },
    );
  };

  describe('globFiles', () => {
    it('should find files matching pattern', async () => {
      setupFsMock();
      const result = await glob.globFiles('**/*.ts', { cwd: '/app' });

      expect(result).toContain('src/index.ts');
      expect(result).toContain('src/utils.ts');
      expect(result).not.toContain('file1.txt');
    });

    it('should ignore default patterns like node_modules', async () => {
      setupFsMock();
      const result = await glob.globFiles('**', { cwd: '/app' });

      expect(result).not.toContain('node_modules'); // Should be ignored
      expect(result).toContain('file1.txt');
    });

    it('should return message if no files found', async () => {
      setupFsMock();
      const result = await glob.globFiles('*.md', { cwd: '/app' });
      expect(result).toContain('No files found');
    });
  });

  describe('findByExtension', () => {
    it('should find files by extension', async () => {
      setupFsMock();
      const result = await glob.findByExtension('tsx', { cwd: '/app' });
      expect(result).toContain('src/component.tsx');
    });
  });

  describe('directoryTree', () => {
    it('should generate a tree structure', async () => {
      setupFsMock();
      // Mock path.resolve to return the input for simplicity in output check
      // Actually implementation uses path.resolve, so checks are based on that.

      const result = await glob.directoryTree('/app', 2);
      // Check for structure characters
      expect(result).toContain('├── src/');
      expect(result).toContain('│   ├── component.tsx');
      // Check max depth handling (simplified check)
      expect(result).toBeTruthy();
    });
  });
});
