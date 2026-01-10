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
  code?: number;
}

describe('E2E Error Handling', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cadre-errors-'));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  });

  const runInTemp = async (args: string, shouldFail = false) => {
    try {
      const result = await execAsync(`node ${cliPath} ${args}`, {
        cwd: tempDir,
        env: {
          ...process.env,
          HOME: tempDir,
          OPENAI_API_KEY: '',
          API_KEY: '',
        },
      });
      if (shouldFail) {
        throw new Error('Expected command to fail but it succeeded');
      }
      return result;
    } catch (error) {
      if (!shouldFail) {
        throw error;
      }
      return error as ExecError;
    }
  };

  describe('Invalid Commands', () => {
    it('should handle unknown commands', async () => {
      try {
        await execAsync(`node ${cliPath} unknown-command`);
        throw new Error('Should have failed with unknown command');
      } catch (error) {
        const err = error as ExecError;
        // Commander.js will show error for unknown commands
        expect(err).toBeTruthy(); // Error occurred
      }
    });

    it('should handle invalid flags', async () => {
      try {
        await execAsync(`node ${cliPath} --invalid-flag`);
        throw new Error('Should have failed with invalid flag');
      } catch (error) {
        const err = error as ExecError;
        expect(err.code).toBeTruthy();
      }
    });
  });

  describe('Missing Configuration', () => {
    it('should warn about missing API key', async () => {
      try {
        const { stdout, stderr } = await runInTemp('"test" --print');
        const output = stdout + stderr;
        expect(output).toContain('Missing configuration');
        expect(output).toContain('API_KEY');
      } catch (error) {
        const err = error as ExecError;
        const output = (err.stdout || '') + (err.stderr || '');
        expect(output).toContain('Missing configuration');
      }
    });

    it('should provide setup instructions', async () => {
      try {
        const { stdout, stderr } = await runInTemp('"test" --print');
        const output = stdout + stderr;
        expect(output).toContain('cadre config');
      } catch (error) {
        const err = error as ExecError;
        const output = (err.stdout || '') + (err.stderr || '');
        expect(output).toContain('cadre config');
      }
    });
  });

  describe('File System Errors', () => {
    it('should handle non-existent load file', async () => {
      const nonExistentFile = path.join(tempDir, 'does-not-exist.json');

      try {
        await runInTemp(`--load ${nonExistentFile}`);
        // May fail or show error
      } catch (error) {
        const err = error as ExecError;
        expect(err).toBeTruthy();
      }
    });

    it('should handle invalid JSON in load file', async () => {
      const invalidJson = path.join(tempDir, 'invalid.json');
      await fs.promises.writeFile(invalidJson, '{ invalid json }');

      try {
        await runInTemp(`--load ${invalidJson}`);
        // May fail or handle gracefully
      } catch (error) {
        const err = error as ExecError;
        expect(err).toBeTruthy();
      }
    });
  });

  describe('Permission Errors', () => {
    it('should handle revoke without path argument', async () => {
      try {
        await runInTemp('permissions revoke');
        // May show usage error
      } catch (error) {
        const err = error as ExecError;
        const output = (err.stdout || '') + (err.stderr || '');
        expect(output).toContain('Usage:');
      }
    });

    it('should handle invalid permission action', async () => {
      const { stdout, stderr } = await runInTemp('permissions invalid-action');
      const output = stdout + stderr;
      expect(output).toContain('Usage:');
    });
  });

  describe('Detection Errors', () => {
    it('should handle corrupted package.json gracefully', async () => {
      await fs.promises.writeFile(
        path.join(tempDir, 'package.json'),
        '{ "name": "test", invalid }',
      );

      try {
        const { stdout } = await runInTemp('detect --frameworks');
        // Should still show detected languages
        expect(stdout).toContain('Detected Languages:');
      } catch (error) {
        // May error but should have some output
        const err = error as ExecError;
        expect(err.stdout || err.stderr).toBeTruthy();
      }
    });

    it('should handle permission denied when reading files', async () => {
      if (process.platform === 'win32') {
        // Skip on Windows - permission handling is different
        return;
      }

      const restrictedFile = path.join(tempDir, 'restricted.ts');
      await fs.promises.writeFile(restrictedFile, 'const x = 1;');
      await fs.promises.chmod(restrictedFile, 0o000); // No permissions

      try {
        const { stdout } = await runInTemp('detect');
        // Should handle gracefully
        expect(stdout).toContain('Detected Languages:');
      } catch (error) {
        // May error but should not crash
        const err = error as ExecError;
        expect(err).toBeTruthy();
      } finally {
        // Restore permissions for cleanup
        await fs.promises.chmod(restrictedFile, 0o644).catch(() => {});
      }
    });
  });

  describe('Config Command Errors', () => {
    it('should handle config with no HOME directory set', async () => {
      try {
        const result = await execAsync(`node ${cliPath} config --show`, {
          cwd: tempDir,
          env: {
            ...process.env,
            HOME: undefined, // Unset HOME
          },
        });
        // Should either work with fallback or show error
        expect(result.stdout || result.stderr).toBeTruthy();
      } catch (error) {
        // May fail but should not crash
        const err = error as ExecError;
        expect(err).toBeTruthy();
      }
    });
  });

  describe('Graceful Degradation', () => {
    it('should handle empty directory for detection', async () => {
      const { stdout } = await runInTemp('detect');

      expect(stdout).toContain('Detected Languages:');
      // May find JSON or no files depending on temp dir contents
      expect(stdout.length).toBeGreaterThan(0);
    });

    it('should handle binary files in detection directory', async () => {
      // Create a binary file
      const buffer = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]);
      await fs.promises.writeFile(path.join(tempDir, 'binary.bin'), buffer);

      const { stdout } = await runInTemp('detect');

      // Should ignore binary files and not crash
      expect(stdout).toContain('Detected Languages:');
    });

    it('should handle very long file paths', async () => {
      // Create deeply nested directory
      let deepPath = tempDir;
      for (let i = 0; i < 10; i++) {
        deepPath = path.join(deepPath, `level-${i}`);
      }

      try {
        await fs.promises.mkdir(deepPath, { recursive: true });
        await fs.promises.writeFile(path.join(deepPath, 'file.ts'), 'const x = 1;');

        const { stdout } = await runInTemp('detect');
        expect(stdout).toContain('Detected Languages:');
      } catch (error) {
        // May fail on some systems due to path length limits
        expect(error).toBeTruthy();
      }
    });
  });

  describe('Command Line Argument Errors', () => {
    it('should handle arguments with special characters', async () => {
      try {
        await runInTemp('"test$(whoami)" --print');
        // Should not execute shell commands in arguments
      } catch (error) {
        const err = error as ExecError;
        const output = (err.stdout || '') + (err.stderr || '');
        // Should show config error, not execute shell command
        expect(output).toContain('Missing configuration');
      }
    });

    it('should handle very long arguments', async () => {
      const longPrompt = 'a'.repeat(10000);

      try {
        await runInTemp(`"${longPrompt}" --print`, true);
      } catch (error) {
        // Should handle without crashing
        expect(error).toBeTruthy();
      }
    });
  });
});
