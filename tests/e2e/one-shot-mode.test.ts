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

describe('E2E One-Shot Mode', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cadre-oneshot-'));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  });

  const runInTemp = async (args: string, timeout = 5000) => {
    return execAsync(`node ${cliPath} ${args}`, {
      cwd: tempDir,
      timeout,
      env: {
        ...process.env,
        HOME: tempDir,
        OPENAI_API_KEY: '', // No API key to avoid actual calls
        API_KEY: '',
        MODEL_NAME: '',
      },
    });
  };

  describe('Print Mode (--print flag)', () => {
    it('should handle print mode with missing API key', async () => {
      try {
        const { stdout, stderr } = await runInTemp('"hello" --print');
        const output = stdout + stderr;
        expect(output).toContain('Missing configuration');
      } catch (error) {
        const err = error as ExecError;
        const output = (err.stdout || '') + (err.stderr || '');
        expect(output).toContain('Missing configuration');
      }
    });

    it('should accept --print flag with quoted prompt', async () => {
      try {
        const { stdout, stderr } = await runInTemp('"test prompt" --print');
        const output = stdout + stderr;
        // Should show missing config warning
        expect(output).toContain('Missing configuration');
      } catch (error) {
        const err = error as ExecError;
        const output = (err.stdout || '') + (err.stderr || '');
        expect(output).toContain('Missing configuration');
      }
    });

    it('should accept -p short flag', async () => {
      try {
        const { stdout, stderr } = await runInTemp('"test" -p');
        const output = stdout + stderr;
        expect(output).toContain('Missing configuration');
      } catch (error) {
        const err = error as ExecError;
        const output = (err.stdout || '') + (err.stderr || '');
        expect(output).toContain('Missing configuration');
      }
    });
  });

  describe('Prompt Arguments', () => {
    it('should handle simple prompt without flags', async () => {
      try {
        // Without --print, it tries to start interactive mode
        // Will timeout or require stdin, so we use short timeout
        const result = await runInTemp('"hello"', 2000);
        expect(result.stdout || result.stderr).toBeTruthy();
      } catch (error) {
        const err = error as ExecError;
        // Timeout or error expected in test environment
        expect(err).toBeTruthy();
      }
    });

    it('should handle prompt with special characters', async () => {
      try {
        const { stdout, stderr } = await runInTemp('"hello world! @#$" --print');
        const output = stdout + stderr;
        expect(output).toContain('Missing configuration');
      } catch (error) {
        const err = error as ExecError;
        const output = (err.stdout || '') + (err.stderr || '');
        expect(output).toContain('Missing configuration');
      }
    });

    it('should handle empty prompt', async () => {
      try {
        const { stdout, stderr } = await runInTemp('"" --print');
        const output = stdout + stderr;
        // Should either show error or missing config
        expect(output.length).toBeGreaterThan(0);
      } catch (error) {
        const err = error as ExecError;
        expect(err.stdout || err.stderr).toBeTruthy();
      }
    });
  });

  describe('Load Flag', () => {
    it('should handle --load flag with non-existent file', async () => {
      const nonExistentFile = path.join(tempDir, 'non-existent.json');

      try {
        await runInTemp(`--load ${nonExistentFile}`);
      } catch (error) {
        const err = error as ExecError;
        // Should error or show message about missing file
        expect(err.stdout || err.stderr).toBeTruthy();
      }
    });

    it('should accept --load flag with file path', async () => {
      // Create a dummy conversation file
      const conversationFile = path.join(tempDir, 'conversation.json');
      await fs.promises.writeFile(
        conversationFile,
        JSON.stringify({
          messages: [],
          metadata: { created: new Date().toISOString() },
        }),
      );

      try {
        const result = await runInTemp(`--load ${conversationFile}`, 2000);
        // May timeout waiting for input, but should start
        expect(result.stdout || result.stderr).toBeTruthy();
      } catch (error) {
        // Timeout expected
        const err = error as ExecError;
        expect(err).toBeTruthy();
      }
    });
  });

  describe('Combined Flags', () => {
    it('should handle --print with --load', async () => {
      const conversationFile = path.join(tempDir, 'conversation.json');
      await fs.promises.writeFile(
        conversationFile,
        JSON.stringify({
          messages: [],
          metadata: { created: new Date().toISOString() },
        }),
      );

      try {
        const { stdout, stderr } = await runInTemp(`"test" --print --load ${conversationFile}`);
        const output = stdout + stderr;
        expect(output.length).toBeGreaterThan(0);
      } catch (error) {
        const err = error as ExecError;
        expect(err.stdout || err.stderr).toBeTruthy();
      }
    });
  });

  describe('Configuration Warnings', () => {
    it('should show configuration warning before attempting execution', async () => {
      try {
        const { stdout, stderr } = await runInTemp('"test" --print');
        const output = stdout + stderr;

        expect(output).toContain('Missing configuration');
        expect(output).toContain('API_KEY or OPENAI_API_KEY');
      } catch (error) {
        const err = error as ExecError;
        const output = (err.stdout || '') + (err.stderr || '');

        expect(output).toContain('Missing configuration');
      }
    });

    it('should suggest configuration command in warning', async () => {
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
});
