import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as run from '../../src/tools/run';
import { exec, spawn } from 'child_process';
import { EventEmitter } from 'events';

vi.mock('child_process', () => ({
  exec: vi.fn(),
  spawn: vi.fn(),
}));
vi.mock('../../src/permissions/index.js', () => ({
  getPermissionManager: () => ({
    checkAndRequest: vi.fn().mockResolvedValue(true),
  }),
}));

describe('Run Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('runCommand', () => {
    it('should block dangerous commands', async () => {
      const result = await run.runCommand('rm -rf /');
      expect(result).toContain('blocked for safety reasons');
    });

    it('should execute valid commands', async () => {
        (exec as any).mockImplementation((cmd: string, options: any, callback: any) => {
            callback(null, { stdout: 'output', stderr: '' });
        });

        const result = await run.runCommand('ls -la');
        expect(result).toContain('stdout:\noutput');
    });

    it('should handle execution errors', async () => {
        (exec as any).mockImplementation((cmd: string, options: any, callback: any) => {
            const error: any = new Error('Command failed');
            error.stderr = 'error output';
            callback(error, { stdout: '', stderr: 'error output' });
        });

        const result = await run.runCommand('invalid_command');
        expect(result).toContain('Error running command');
        expect(result).toContain('error output');
    });
  });

  describe('runCommandStream', () => {
      it('should block dangerous commands', async () => {
          const result = await run.runCommandStream('rm -rf /');
          expect(result).toContain('blocked');
        });

      it('should stream output', async () => {
          const mockChild = new EventEmitter() as any;
          mockChild.stdout = new EventEmitter();
          mockChild.stderr = new EventEmitter();
          mockChild.kill = vi.fn();
          
          (spawn as any).mockReturnValue(mockChild);

          const outputPromise = run.runCommandStream('long_running_cmd');
          
          // Wait a tick to ensure listeners are attached
          await new Promise(resolve => setTimeout(resolve, 0));

          // Emit events
          mockChild.stdout.emit('data', 'chunk1');
          mockChild.stdout.emit('data', 'chunk2');
          mockChild.emit('close', 0);

          const result = await outputPromise;
          expect(result).toContain('chunk1chunk2');
      });
  });
});
