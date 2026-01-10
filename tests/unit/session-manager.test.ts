import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import { SessionManager } from '../../src/context/session-manager';

const TEST_DIR = '.ai/test-session';

describe('SessionManager', () => {
  let manager: SessionManager;

  beforeEach(async () => {
    manager = new SessionManager(TEST_DIR);
    if (fs.existsSync(TEST_DIR)) {
      await fs.promises.rm(TEST_DIR, { recursive: true, force: true });
    }
  });

  afterEach(async () => {
    if (fs.existsSync(TEST_DIR)) {
      await fs.promises.rm(TEST_DIR, { recursive: true, force: true });
    }
  });

  it('should return null when no session file exists', async () => {
    const lastBranch = await manager.getLastBranch();
    expect(lastBranch).toBeNull();
  });

  it('should save and load last branch', async () => {
    await manager.setLastBranch('test-branch');
    const lastBranch = await manager.getLastBranch();
    expect(lastBranch).toBe('test-branch');
  });

  it('should handle null branch', async () => {
    await manager.setLastBranch('some-branch');
    await manager.setLastBranch(null);
    const lastBranch = await manager.getLastBranch();
    expect(lastBranch).toBeNull();
  });

  it('should persist branch across multiple instances', async () => {
    await manager.setLastBranch('persistent-branch');

    // Create new manager instance
    const manager2 = new SessionManager(TEST_DIR);
    const lastBranch = await manager2.getLastBranch();
    expect(lastBranch).toBe('persistent-branch');
  });

  it('should handle corrupted session file gracefully', async () => {
    // Create manager and session directory
    await manager.setLastBranch('test');

    // Corrupt the session file
    const sessionPath = `${TEST_DIR}/session.json`;
    await fs.promises.writeFile(sessionPath, '{ invalid json', 'utf-8');

    // Should return null on error
    const lastBranch = await manager.getLastBranch();
    expect(lastBranch).toBeNull();
  });
});
