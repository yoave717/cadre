import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { IndexManager } from '../../src/index-system/manager.js';
import * as fileTools from '../../src/tools/files.js';
import * as editTools from '../../src/tools/edit.js';
import * as indexTools from '../../src/tools/index.js';
import { getPermissionManager } from '../../src/permissions/manager.js';

async function runTest() {
  console.log('Starting Tool Index Synchronization Test...');

  // Mock process.cwd to point to our test directory
  const originalCwd = process.cwd();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cadre-index-sync-test-'));
  const testDir = await fs.realpath(tempDir);

  try {
    // Ensure .cadre/index directory exists
    await fs.mkdir(path.join(testDir, '.cadre', 'index'), { recursive: true });

    // Switch to test directory
    process.chdir(testDir);
    console.log(`Working in temp dir: ${testDir}`);

    // Grant permissions for test execution
    const pm = getPermissionManager();
    // We need to match the key logic. Since we changed CWD to testDir,
    // and assuming testDir is not in a git repo, projectKey should be testDir.
    // However, if testDir IS inside a git repo (e.g. if tmp is somehow inside), it might use git root.
    // To be safe, we can try to guess or just rely on CWD.
    // Actually, getProjectKey is private so we can't check it directly easily.
    // But grantSession takes projectPath.

    // Let's assume getProjectKey(testDir) == testDir because we just created it outside.
    pm.grantSession(testDir, 'write');
    pm.grantSession(testDir, 'edit');
    pm.grantSession(testDir, 'read'); // files.ts tracks readFiles, but permission check might be needed?
    // Actually files.ts doesn't check permission for read, only write/edit.

    // --- Test 1: Write File ---
    console.log('\nTesting write_file sync...');
    const filePath = 'foo.ts';
    const content = 'export class Foo { method() {} }';

    await fileTools.writeFile(filePath, content);

    // Search for symbol
    const results = await indexTools.searchSymbols('Foo');
    console.log('Search results for "Foo":\n', results);

    if (results.includes('Foo') && results.includes('class') && results.includes('foo.ts')) {
      console.log('PASS: write_file sync');
    } else {
      console.error('FAIL: write_file sync - Symbol not found or incorrect');
      process.exit(1);
    }

    // --- Test 2: Edit File ---
    console.log('\nTesting edit_file sync...');
    // Ensure file exists and is read (requirement for edit tool)
    await fileTools.readFile(filePath);

    // Rename Foo to Bar
    await editTools.editFile(filePath, 'Foo', 'Bar');

    // Search for Bar
    const resultsBar = await indexTools.searchSymbols('Bar');
    console.log('Search results for "Bar":\n', resultsBar);

    if (resultsBar.includes('Bar') && resultsBar.includes('class')) {
      console.log('PASS: edit_file sync (new symbol found)');
    } else {
      console.error('FAIL: edit_file sync - New symbol not found');
      process.exit(1);
    }

    // Search for Foo (should be gone)
    const resultsFoo = await indexTools.searchSymbols('Foo');
    console.log(
      'Search results for "Foo" (should be empty or not contain class Foo):\n',
      resultsFoo,
    );

    if (!resultsFoo.includes('class Foo')) {
      console.log('PASS: edit_file sync (old symbol removed)');
    } else {
      console.error('FAIL: edit_file sync - Old symbol still present');
      process.exit(1);
    }
  } catch (error) {
    console.error('Test failed with error:', error);
    process.exit(1);
  } finally {
    // Restore Cwd and cleanup
    process.chdir(originalCwd);
    await fs.rm(testDir, { recursive: true, force: true });
    console.log('Cleanup done.');
  }
}

runTest();
