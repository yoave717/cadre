import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IndexManager } from '../../src/index-system/manager';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

describe('Indexing Performance', () => {
  let tmpDir: string;
  const FILE_COUNT = 100;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cadre-perf-'));
    // Generate files
    for (let i = 0; i < FILE_COUNT; i++) {
      await fs.writeFile(
        path.join(tmpDir, `file_${i}.ts`),
        `export const value${i} = ${i};\nexport function func${i}() { return "${i}"; }`,
      );
    }
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('should index 100 files in under 1 second', async () => {
    const manager = new IndexManager(tmpDir, { useSqlite: true });

    const start = Date.now();
    const stats = await manager.buildIndex();
    const duration = Date.now() - start;

    console.log(`Indexed ${stats.totalFiles} files in ${duration}ms`);

    expect(stats.totalFiles).toBe(FILE_COUNT);
    // 1000ms is a very generous upper bound; on my machine it was ~100ms
    // We want to catch MAJOR regressions (like 10x slower)
    expect(duration).toBeLessThan(1000);
  });
});
