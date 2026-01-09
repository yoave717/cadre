import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as files from '../../src/tools/files';
import fs from 'fs/promises';
import path from 'path';

// Mock fs and permissions
vi.mock('fs/promises');
vi.mock('../../src/permissions/index.js', () => ({
  getPermissionManager: () => ({
    checkAndRequest: vi.fn().mockResolvedValue(true),
  }),
}));

describe('File Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    files.clearReadTracking();
  });

  describe('readFile', () => {
    it('should read a file and track it', async () => {
      const mockContent = 'Hello, world!';
      (fs.readFile as any).mockResolvedValue(mockContent);
      const filePath = 'test.txt';

      const result = await files.readFile(filePath);

      expect(fs.readFile).toHaveBeenCalledWith(path.resolve(filePath), 'utf-8');
      expect(result).toContain('Hello, world!');
      expect(files.hasBeenRead(filePath)).toBe(true);
    });

    it('should handle errors gracefully', async () => {
      (fs.readFile as any).mockRejectedValue(new Error('File not found'));
      const result = await files.readFile('nonexistent.txt');
      expect(result).toContain('Error reading file');
    });

    it('should support offset and limit', async () => {
        const lines = ['line1', 'line2', 'line3', 'line4'];
        (fs.readFile as any).mockResolvedValue(lines.join('\n'));
        
        // Offset 1 (start at line2), limit 2 (take line2, line3)
        const result = await files.readFile('test.txt', 1, 2);
        
        expect(result).toContain('line2');
        expect(result).toContain('line3');
        expect(result).not.toContain('line1');
        expect(result).not.toContain('line4');
    });
  });

  describe('writeFile', () => {
    it('should write to a file if permission is granted', async () => {
        // Mock that the file does not exist initially
        (fs.access as any).mockRejectedValue(new Error('ENOENT'));
        (fs.mkdir as any).mockResolvedValue(undefined); // succeed mkdir
        (fs.writeFile as any).mockResolvedValue(undefined);

        const result = await files.writeFile('newfile.txt', 'content');
        
        expect(fs.writeFile).toHaveBeenCalled();
        expect(result).toContain('Successfully wrote');
    });

    it('should prevent overwriting unread files', async () => {
         // Mock that file exists
         (fs.access as any).mockResolvedValue(undefined);
         
         const result = await files.writeFile('existing.txt', 'content');
         
         expect(result).toContain('Error: Cannot write to');
         expect(fs.writeFile).not.toHaveBeenCalled();
    });
  });
});
