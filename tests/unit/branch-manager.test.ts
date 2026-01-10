import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import { BranchManager } from '../../src/context/branch-manager';

const TEST_DIR = '.ai/test-branches';

describe('BranchManager', () => {
  let manager: BranchManager;

  beforeEach(async () => {
    manager = new BranchManager(TEST_DIR);
    if (fs.existsSync(TEST_DIR)) {
      await fs.promises.rm(TEST_DIR, { recursive: true, force: true });
    }
  });

  afterEach(async () => {
    if (fs.existsSync(TEST_DIR)) {
      await fs.promises.rm(TEST_DIR, { recursive: true, force: true });
    }
  });

  it('should validate branch names correctly', () => {
    expect(manager.validateName('valid-name')).toBe(true);
    expect(manager.validateName('valid123')).toBe(true);
    expect(manager.validateName('Invalid Name')).toBe(false); // Spaces not allowed
    expect(manager.validateName('invalid/name')).toBe(false); // Slashes not allowed
    expect(manager.validateName('')).toBe(false);
    expect(manager.validateName('a'.repeat(51))).toBe(false); // Too long
  });

  it('should create a new branch', async () => {
    const history = [{ role: 'user', content: 'hello', timestamp: 123 }];
    await manager.createBranch('test-branch', history as any);

    const branches = await manager.listBranches();
    expect(branches).toHaveLength(1);
    expect(branches[0].name).toBe('test-branch');
    expect(branches[0].messageCount).toBe(1);
  });

  it('should prevent creating duplicate branches', async () => {
    const history = [{ role: 'user', content: 'hello', timestamp: 123 }];
    await manager.createBranch('test-branch', history as any);

    await expect(manager.createBranch('test-branch', history as any)).rejects.toThrow(
      "Branch 'test-branch' already exists.",
    );
  });

  it('should load an existing branch', async () => {
    const history = [{ role: 'user', content: 'hello', timestamp: 123 }];
    await manager.createBranch('test-branch', history as any);

    const loaded = await manager.loadBranch('test-branch');
    expect(loaded).toHaveLength(1);
    expect(loaded[0].content).toBe('hello');
  });

  it('should update an existing branch via saveBranch', async () => {
    const history = [{ role: 'user', content: 'hello', timestamp: 123 }];
    await manager.createBranch('test-branch', history as any);

    // Update
    const newHistory = [...history, { role: 'assistant', content: 'hi', timestamp: 124 }];
    await manager.saveBranch('test-branch', newHistory as any);

    const loaded = await manager.loadBranch('test-branch');
    expect(loaded).toHaveLength(2);

    // Check timestamps in list logic
    const branches = await manager.listBranches();
    expect(branches[0].lastModified).toBeGreaterThanOrEqual(branches[0].created);
  });

  it('should delete a branch', async () => {
    const history = [{ role: 'user', content: 'hello', timestamp: 123 }];
    await manager.createBranch('test-branch', history as any);

    await manager.deleteBranch('test-branch');

    const branches = await manager.listBranches();
    expect(branches).toHaveLength(0);
  });

  it('should enforce 10 branch limit', async () => {
    const history = [{ role: 'user', content: 'hello', timestamp: 123 }];

    // Create 10 branches
    for (let i = 0; i < 10; i++) {
      await manager.createBranch(`branch-${i}`, history as any);
    }

    await expect(manager.createBranch('branch-11', history as any)).rejects.toThrow(
      'Branch limit reached (10)',
    );
  });

  it('should check if branch exists', async () => {
    const history = [{ role: 'user', content: 'hello', timestamp: 123 }];
    await manager.createBranch('test-branch', history as any);

    expect(manager.branchExists('test-branch')).toBe(true);
    expect(manager.branchExists('nonexistent')).toBe(false);
  });

  it('should checkout to an existing branch', async () => {
    const historyA = [
      { role: 'user', content: 'message A1', timestamp: 1 },
      { role: 'assistant', content: 'response A1', timestamp: 2 },
    ];
    const historyB = [
      { role: 'user', content: 'message B1', timestamp: 1 },
      { role: 'assistant', content: 'response B1', timestamp: 2 },
    ];

    await manager.createBranch('branch-a', historyA as any);
    await manager.createBranch('branch-b', historyB as any);

    // Checkout from A to B
    const loadedHistory = await manager.checkout('branch-b', 'branch-a', historyA as any);

    expect(loadedHistory).toHaveLength(2);
    expect(loadedHistory[0].content).toBe('message B1');
    expect(loadedHistory[1].content).toBe('response B1');
  });

  it('should throw error when checking out non-existent branch', async () => {
    const history = [{ role: 'user', content: 'hello', timestamp: 123 }];
    await manager.createBranch('existing', history as any);

    await expect(manager.checkout('nonexistent', 'existing', history as any)).rejects.toThrow(
      "Branch 'nonexistent' not found.",
    );
  });

  it('should auto-save current branch before checkout', async () => {
    const historyA = [{ role: 'user', content: 'original A', timestamp: 1 }];
    const historyB = [{ role: 'user', content: 'original B', timestamp: 2 }];

    await manager.createBranch('branch-a', historyA as any);
    await manager.createBranch('branch-b', historyB as any);

    // Modify history A and checkout to B
    const modifiedHistoryA = [
      ...historyA,
      { role: 'assistant', content: 'new message', timestamp: 3 },
    ];

    await manager.checkout('branch-b', 'branch-a', modifiedHistoryA as any);

    // Load branch A again and verify it was saved
    const loadedA = await manager.loadBranch('branch-a');
    expect(loadedA).toHaveLength(2);
    expect(loadedA[1].content).toBe('new message');
  });

  it('should complete checkout in under 100ms', async () => {
    // Create branch with moderate history
    const history = Array.from({ length: 50 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i}`,
      timestamp: i,
    }));

    await manager.createBranch('branch-a', history as any);
    await manager.createBranch('branch-b', history as any);

    const startTime = Date.now();
    await manager.checkout('branch-b', 'branch-a', history as any);
    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(100);
  });
});
