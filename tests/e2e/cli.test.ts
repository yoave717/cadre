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

describe('E2E CLI', () => {
  it('should show help information', async () => {
    // We use node to run the built JS file
    // Ensure "npm run build" is run before this, or we run ts-node if we want to test source
    // But testing the built artifact is better for E2E.
    // For this test environment, let's assume valid dist or use ts-node for reliability in dev

    // Using ts-node to run directly from source for dev speed if dist might be stale
    // const command = `npx ts-node ${path.resolve(__dirname, '../../src/index.ts')} --help`;

    // Ideally we test the distribution. Let's try running the build script first, or assume user flow.
    // The instructions said "E2E tests will execute the build CLI command".

    // Let's rely on the build.
    const command = `node ${cliPath} --help`;

    try {
      const { stdout } = await execAsync(command);
      expect(stdout).toContain('Usage: cadre');
      expect(stdout).toContain('Options:');
    } catch (error) {
      const err = error as ExecError;
      // If dist doesn't exist, we might fail.
      // We can try to build or just fail and tell user.
      // But for robust implementation, let's fallback or just assert failure message if it's a "not found" issue.
      // Actually, let's just assert on the error if it fails, which will show us why.
      throw new Error(`CLI execution failed: ${err.message}`);
    }
  });

  it('should show version', async () => {
    const command = `node ${cliPath} --version`;
    try {
      const { stdout } = await execAsync(command);
      // Version is 1.0.0 in package.json
      expect(stdout).toContain('1.0.0');
    } catch (error) {
      const err = error as ExecError;
      throw new Error(`CLI execution failed: ${err.message}`);
    }
  });

  describe('Config Command', () => {
    let tempDir: string;

    // Create a fresh temp dir for each test to ensure isolation
    // and avoid interference from project .env or user's ~/.cadre/.env
    beforeEach(async () => {
      tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cadre-e2e-'));
    });

    afterEach(async () => {
      if (tempDir) {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      }
    });

    // Helper to run CLI in the temp environment
    const runInTemp = async (args: string) => {
      return execAsync(`node ${cliPath} ${args}`, {
        cwd: tempDir,
        env: {
          ...process.env,
          HOME: tempDir, // Mask real home
          // Unset vars that might affect config
          OPENAI_API_KEY: '',
          API_KEY: '',
          MODEL_NAME: '',
          OPENAI_BASE_URL: '', // Ensure we don't pick up anything
        },
      });
    };

    it('should set and show configuration', { timeout: 30000 }, async () => {
      // Set config
      await runInTemp('config --key test-key --set-model test-model --url https://api.example.com');

      // Show config
      const { stdout } = await runInTemp('config --show');

      expect(stdout).toContain('Model:    test-model');
      expect(stdout).toContain('Endpoint: https://api.example.com');
      // Key is masked in output
      expect(stdout).toContain('API Key:  ****-key');
    });

    it('should reset configuration', { timeout: 30000 }, async () => {
      // Set something first
      await runInTemp('config --key test-key');

      // Reset
      const { stdout } = await runInTemp('reset');
      expect(stdout).toContain('Configuration reset to defaults.');

      // Verify it's back to default/empty (default model is gpt-4o)
      const { stdout: showOut } = await runInTemp('config --show');
      expect(showOut).toContain('Model:    gpt-4o');
      expect(showOut).toContain('API Key:  Not set');
    });
  });

  describe('Permissions Command', () => {
    it('should list permissions (empty state)', async () => {
      // We can't easily grant permissions via CLI in non-interactive mode without running a prompt that asks for them.
      // So we primarily test the list command returns successfully.
      // Ensure we clear permissions first
      await execAsync(`node ${cliPath} permissions clear`);

      const { stdout } = await execAsync(`node ${cliPath} permissions list`);
      expect(stdout).toContain('No permissions granted yet');
    });
  });

  describe('Validation', () => {
    it('should warn on missing configuration', async () => {
      // Use temp dir for this too to avoid picking up local .env
      const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cadre-e2e-val-'));

      const command = `node ${cliPath} "hello" --print`;
      try {
        const { stdout } = await execAsync(command, {
          cwd: tempDir,
          env: {
            ...process.env,
            HOME: tempDir,
            OPENAI_API_KEY: '',
            API_KEY: '',
            MODEL_NAME: '',
          },
        });
        expect(stdout).toContain('Missing configuration: API_KEY or OPENAI_API_KEY');
      } catch (error) {
        const err = error as ExecError;
        const output = err.stdout || '';
        expect(output).toContain('Missing configuration: API_KEY or OPENAI_API_KEY');
      } finally {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      }
    });
  });
});
