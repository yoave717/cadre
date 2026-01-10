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
      expect(result).toContain('Successfully applied 1 edit(s)');
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

    it('should edit correctly within a valid line range', async () => {
      (files.hasBeenRead as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);
      const content = 'line1\nline2 target\nline3\nline4 target';
      (fs.readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(content);

      // Replace 'target' only in lines 2-3 (so only the first 'target')
      const result = await edit.editFile('test.txt', 'target', 'REPLACED', false, 2, 3);

      expect(fs.writeFile).toHaveBeenCalledWith(
        path.resolve('test.txt'),
        'line1\nline2 REPLACED\nline3\nline4 target',
        'utf-8',
      );
      expect(result).toContain('Successfully applied 1 edit(s)');
    });

    it('should fail if range is invalid', async () => {
      (files.hasBeenRead as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (fs.readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('line1\nline2');

      const result = await edit.editFile('test.txt', 'foo', 'bar', false, 5, 2);
      expect(result).toContain('Invalid line range');
    });

    it('should fail if target not found in range', async () => {
      (files.hasBeenRead as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);
      const content = 'line1 target\nline2\nline3';
      (fs.readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(content);

      // Search in lines 2-3 where 'target' is absent
      const result = await edit.editFile('test.txt', 'target', 'new', false, 2, 3);
      expect(result).toContain('not found in lines 2-3');
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

  describe('multiEditFile', () => {
    it('should apply multiple edits sequentially', async () => {
      (files.hasBeenRead as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (fs.readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
        'Hello old world. This is a test.',
      );

      const edits = [
        { oldString: 'old', newString: 'new' },
        { oldString: 'test', newString: 'success' },
      ];

      const result = await edit.multiEditFile('test.txt', edits);

      expect(fs.writeFile).toHaveBeenCalledWith(
        path.resolve('test.txt'),
        'Hello new world. This is a success.',
        'utf-8',
      );
      expect(result).toContain('Successfully applied 2 edit(s)');
    });

    it('should fail atomically if one edit fails', async () => {
      (files.hasBeenRead as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);
      // 2nd edit will fail because 'missing' is not there
      (fs.readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('Hello old world.');

      const edits = [
        { oldString: 'old', newString: 'new' },
        { oldString: 'missing', newString: 'found' },
      ];

      const result = await edit.multiEditFile('test.txt', edits);

      expect(fs.writeFile).not.toHaveBeenCalled();
      expect(result).toContain('Error applying edit #2');
    });

    it('should handle sequential edits where second depends on first', async () => {
      (files.hasBeenRead as unknown as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (fs.readFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('start');

      const edits = [
        { oldString: 'start', newString: 'middle' },
        { oldString: 'middle', newString: 'end' },
      ];

      const result = await edit.multiEditFile('test.txt', edits);

      expect(fs.writeFile).toHaveBeenCalledWith(path.resolve('test.txt'), 'end', 'utf-8');
      expect(result).toContain('Successfully applied 2 edit(s)');
    });
  });
});
