import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import * as fileTools from '../../src/tools/files.js';
import * as indexTools from '../../src/tools/index.js';
import { getPermissionManager } from '../../src/permissions/manager.js';

async function runTest() {
  console.log('Starting Smart ReadFile Test...');

  // Mock process.cwd to point to our test directory
  const originalCwd = process.cwd();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cadre-smart-read-test-'));
  const testDir = await fs.realpath(tempDir);

  try {
    // Ensure .cadre/index directory exists
    await fs.mkdir(path.join(testDir, '.cadre', 'index'), { recursive: true });

    // Switch to test directory
    process.chdir(testDir);
    console.log(`Working in temp dir: ${testDir}`);

    // Grant permissions
    const pm = getPermissionManager();
    pm.grantSession(testDir, 'write');
    pm.grantSession(testDir, 'read');

    // Create file structure
    // src/unique.ts
    // src/a/common.ts
    // src/b/common.ts
    await fs.mkdir('src/a', { recursive: true });
    await fs.mkdir('src/b', { recursive: true });

    await fs.writeFile('src/unique.ts', 'unique content');
    await fs.writeFile('src/a/common.ts', 'common a');
    await fs.writeFile('src/b/common.ts', 'common b');

    // Build index
    console.log('Building index...');
    await indexTools.buildIndex(testDir);

    // Case 1: Unique resolution
    console.log('\n--- Case 1: Unique Resolution ---');
    const res1 = await fileTools.readFile('unique.ts');
    console.log('Result for unique.ts:\n', res1);

    if (res1.includes('Auto-resolved to src/unique.ts') && res1.includes('unique content')) {
      console.log('PASS: Auto-resolved unique file');
    } else {
      console.error('FAIL: Did not auto-resolve unique file');
      process.exit(1);
    }

    // Case 2: Ambiguous resolution
    console.log('\n--- Case 2: Ambiguous Resolution ---');
    const res2 = await fileTools.readFile('common.ts');
    console.log('Result for common.ts:\n', res2);

    if (
      res2.includes('Did you mean one of these?') &&
      res2.includes('src/a/common.ts') &&
      res2.includes('src/b/common.ts')
    ) {
      console.log('PASS: Suggested candidates for ambiguous file');
    } else {
      console.error('FAIL: Did not suggest candidates');
      process.exit(1);
    }

    // Case 3: Non-existent
    console.log('\n--- Case 3: Non-existent ---');
    const res3 = await fileTools.readFile('ghost.ts');
    console.log('Result for ghost.ts:\n', res3);

    if (res3.includes('Error reading file') && res3.includes('ENOENT')) {
      console.log('PASS: Failed correctly for non-existent file');
    } else {
      console.error('FAIL: Unexpected behavior for non-existent file');
      process.exit(1);
    }
  } catch (error) {
    console.error('Test failed with error:', error);
    process.exit(1);
  } finally {
    process.chdir(originalCwd);
    await fs.rm(testDir, { recursive: true, force: true });
    console.log('Cleanup done.');
  }
}

runTest();
