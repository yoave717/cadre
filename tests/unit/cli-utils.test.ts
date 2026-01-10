import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as childProcess from 'child_process';
import {
  checkGitHubCli,
  checkGitLabCli,
  getGitHubCliInstallInstructions,
  getGitLabCliInstallInstructions,
  getGitHubAuthInstructions,
  getGitLabAuthInstructions,
} from '../../src/tools/cli-utils';

// Mock child_process
vi.mock('child_process');

describe('CLI Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkGitHubCli', () => {
    it('should return installed and authenticated when gh is available and authenticated', async () => {
      (childProcess.execSync as unknown as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce('gh version 2.40.0 (2024-01-01)\n')
        .mockReturnValueOnce('');

      const result = await checkGitHubCli();

      expect(result.installed).toBe(true);
      expect(result.authenticated).toBe(true);
      expect(result.version).toBe('gh version 2.40.0 (2024-01-01)');
    });

    it('should return installed but not authenticated when gh auth fails', async () => {
      (childProcess.execSync as unknown as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce('gh version 2.40.0 (2024-01-01)\n')
        .mockImplementationOnce(() => {
          throw new Error('Not authenticated');
        });

      const result = await checkGitHubCli();

      expect(result.installed).toBe(true);
      expect(result.authenticated).toBe(false);
      expect(result.error).toBe('Not authenticated');
    });

    it('should return not installed when gh command not found', async () => {
      (childProcess.execSync as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        throw new Error('command not found');
      });

      const result = await checkGitHubCli();

      expect(result.installed).toBe(false);
      expect(result.authenticated).toBe(false);
      expect(result.error).toBe('GitHub CLI (gh) not found');
    });
  });

  describe('checkGitLabCli', () => {
    it('should return installed and authenticated when glab is available and authenticated', async () => {
      (childProcess.execSync as unknown as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce('glab version 1.33.0 (2024-01-01)\n')
        .mockReturnValueOnce('');

      const result = await checkGitLabCli();

      expect(result.installed).toBe(true);
      expect(result.authenticated).toBe(true);
      expect(result.version).toBe('glab version 1.33.0 (2024-01-01)');
    });

    it('should return installed but not authenticated when glab auth fails', async () => {
      (childProcess.execSync as unknown as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce('glab version 1.33.0 (2024-01-01)\n')
        .mockImplementationOnce(() => {
          throw new Error('Not authenticated');
        });

      const result = await checkGitLabCli();

      expect(result.installed).toBe(false);
      expect(result.authenticated).toBe(false);
      expect(result.error).toBe('Not authenticated');
    });

    it('should return not installed when glab command not found', async () => {
      (childProcess.execSync as unknown as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        throw new Error('command not found');
      });

      const result = await checkGitLabCli();

      expect(result.installed).toBe(false);
      expect(result.authenticated).toBe(false);
      expect(result.error).toBe('GitLab CLI (glab) not found');
    });
  });

  describe('Installation Instructions', () => {
    it('should provide GitHub CLI installation instructions', () => {
      const instructions = getGitHubCliInstallInstructions();
      expect(instructions).toContain('GitHub CLI');
      expect(instructions.length).toBeGreaterThan(0);
    });

    it('should provide GitLab CLI installation instructions', () => {
      const instructions = getGitLabCliInstallInstructions();
      expect(instructions).toContain('GitLab CLI');
      expect(instructions.length).toBeGreaterThan(0);
    });

    it('should provide GitHub authentication instructions', () => {
      const instructions = getGitHubAuthInstructions();
      expect(instructions).toContain('gh auth login');
    });

    it('should provide GitLab authentication instructions', () => {
      const instructions = getGitLabAuthInstructions();
      expect(instructions).toContain('glab auth login');
    });
  });
});
