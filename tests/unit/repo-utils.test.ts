import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as childProcess from 'child_process';
import * as fs from 'fs';
import {
  detectRepoType,
  findPrTemplate,
  getDefaultPrTemplate,
  generateRandomHash,
  sanitizeFeatureName,
  generateCadreBranchName,
} from '../../src/tools/repo-utils';

// Mock dependencies
vi.mock('child_process');
vi.mock('fs');

describe('Repo Utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('detectRepoType', () => {
    it('should detect GitHub SSH repository', () => {
      (childProcess.execSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        'git@github.com:owner/repo.git',
      );

      const result = detectRepoType('/test/path');

      expect(result.type).toBe('github');
      expect(result.owner).toBe('owner');
      expect(result.repo).toBe('repo');
    });

    it('should detect GitHub HTTPS repository', () => {
      (childProcess.execSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        'https://github.com/owner/repo.git',
      );

      const result = detectRepoType('/test/path');

      expect(result.type).toBe('github');
      expect(result.owner).toBe('owner');
      expect(result.repo).toBe('repo');
    });

    it('should detect GitLab SSH repository', () => {
      (childProcess.execSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        'git@gitlab.com:owner/repo.git',
      );

      const result = detectRepoType('/test/path');

      expect(result.type).toBe('gitlab');
      expect(result.owner).toBe('owner');
      expect(result.repo).toBe('repo');
    });

    it('should detect GitLab HTTPS repository', () => {
      (childProcess.execSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        'https://gitlab.com/owner/repo.git',
      );

      const result = detectRepoType('/test/path');

      expect(result.type).toBe('gitlab');
      expect(result.owner).toBe('owner');
      expect(result.repo).toBe('repo');
    });

    it('should detect self-hosted GitLab', () => {
      (childProcess.execSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        'https://gitlab.company.com/owner/repo.git',
      );

      const result = detectRepoType('/test/path');

      expect(result.type).toBe('gitlab');
    });

    it('should return unknown for unrecognized remotes', () => {
      (childProcess.execSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        'https://bitbucket.org/owner/repo.git',
      );

      const result = detectRepoType('/test/path');

      expect(result.type).toBe('unknown');
    });

    it('should handle git command errors', () => {
      (childProcess.execSync as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('not a git repository');
      });

      const result = detectRepoType('/test/path');

      expect(result.type).toBe('unknown');
    });
  });

  describe('findPrTemplate', () => {
    it('should find GitHub PR template in .github directory', () => {
      (fs.existsSync as unknown as ReturnType<typeof vi.fn>).mockImplementation((path: string) =>
        path.includes('.github/pull_request_template.md'),
      );
      (fs.readFileSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        '## Template content',
      );

      const result = findPrTemplate('/test/path', 'github');

      expect(result).toBe('## Template content');
    });

    it('should find GitLab MR template', () => {
      (fs.existsSync as unknown as ReturnType<typeof vi.fn>).mockImplementation((path: string) =>
        path.includes('.gitlab/merge_request_templates/Default.md'),
      );
      (fs.readFileSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue(
        '## MR Template content',
      );

      const result = findPrTemplate('/test/path', 'gitlab');

      expect(result).toBe('## MR Template content');
    });

    it('should return null when no template found', () => {
      (fs.existsSync as unknown as ReturnType<typeof vi.fn>).mockReturnValue(false);

      const result = findPrTemplate('/test/path', 'github');

      expect(result).toBeNull();
    });

    it('should continue searching if template read fails', () => {
      (fs.existsSync as unknown as ReturnType<typeof vi.fn>)
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(true);
      (fs.readFileSync as unknown as ReturnType<typeof vi.fn>)
        .mockImplementationOnce(() => {
          throw new Error('Permission denied');
        })
        .mockReturnValueOnce('## Template content');

      const result = findPrTemplate('/test/path', 'github');

      expect(result).toBe('## Template content');
    });
  });

  describe('getDefaultPrTemplate', () => {
    it('should return default PR template', () => {
      const template = getDefaultPrTemplate();

      expect(template).toContain('## Summary');
      expect(template).toContain('## Changes');
      expect(template).toContain('## Testing');
      expect(template).toContain('Cadre AI');
    });
  });

  describe('generateRandomHash', () => {
    it('should generate hash of specified length', () => {
      const hash = generateRandomHash(5);

      expect(hash).toHaveLength(5);
      expect(hash).toMatch(/^[a-zA-Z0-9]+$/);
    });

    it('should generate different hashes on subsequent calls', () => {
      const hash1 = generateRandomHash(10);
      const hash2 = generateRandomHash(10);

      expect(hash1).not.toBe(hash2);
    });

    it('should use default length of 5', () => {
      const hash = generateRandomHash();

      expect(hash).toHaveLength(5);
    });
  });

  describe('sanitizeFeatureName', () => {
    it('should convert to lowercase', () => {
      const result = sanitizeFeatureName('Add Login Feature');

      expect(result).toBe('add-login-feature');
    });

    it('should replace spaces with hyphens', () => {
      const result = sanitizeFeatureName('feature with spaces');

      expect(result).toBe('feature-with-spaces');
    });

    it('should remove special characters', () => {
      const result = sanitizeFeatureName('feature@#$%special!chars');

      expect(result).toBe('feature-special-chars');
    });

    it('should replace multiple hyphens with single hyphen', () => {
      const result = sanitizeFeatureName('feature---multiple---hyphens');

      expect(result).toBe('feature-multiple-hyphens');
    });

    it('should remove leading and trailing hyphens', () => {
      const result = sanitizeFeatureName('---feature---');

      expect(result).toBe('feature');
    });

    it('should limit length to 50 characters', () => {
      const longName = 'a'.repeat(100);
      const result = sanitizeFeatureName(longName);

      expect(result.length).toBeLessThanOrEqual(50);
    });
  });

  describe('generateCadreBranchName', () => {
    it('should generate branch name with cadre/ prefix', () => {
      const result = generateCadreBranchName('add-login');

      expect(result).toMatch(/^cadre\/add-login-[a-zA-Z0-9]{5}$/);
    });

    it('should sanitize feature name', () => {
      const result = generateCadreBranchName('Add Login Feature!');

      expect(result).toMatch(/^cadre\/add-login-feature-[a-zA-Z0-9]{5}$/);
    });

    it('should include 5-character hash', () => {
      const result = generateCadreBranchName('feature');
      const hashPart = result.split('-').pop();

      expect(hashPart).toHaveLength(5);
    });
  });
});
