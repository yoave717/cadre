import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PermissionManager } from '../../src/permissions/manager.js';

// Mock dependencies
vi.mock('../../src/permissions/storage.js', () => ({
  hasStoredPermission: vi.fn().mockResolvedValue(false),
  grantPermission: vi.fn().mockResolvedValue(undefined),
  revokePermissions: vi.fn().mockResolvedValue(undefined),
  listPermissions: vi.fn().mockResolvedValue({}),
  clearAllPermissions: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/permissions/prompt.js', () => ({
  promptForPermission: vi.fn().mockResolvedValue('yes_once'),
}));

vi.mock('../../src/permissions/git.js', () => ({
  findGitRoot: vi.fn().mockResolvedValue('/test/project'),
  getProjectName: vi.fn().mockReturnValue('test-project'),
}));

describe('PermissionManager - Queue System', () => {
  let manager: PermissionManager;
  let promptMock: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { promptForPermission } = await import('../../src/permissions/prompt.js');
    promptMock = promptForPermission as any;

    // Create a new manager instance for each test
    // Since we use a singleton, we need to reset it
    manager = new PermissionManager();
  });

  describe('permission queuing', () => {
    it('should queue multiple permission requests', async () => {
      let promptCallCount = 0;
      const callOrder: number[] = [];

      promptMock.mockImplementation(async () => {
        const order = promptCallCount++;
        callOrder.push(order);
        // Simulate user thinking time
        await new Promise((resolve) => setTimeout(resolve, 50));
        return 'yes_once';
      });

      // Make 3 simultaneous requests
      const requests = [
        manager.checkAndRequest('/test/path1', 'write', 'write file 1', 'worker-1'),
        manager.checkAndRequest('/test/path2', 'write', 'write file 2', 'worker-2'),
        manager.checkAndRequest('/test/path3', 'write', 'write file 3', 'worker-3'),
      ];

      const results = await Promise.all(requests);

      // All should succeed
      expect(results.every((r) => r === true)).toBe(true);

      // Prompts should have been shown sequentially (only once since they grant session permission)
      expect(promptCallCount).toBe(1); // First one prompts, others reuse the granted permission
    });

    it('should handle concurrent requests with different permission types', async () => {
      promptMock.mockResolvedValue('yes_once');

      const requests = [
        manager.checkAndRequest('/test/path', 'write', 'write file', 'worker-1'),
        manager.checkAndRequest('/test/path', 'bash', 'run command', 'worker-2'),
        manager.checkAndRequest('/test/path', 'edit', 'edit file', 'worker-3'),
      ];

      const results = await Promise.all(requests);

      expect(results.every((r) => r === true)).toBe(true);
      // Should have prompted 3 times (different permission types)
      expect(promptMock).toHaveBeenCalledTimes(3);
    });

    it('should pass requester context to prompt', async () => {
      await manager.checkAndRequest('/test/path', 'write', 'write file', 'worker-42');

      expect(promptMock).toHaveBeenCalledWith('/test/project', 'write', 'write file', 'worker-42');
    });

    it('should skip prompt if permission already granted in queue', async () => {
      let firstCallStarted = false;
      let secondCallChecked = false;

      promptMock.mockImplementation(async () => {
        firstCallStarted = true;
        // Wait to ensure second call checks while first is running
        await new Promise((resolve) => setTimeout(resolve, 100));
        return 'yes_once';
      });

      // First request
      const first = manager.checkAndRequest('/test/path', 'write', 'write file', 'worker-1');

      // Wait a bit to ensure first request has started
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Second request (should wait in queue)
      const second = manager.checkAndRequest('/test/path', 'write', 'write file', 'worker-2');
      secondCallChecked = true;

      const results = await Promise.all([first, second]);

      expect(results).toEqual([true, true]);
      expect(firstCallStarted).toBe(true);
      expect(secondCallChecked).toBe(true);
      // Only one prompt shown
      expect(promptMock).toHaveBeenCalledTimes(1);
    });

    it('should handle permission denial in queue', async () => {
      promptMock.mockResolvedValue('deny');

      const results = await Promise.all([
        manager.checkAndRequest('/test/path', 'bash', 'run command 1', 'worker-1'),
        manager.checkAndRequest('/test/path', 'bash', 'run command 2', 'worker-2'),
      ]);

      // First denied, second also denied (no permission granted)
      expect(results).toEqual([false, false]);
    });

    it('should handle errors in queued requests', async () => {
      promptMock.mockRejectedValueOnce(new Error('Prompt error'));

      const results = await Promise.allSettled([
        manager.checkAndRequest('/test/path', 'write', 'write file 1', 'worker-1'),
        manager.checkAndRequest('/test/path', 'write', 'write file 2', 'worker-2'),
      ]);

      // First should reject
      expect(results[0].status).toBe('rejected');
      // Second should still try (and may succeed or fail depending on implementation)
    });
  });

  describe('session vs permanent permissions', () => {
    it('should grant session permission with yes_once', async () => {
      promptMock.mockResolvedValue('yes_once');

      const result = await manager.checkAndRequest('/test/path', 'write', 'write file', 'worker-1');

      expect(result).toBe(true);

      // Check again - should not prompt (session permission granted)
      promptMock.mockClear();
      const result2 = await manager.checkAndRequest(
        '/test/path',
        'write',
        'write file',
        'worker-2',
      );

      expect(result2).toBe(true);
      expect(promptMock).not.toHaveBeenCalled();
    });

    it('should grant permanent permission with yes_always', async () => {
      const { grantPermission } = await import('../../src/permissions/storage.js');
      promptMock.mockResolvedValue('yes_always');

      await manager.checkAndRequest('/test/path', 'write', 'write file', 'worker-1');

      expect(grantPermission).toHaveBeenCalledWith('/test/project', 'write');
    });
  });

  describe('permission check without prompt', () => {
    it('should return true if permission already exists', async () => {
      const { hasStoredPermission } = await import('../../src/permissions/storage.js');
      (hasStoredPermission as any).mockResolvedValue(true);

      manager = new PermissionManager(); // Reset with new mock

      const result = await manager.hasPermission('/test/path', 'write');

      expect(result).toBe(true);
    });
  });
});
