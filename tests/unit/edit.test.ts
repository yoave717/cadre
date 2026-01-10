import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import * as edit from '../../src/tools/edit';
import * as files from '../../src/tools/files';

vi.mock('fs/promises');
vi.mock('../../src/tools/files', () => ({
  hasBeenRead: vi.fn(),
}));
vi.mock('../../src/permissions/index.js', () => ({
  getPermissionManager: () => ({
    checkAndRequest: vi.fn().mockResolvedValue(true),
  }),
}));

describe('Edit Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('editFile', () => {
    it('should fail if file has not been read', async () => {
      (files.hasBeenRead as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);
      const result = await edit.editFile('test.txt', 'old', 'new');
      expect(result).toContain('file was not read first');
    });

    it('should replace a string successfully', async () => {
      (files.hasBeenRead as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (fs.readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('Hello old world');
      (fs.writeFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const result = await edit.editFile('test.txt', 'old', 'new');

      expect(fs.writeFile).toHaveBeenCalledWith(
        path.resolve('test.txt'),
        'Hello new world',
        'utf-8',
      );
      expect(result).toContain('Successfully edited');
    });

    it('should fail if old string is not found', async () => {
      (files.hasBeenRead as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (fs.readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('Hello world');

      const result = await edit.editFile('test.txt', 'old', 'new');
      expect(result).toContain('not found');
    });

    it('should fail if old string is ambiguous and replaceAll is false', async () => {
      (files.hasBeenRead as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (fs.readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('Hello old old world');

      const result = await edit.editFile('test.txt', 'old', 'new');
      expect(result).toContain('appears 2 times');
    });

    it('should replace all occurrences if replaceAll is true', async () => {
      (files.hasBeenRead as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (fs.readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('Hello old old world');

      await edit.editFile('test.txt', 'old', 'new', true);

      expect(fs.writeFile).toHaveBeenCalledWith(
        path.resolve('test.txt'),
        'Hello new new world',
        'utf-8',
      );
    });
  });

  describe('insertAtLine', () => {
    it('should insert content at specific line', async () => {
      (files.hasBeenRead as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (fs.readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('line1\nline2\nline3');

      const result = await edit.insertAtLine('test.txt', 2, 'newLine');

      expect(fs.writeFile).toHaveBeenCalledWith(
        path.resolve('test.txt'),
        'line1\nnewLine\nline2\nline3',
        'utf-8',
      );
      expect(result).toContain('Successfully inserted');
    });

    it('should fail if line number is out of range', async () => {
      (files.hasBeenRead as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (fs.readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('line1');

      const result = await edit.insertAtLine('test.txt', 5, 'content');
      expect(result).toContain('out of range');
    });
  });

  describe('deleteLines', () => {
    it('should delete lines in range', async () => {
      (files.hasBeenRead as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (fs.readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        'line1\nline2\nline3\nline4',
      );

      const result = await edit.deleteLines('test.txt', 2, 3);

      expect(fs.writeFile).toHaveBeenCalledWith(path.resolve('test.txt'), 'line1\nline4', 'utf-8');
      expect(result).toContain('Successfully deleted');
    });
  });
});
