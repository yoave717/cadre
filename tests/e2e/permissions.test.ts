import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { exec } from 'child_process';
import path from 'path';
import util from 'util';
import fs from 'fs';
import os from 'os';

const execAsync = util.promisify(exec);
const cliPath = path.resolve(__dirname, '../../dist/index.js');

interface ExecError extends Error {
  stdout?: string;
  stderr?: string;
}

describe('E2E Permissions System', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cadre-perms-'));
    // Clear permissions before each test
    await execAsync(`node ${cliPath} permissions clear`).catch(() => {
      // Ignore error if no permissions to clear
    });
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
    // Clean up permissions after test
    await execAsync(`node ${cliPath} permissions clear`).catch(() => {
      // Ignore error
    });
  });

  describe('List Permissions', () => {
    it('should show no permissions when none are granted', async () => {
      const { stdout } = await execAsync(`node ${cliPath} permissions list`);
      expect(stdout).toContain('No permissions granted yet');
    });

    it('should list permissions using default action (no argument)', async () => {
      const { stdout } = await execAsync(`node ${cliPath} permissions`);
      expect(stdout).toContain('No permissions granted yet');
    });
  });

  describe('Clear Permissions', () => {
    it('should clear all permissions', async () => {
      const { stdout } = await execAsync(`node ${cliPath} permissions clear`);
      expect(stdout).toContain('All permissions cleared');
    });

    it('should accept reset as alias for clear', async () => {
      const { stdout } = await execAsync(`node ${cliPath} permissions reset`);
      expect(stdout).toContain('All permissions cleared');
    });
  });

  describe('Revoke Permissions', () => {
    it('should revoke permissions for specific path', async () => {
      const testPath = '/test/project/path';
      const { stdout } = await execAsync(`node ${cliPath} permissions revoke ${testPath}`);
      expect(stdout).toContain('Permissions revoked for:');
      expect(stdout).toContain(testPath);
    });

    it('should handle revoking permissions for non-existent path gracefully', async () => {
      const nonExistentPath = '/non/existent/path';
      try {
        const { stdout } = await execAsync(`node ${cliPath} permissions revoke ${nonExistentPath}`);
        expect(stdout).toContain('Permissions revoked for:');
        expect(stdout).toContain(nonExistentPath);
      } catch (error) {
        // Should not throw error
        throw new Error(`Should handle non-existent path: ${(error as ExecError).message}`);
      }
    });
  });

  describe('Invalid Permission Commands', () => {
    it('should show usage for invalid action', async () => {
      try {
        await execAsync(`node ${cliPath} permissions invalid-action`);
      } catch (error) {
        const err = error as ExecError;
        const output = err.stdout || err.stderr || '';
        expect(output).toContain('Usage: cadre permissions');
      }
    });

    it('should show usage when revoke is called without path', async () => {
      try {
        await execAsync(`node ${cliPath} permissions revoke`);
      } catch (error) {
        const err = error as ExecError;
        const output = err.stdout || err.stderr || '';
        expect(output).toContain('Usage: cadre permissions');
      }
    });
  });

  describe('Permission Storage', () => {
    it('should persist permissions across list commands', async () => {
      // This test verifies that the permission system can be queried multiple times
      await execAsync(`node ${cliPath} permissions clear`);

      const { stdout: firstList } = await execAsync(`node ${cliPath} permissions list`);
      expect(firstList).toContain('No permissions granted yet');

      const { stdout: secondList } = await execAsync(`node ${cliPath} permissions list`);
      expect(secondList).toContain('No permissions granted yet');
    });
  });
});
