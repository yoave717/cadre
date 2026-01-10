import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export type RepoType = 'github' | 'gitlab' | 'unknown';

export interface RepoInfo {
  type: RepoType;
  owner?: string;
  repo?: string;
  remote?: string;
}

/**
 * Detect repository type from git remote URL
 */
export function detectRepoType(cwd: string = process.cwd()): RepoInfo {
  try {
    // Get remote URL
    const remoteUrl = execSync('git config --get remote.origin.url', {
      encoding: 'utf-8',
      cwd,
      timeout: 5000,
    }).trim();

    // Parse GitHub URLs
    // SSH: git@github.com:owner/repo.git
    // HTTPS: https://github.com/owner/repo.git
    const githubSshMatch = remoteUrl.match(/git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
    const githubHttpsMatch = remoteUrl.match(/https:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/);

    if (githubSshMatch || githubHttpsMatch) {
      const match = githubSshMatch || githubHttpsMatch;
      return {
        type: 'github',
        owner: match![1],
        repo: match![2],
        remote: remoteUrl,
      };
    }

    // Parse GitLab URLs
    // SSH: git@gitlab.com:owner/repo.git
    // HTTPS: https://gitlab.com/owner/repo.git
    const gitlabSshMatch = remoteUrl.match(/git@gitlab\.com:([^/]+)\/(.+?)(?:\.git)?$/);
    const gitlabHttpsMatch = remoteUrl.match(/https:\/\/gitlab\.com\/([^/]+)\/(.+?)(?:\.git)?$/);

    if (gitlabSshMatch || gitlabHttpsMatch) {
      const match = gitlabSshMatch || gitlabHttpsMatch;
      return {
        type: 'gitlab',
        owner: match![1],
        repo: match![2],
        remote: remoteUrl,
      };
    }

    // Check for self-hosted GitLab instances (common pattern)
    if (remoteUrl.includes('gitlab')) {
      return {
        type: 'gitlab',
        remote: remoteUrl,
      };
    }

    return {
      type: 'unknown',
      remote: remoteUrl,
    };
  } catch {
    return {
      type: 'unknown',
    };
  }
}

/**
 * Find PR/MR template files in the repository
 */
export function findPrTemplate(cwd: string = process.cwd(), repoType: RepoType): string | null {
  const searchPaths: string[] = [];

  if (repoType === 'github') {
    searchPaths.push(
      '.github/pull_request_template.md',
      '.github/PULL_REQUEST_TEMPLATE.md',
      '.github/pull_request_template/default.md',
      '.github/PULL_REQUEST_TEMPLATE/default.md',
      'docs/pull_request_template.md',
      'docs/PULL_REQUEST_TEMPLATE.md',
      'PULL_REQUEST_TEMPLATE.md',
      'pull_request_template.md',
    );
  } else if (repoType === 'gitlab') {
    searchPaths.push(
      '.gitlab/merge_request_templates/Default.md',
      '.gitlab/merge_request_templates/default.md',
      'MERGE_REQUEST_TEMPLATE.md',
      'merge_request_template.md',
    );
  }

  for (const templatePath of searchPaths) {
    const fullPath = path.join(cwd, templatePath);
    if (fs.existsSync(fullPath)) {
      try {
        return fs.readFileSync(fullPath, 'utf-8');
      } catch {
        // Continue searching if read fails
        continue;
      }
    }
  }

  return null;
}

/**
 * Get default Cadre PR/MR template
 */
export function getDefaultPrTemplate(): string {
  return `## Summary
<!-- Briefly describe what this PR does -->


## Changes
<!-- List the main changes in this PR -->
-


## Testing
<!-- Describe how you tested these changes -->
-


## Checklist
- [ ] Code follows project style guidelines
- [ ] Tests pass locally
- [ ] Documentation updated (if needed)
- [ ] No breaking changes (or documented if present)


---
*This PR was created by Cadre AI*
`;
}

/**
 * Generate a random hash for branch names
 */
export function generateRandomHash(length: number = 5): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Sanitize feature name for branch naming
 */
export function sanitizeFeatureName(featureName: string): string {
  return featureName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-') // Replace non-alphanumeric with hyphens
    .replace(/-+/g, '-') // Replace multiple hyphens with single
    .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
    .substring(0, 50); // Limit length
}

/**
 * Generate a Cadre branch name
 */
export function generateCadreBranchName(featureName: string): string {
  const sanitized = sanitizeFeatureName(featureName);
  const hash = generateRandomHash(5);
  return `cadre/${sanitized}-${hash}`;
}
