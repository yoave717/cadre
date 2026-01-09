import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as grep from '../../src/tools/grep';
import fs from 'fs/promises';
import path from 'path';

vi.mock('fs/promises');

describe('Grep Tools', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const mockFileSystem: any = {
        '/app': [
            { name: 'file1.txt', isDirectory: () => false, isFile: () => true },
            { name: 'src', isDirectory: () => true, isFile: () => false },
        ],
        '/app/src': [
            { name: 'code.ts', isDirectory: () => false, isFile: () => true },
        ],
    };

    const mockFileContent: any = {
        '/app/file1.txt': 'Hello world\nThis is a test file.\nGoodbye world',
        '/app/src/code.ts': 'function test() {\n  console.log("hello");\n}',
    };

    // Helper to setup mocks
    const setupFsMock = () => {
        (fs.readdir as any).mockImplementation(async (dirPath: string) => {
             const normalized = dirPath === process.cwd() ? '/app' : dirPath;
             const lookupPath = normalized.startsWith('/') ? normalized : path.join('/app', normalized);

            if (mockFileSystem[lookupPath]) {
                return mockFileSystem[lookupPath];
            }
            return [];
        });

        (fs.readFile as any).mockImplementation(async (filePath: string) => {
            const normalized = filePath.startsWith('/') ? filePath : path.join('/app', filePath);
            if (mockFileContent[normalized]) {
                return mockFileContent[normalized];
            }
            throw new Error('ENOENT');
        });
    };

    describe('grepFiles', () => {
        it('should find exact matches with context', async () => {
            setupFsMock();
            const result = await grep.grepFiles('test', { cwd: '/app', contextLines: 1 });
            
            expect(result).toContain('file1.txt');
            expect(result).toContain('This is a test file');
            expect(result).toContain('Hello world'); // Before context
            expect(result).toContain('Goodbye world'); // After context
        });

        it('should handle case insensitivity', async () => {
            setupFsMock();
            const result = await grep.grepFiles('HELLO', { cwd: '/app', caseSensitive: false });
            
            expect(result).toContain('file1.txt');
            expect(result).toContain('Hello world');
        });

        it('should return no matches message', async () => {
            setupFsMock();
            const result = await grep.grepFiles('nonexistent', { cwd: '/app' });
            expect(result).toContain('No matches found');
        });
    });

    describe('grepCount', () => {
        it('should count matches correctly', async () => {
            setupFsMock();
            const result = await grep.grepCount('world', { cwd: '/app' });
            
            expect(result).toContain('file1.txt');
            expect(result).toContain('2'); // Hello world, Goodbye world
        });
    });

    describe('grepFilesOnly', () => {
        it('should list files containing pattern', async () => {
            setupFsMock();
            const result = await grep.grepFilesOnly('console', { cwd: '/app' });
            
            expect(result).toContain('src/code.ts');
            expect(result).not.toContain('file1.txt');
        });
    });
});
