import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as childProcess from 'child_process';
import {
  createAutoBranch,
  createPullRequest,
  checkPrRequirements,
  generatePrDescription,
} from '../../src/tools/pr';

// Mock dependencies
vi.mock('child_process');
vi.mock('../../src/tools/cli-utils', () => ({
  checkGitHubCli: vi.fn().mockResolvedValue({
    installed: true,
    authenticated: true,
    version: 'gh version 2.40.0',
  }),
  checkGitLabCli: vi.fn().mockResolvedValue({
    installed: true,
    authenticated: true,
    version: 'glab version 1.33.0',
  }),
  getGitHubCliInstallInstructions: vi.fn().mockReturnValue('Install gh'),
  getGitLabCliInstallInstructions: vi.fn().mockReturnValue('Install glab'),
  getGitHubAuthInstructions: vi.fn().mockReturnValue('Run gh auth login'),
  getGitLabAuthInstructions: vi.fn().mockReturnValue('Run glab auth login'),
}));

vi.mock('../../src/tools/repo-utils', () => ({
  detectRepoType: vi.fn().mockReturnValue({
    type: 'github',
    owner: 'test',
    repo: 'repo',
  }),
  findPrTemplate: vi.fn().mockReturnValue(null),
  getDefaultPrTemplate: vi.fn().mockReturnValue('## Default Template'),
  generateCadreBranchName: vi.fn((name: string) => `cadre/${name}-abc12`),
  generateRandomHash: vi.fn().mockReturnValue('abc12'),
  sanitizeFeatureName: vi.fn((name: string) => name.toLowerCase().replace(/\s+/g, '-')),
}));

describe('PR Tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createAutoBranch', () => {
    it('should create a new branch successfully', async () => {
      (childProcess.execSync as unknown as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce('  main\n  develop\n')
        .mockReturnValueOnce('');

      const result = await createAutoBranch('add-feature', '/test/path');

      expect(result.success).toBe(true);
      expect(result.branchName).toBe('cadre/add-feature-abc12');
      expect(result.message).toContain('Created and switched to branch');
    });

    it('should fail if branch already exists', async () => {
      (childProcess.execSync as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        '  main\n  cadre/add-feature-abc12\n',
      );

      const result = await createAutoBranch('add-feature', '/test/path');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Branch already exists');
    });

    it('should handle git command errors', async () => {
      (childProcess.execSync as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('git command failed');
      });

      const result = await createAutoBranch('add-feature', '/test/path');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('generatePrDescription', () => {
    it('should generate description from commits', () => {
      (childProcess.execSync as unknown as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce('feature-branch')
        .mockReturnValueOnce('abc123|||feat: add login\ndef456|||fix: bug fix')
        .mockReturnValueOnce('feature-branch')
        .mockReturnValueOnce('10\t5\tsrc/login.ts\n20\t10\tsrc/auth.ts');

      const description = generatePrDescription('main', '/test/path');

      expect(description).toContain('## Summary');
      expect(description).toContain('feat: add login');
      expect(description).toContain('fix: bug fix');
      expect(description).toContain('## Changes');
      expect(description).toContain('**Files changed:** 2');
      expect(description).toContain('**Lines added:** 30');
      expect(description).toContain('**Lines deleted:** 15');
    });

    it('should handle no commits', () => {
      (childProcess.execSync as unknown as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce('feature-branch')
        .mockReturnValueOnce('')
        .mockReturnValueOnce('feature-branch')
        .mockReturnValueOnce('');

      const description = generatePrDescription('main', '/test/path');

      expect(description).toContain('No commits found');
    });

    it('should include testing checklist', () => {
      (childProcess.execSync as unknown as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce('feature-branch')
        .mockReturnValueOnce('')
        .mockReturnValueOnce('feature-branch')
        .mockReturnValueOnce('');

      const description = generatePrDescription('main', '/test/path');

      expect(description).toContain('## Testing');
      expect(description).toContain('Tests pass locally');
      expect(description).toContain('Cadre AI');
    });
  });

  describe('checkPrRequirements', () => {
    it('should return success when GitHub CLI is ready', async () => {
      const result = await checkPrRequirements('/test/path');

      expect(result.success).toBe(true);
      expect(result.message).toContain('GitHub CLI is installed');
      expect(result.message).toContain('authenticated');
    });

    it('should return error when CLI not installed', async () => {
      const { checkGitHubCli } = await import('../../src/tools/cli-utils');
      (checkGitHubCli as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        installed: false,
        authenticated: false,
        error: 'Not installed',
      });

      const result = await checkPrRequirements('/test/path');

      expect(result.success).toBe(false);
      expect(result.message).toContain('not installed');
    });

    it('should return error when not authenticated', async () => {
      const { checkGitHubCli } = await import('../../src/tools/cli-utils');
      (checkGitHubCli as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        installed: true,
        authenticated: false,
        error: 'Not authenticated',
      });

      const result = await checkPrRequirements('/test/path');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Not authenticated');
    });
  });

  describe('createPullRequest', () => {
    it('should create GitHub PR successfully', async () => {
      // Mock git commands for PR description generation
      (childProcess.execSync as unknown as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce('main') // getBaseBranch - git config --get init.defaultBranch
        .mockReturnValueOnce('feature-branch') // getCommitsSinceBase - git rev-parse
        .mockReturnValueOnce('abc123|||feat: test commit') // getCommitsSinceBase - git log
        .mockReturnValueOnce('feature-branch') // getFileChanges - git rev-parse
        .mockReturnValueOnce('10\t5\tsrc/test.ts') // getFileChanges - git diff --numstat
        .mockReturnValueOnce('https://github.com/test/repo/pull/1\n'); // gh pr create

      const result = await createPullRequest({
        title: 'Test PR',
        cwd: '/test/path',
      });

      expect(result.success).toBe(true);
      expect(result.prUrl).toContain('github.com');
    });

    it('should use custom body if provided', async () => {
      (childProcess.execSync as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(
        'https://github.com/test/repo/pull/1\n',
      );

      await createPullRequest({
        title: 'Test PR',
        body: 'Custom body',
        cwd: '/test/path',
      });

      expect(childProcess.execSync).toHaveBeenCalledWith(
        expect.stringContaining('Custom body'),
        expect.any(Object),
      );
    });

    it('should handle PR creation errors', async () => {
      (childProcess.execSync as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('PR creation failed');
      });

      const result = await createPullRequest({
        title: 'Test PR',
        cwd: '/test/path',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle unknown repository type', async () => {
      const { detectRepoType } = await import('../../src/tools/repo-utils');
      (detectRepoType as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        type: 'unknown',
      });

      const result = await createPullRequest({
        title: 'Test PR',
        cwd: '/test/path',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Could not detect repository type');
    });
  });
});
