import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { IndexManager } from '../../src/index-system/manager';
import crypto from 'crypto';

describe('IndexManager Integration', () => {
  let tempDir: string;
  let manager: IndexManager;

  beforeEach(() => {
    // Create a unique temporary directory for each test
    // Resolve real path to avoid issues with /var vs /private/var on macOS
    tempDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cadre-index-test-')));

    // Create some sample project structure
    fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
    // Use function because symbol-extractor regex only catches UPPERCASE consts currently (!)
    fs.writeFileSync(
      path.join(tempDir, 'src', 'index.ts'),
      'export function hello() { return "world"; }',
    );
    fs.writeFileSync(
      path.join(tempDir, 'src', 'utils.ts'),
      'export function add(a: number, b: number) { return a + b; }',
    );

    manager = new IndexManager(tempDir);
  });

  afterEach(() => {
    // Close DB connection (accessible via private property or known side effect)
    // Since IndexManager doesn't expose close(), we might need to access the sqlite instance if possible,
    // or rely on SqliteIndexManager to be clean.
    // However, the test creates a new directory, so it shouldn't conflict.
    // Ideally IndexManager should have a close() method.
    // Casting to any to access private property for cleanup if necessary,
    // but better to just rely on system cleanup or weak refs if implemented.
    // For this test, we can try to close the underlying DB if we can access it.
    if ((manager as any).db) {
      (manager as any).db.close();
    }

    // Cleanup temp files
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {
      // Ignore cleanup errors
    }

    // Cleanup global index directory
    const hash = crypto.createHash('sha256').update(tempDir).digest('hex').slice(0, 16);
    const indexDir = path.join(os.homedir(), '.cadre', 'indexes', hash);
    if (fs.existsSync(indexDir)) {
      try {
        fs.rmSync(indexDir, { recursive: true, force: true });
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  });

  it('should build a full index and persist to Database', async () => {
    const stats = await manager.buildIndex();

    expect(stats.totalFiles).toBe(2);
    expect(manager.isLoaded()).toBe(true);

    // Verify symbols via search
    // const allFiles = manager.findFiles('');
    // console.log('All files in DB:', allFiles);

    // Check symbols for index.ts directly
    // const indexSymbols = manager.getFileSymbols('src/index.ts');
    // console.log('Symbols in index.ts:', indexSymbols);

    const results = manager.searchSymbols('hello');
    expect(results).toHaveLength(1);
    expect(results[0].symbol?.name).toBe('hello');
    expect(results[0].path).toBe('src/index.ts');

    const funcResults = manager.searchSymbols('add');
    expect(funcResults.length).toBeGreaterThan(0);
    expect(funcResults[0].symbol?.name).toBe('add');
  });

  it('should support incremental updates', async () => {
    // 1. Initial build
    await manager.buildIndex();

    // 2. Modify a file (change content)
    // Wait a bit to ensure mtime changes (filesystems have 1ms-1s resolution)
    await new Promise((resolve) => setTimeout(resolve, 100));
    fs.writeFileSync(
      path.join(tempDir, 'src', 'index.ts'),
      'export function hello() { return "updated"; }\nexport function extra() { return 1; }',
    );

    // 3. Add a new file
    fs.writeFileSync(path.join(tempDir, 'src', 'new.ts'), 'export class NewClass {}');

    // 4. Delete a file
    fs.rmSync(path.join(tempDir, 'src', 'utils.ts'));

    // 5. Update index
    const stats = await manager.updateIndex();

    // Verify stats (updated files count)
    // index.ts (modified), new.ts (added) -> 2 files indexed
    expect(stats.totalFiles).toBe(2);

    // Verify content in DB
    const helloResults = manager.searchSymbols('hello');
    expect(helloResults).toHaveLength(1); // Should still exist

    const extraResults = manager.searchSymbols('extra');
    expect(extraResults).toHaveLength(1); // New symbol

    const newClassResults = manager.searchSymbols('NewClass');
    expect(newClassResults).toHaveLength(1); // New file symbol

    const addResults = manager.searchSymbols('add');
    expect(addResults).toHaveLength(0); // Deleted file symbol should be gone

    // Check total files in DB
    // We expect index.ts and new.ts (2 files)
    const allFiles = manager.findFiles(''); // Should return all
    expect(allFiles).toHaveLength(2);
    expect(allFiles).toContain('src/index.ts');
    expect(allFiles).toContain('src/new.ts');
    expect(allFiles).not.toContain('src/utils.ts');
  });
});
