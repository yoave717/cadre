import { execSync } from 'child_process';
import {
  checkGitHubCli,
  checkGitLabCli,
  getGitHubCliInstallInstructions,
  getGitLabCliInstallInstructions,
  getGitHubAuthInstructions,
  getGitLabAuthInstructions,
} from './cli-utils.js';
import {
  detectRepoType,
  findPrTemplate,
  getDefaultPrTemplate,
  generateCadreBranchName,
} from './repo-utils.js';

export interface CreatePrOptions {
  title: string;
  body?: string;
  baseBranch?: string;
  draft?: boolean;
  cwd?: string;
}

export interface CreatePrResult {
  success: boolean;
  message: string;
  prUrl?: string;
  error?: string;
}

export interface AutoBranchResult {
  success: boolean;
  branchName?: string;
  message: string;
  error?: string;
}

interface CommitInfo {
  hash: string;
  message: string;
}

interface FileChange {
  file: string;
  additions: number;
  deletions: number;
}

/**
 * Get the default base branch for the repository
 */
function getBaseBranch(cwd: string): string {
  try {
    // Try to get the default branch from git config
    const defaultBranch = execSync('git config --get init.defaultBranch', {
      encoding: 'utf-8',
      cwd,
      timeout: 5000,
      stdio: 'pipe',
    }).trim();
    if (defaultBranch) return defaultBranch;
  } catch {
    // Ignore error, continue with fallback logic
  }

  // Check which common default branches exist
  const commonBranches = ['main', 'master', 'develop'];
  for (const branch of commonBranches) {
    try {
      execSync(`git rev-parse --verify ${branch}`, {
        encoding: 'utf-8',
        cwd,
        timeout: 5000,
        stdio: 'pipe',
      });
      return branch;
    } catch {
      continue;
    }
  }

  return 'main'; // Default fallback
}

/**
 * Get commits since branch diverged from base branch
 */
function getCommitsSinceBase(baseBranch: string, cwd: string): CommitInfo[] {
  try {
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf-8',
      cwd,
      timeout: 5000,
    }).trim();

    // Get commits that are in current branch but not in base branch
    const logOutput = execSync(
      `git log ${baseBranch}..${currentBranch} --pretty=format:"%H|||%s"`,
      {
        encoding: 'utf-8',
        cwd,
        timeout: 10000,
      },
    ).trim();

    if (!logOutput) return [];

    return logOutput.split('\n').map((line) => {
      const [hash, message] = line.split('|||');
      return { hash, message };
    });
  } catch {
    return [];
  }
}

/**
 * Get file changes summary
 */
function getFileChanges(baseBranch: string, cwd: string): FileChange[] {
  try {
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf-8',
      cwd,
      timeout: 5000,
    }).trim();

    const diffOutput = execSync(`git diff --numstat ${baseBranch}...${currentBranch}`, {
      encoding: 'utf-8',
      cwd,
      timeout: 10000,
    }).trim();

    if (!diffOutput) return [];

    return diffOutput
      .split('\n')
      .map((line) => {
        const parts = line.split('\t');
        if (parts.length < 3) return null;
        return {
          file: parts[2],
          additions: parseInt(parts[0], 10) || 0,
          deletions: parseInt(parts[1], 10) || 0,
        };
      })
      .filter((change): change is FileChange => change !== null);
  } catch {
    return [];
  }
}

/**
 * Generate PR description automatically from commits and changes
 */
export function generatePrDescription(baseBranch: string, cwd: string = process.cwd()): string {
  const commits = getCommitsSinceBase(baseBranch, cwd);
  const fileChanges = getFileChanges(baseBranch, cwd);

  let description = '## Summary\n\n';

  // Summarize commits
  if (commits.length > 0) {
    description += 'This PR includes the following changes:\n\n';
    commits.forEach((commit) => {
      description += `- ${commit.message}\n`;
    });
    description += '\n';
  } else {
    description += 'No commits found.\n\n';
  }

  // Add file changes summary
  if (fileChanges.length > 0) {
    const totalAdditions = fileChanges.reduce((sum, change) => sum + change.additions, 0);
    const totalDeletions = fileChanges.reduce((sum, change) => sum + change.deletions, 0);

    description += '## Changes\n\n';
    description += `**Files changed:** ${fileChanges.length}\n`;
    description += `**Lines added:** ${totalAdditions}\n`;
    description += `**Lines deleted:** ${totalDeletions}\n\n`;

    // List key files (limit to 10 most changed files)
    const sortedChanges = fileChanges
      .sort((a, b) => b.additions + b.deletions - (a.additions + a.deletions))
      .slice(0, 10);

    description += '### Modified Files\n\n';
    sortedChanges.forEach((change) => {
      description += `- \`${change.file}\` (+${change.additions}/-${change.deletions})\n`;
    });
    description += '\n';
  }

  description += '## Testing\n\n';
  description += '- [ ] Tests pass locally\n';
  description += '- [ ] Code follows project style guidelines\n';
  description += '- [ ] Changes have been manually tested\n\n';

  description += '---\n';
  description += '*This PR was created by Cadre AI*\n';

  return description;
}

/**
 * Create an automatic branch for a new task
 */
export async function createAutoBranch(
  featureName: string,
  cwd: string = process.cwd(),
): Promise<AutoBranchResult> {
  try {
    // Generate branch name with pattern: cadre/<feature-name>-<random-hash>
    const branchName = generateCadreBranchName(featureName);

    // Check if branch already exists
    try {
      const branches = execSync('git branch --list', { encoding: 'utf-8', cwd, timeout: 5000 });
      if (branches.includes(branchName)) {
        return {
          success: false,
          message: `Branch '${branchName}' already exists`,
          error: 'Branch already exists',
        };
      }
    } catch {
      // Continue if branch listing fails
    }

    // Create and checkout the new branch
    execSync(`git checkout -b ${branchName}`, { cwd, timeout: 5000 });

    return {
      success: true,
      branchName,
      message: `Created and switched to branch '${branchName}'`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Failed to create auto branch: ${errorMessage}`,
      error: errorMessage,
    };
  }
}

/**
 * Create a pull request on GitHub
 */
async function createGitHubPr(options: CreatePrOptions): Promise<CreatePrResult> {
  const cwd = options.cwd || process.cwd();

  // Check if gh CLI is installed
  const cliCheck = await checkGitHubCli();

  if (!cliCheck.installed) {
    return {
      success: false,
      message: 'GitHub CLI (gh) is not installed',
      error: `GitHub CLI is required to create pull requests.\n\n${getGitHubCliInstallInstructions()}`,
    };
  }

  if (!cliCheck.authenticated) {
    return {
      success: false,
      message: 'Not authenticated with GitHub',
      error: `Please authenticate with GitHub:\n\n${getGitHubAuthInstructions()}`,
    };
  }

  try {
    // Generate PR description
    let body = options.body;
    if (!body) {
      // Determine base branch
      const baseBranch = options.baseBranch || getBaseBranch(cwd);

      // Check if we should use a template or generate description
      const template = findPrTemplate(cwd, 'github');
      if (template) {
        // If template exists, try to fill it with generated content
        const generatedContent = generatePrDescription(baseBranch, cwd);
        body = `${generatedContent}\n\n---\n\n${template}`;
      } else {
        // Generate description from commits and changes
        body = generatePrDescription(baseBranch, cwd);
      }
    }

    // Build gh pr create command
    const args = ['pr', 'create', '--title', `"${options.title}"`, '--body', `"${body}"`];

    if (options.baseBranch) {
      args.push('--base', options.baseBranch);
    }

    if (options.draft) {
      args.push('--draft');
    }

    // Execute command
    const result = execSync(`gh ${args.join(' ')}`, {
      encoding: 'utf-8',
      cwd,
      timeout: 30000,
    });

    // Extract PR URL from output
    const urlMatch = result.match(/https:\/\/github\.com\/[^\s]+/);
    const prUrl = urlMatch ? urlMatch[0] : undefined;

    return {
      success: true,
      message: `Pull request created successfully${prUrl ? `: ${prUrl}` : ''}`,
      prUrl,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: 'Failed to create pull request',
      error: errorMessage,
    };
  }
}

/**
 * Create a merge request on GitLab
 */
async function createGitLabMr(options: CreatePrOptions): Promise<CreatePrResult> {
  const cwd = options.cwd || process.cwd();

  // Check if glab CLI is installed
  const cliCheck = await checkGitLabCli();

  if (!cliCheck.installed) {
    return {
      success: false,
      message: 'GitLab CLI (glab) is not installed',
      error: `GitLab CLI is required to create merge requests.\n\n${getGitLabCliInstallInstructions()}`,
    };
  }

  if (!cliCheck.authenticated) {
    return {
      success: false,
      message: 'Not authenticated with GitLab',
      error: `Please authenticate with GitLab:\n\n${getGitLabAuthInstructions()}`,
    };
  }

  try {
    // Generate MR description
    let body = options.body;
    if (!body) {
      // Determine base branch
      const baseBranch = options.baseBranch || getBaseBranch(cwd);

      // Check if we should use a template or generate description
      const template = findPrTemplate(cwd, 'gitlab');
      if (template) {
        // If template exists, try to fill it with generated content
        const generatedContent = generatePrDescription(baseBranch, cwd);
        body = `${generatedContent}\n\n---\n\n${template}`;
      } else {
        // Generate description from commits and changes
        body = generatePrDescription(baseBranch, cwd);
      }
    }

    // Build glab mr create command
    const args = ['mr', 'create', '--title', `"${options.title}"`, '--description', `"${body}"`];

    if (options.baseBranch) {
      args.push('--target-branch', options.baseBranch);
    }

    if (options.draft) {
      args.push('--draft');
    }

    // Execute command
    const result = execSync(`glab ${args.join(' ')}`, {
      encoding: 'utf-8',
      cwd,
      timeout: 30000,
    });

    // Extract MR URL from output
    const urlMatch = result.match(/https:\/\/gitlab\.com\/[^\s]+/);
    const prUrl = urlMatch ? urlMatch[0] : undefined;

    return {
      success: true,
      message: `Merge request created successfully${prUrl ? `: ${prUrl}` : ''}`,
      prUrl,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: 'Failed to create merge request',
      error: errorMessage,
    };
  }
}

/**
 * Create a pull request (automatically detects GitHub or GitLab)
 */
export async function createPullRequest(options: CreatePrOptions): Promise<CreatePrResult> {
  const cwd = options.cwd || process.cwd();

  // Detect repository type
  const repoInfo = detectRepoType(cwd);

  if (repoInfo.type === 'unknown') {
    return {
      success: false,
      message: 'Could not detect repository type',
      error: 'This does not appear to be a GitHub or GitLab repository',
    };
  }

  // Route to appropriate PR creation function
  if (repoInfo.type === 'github') {
    return createGitHubPr(options);
  } else {
    return createGitLabMr(options);
  }
}

/**
 * Check if CLI tools are available and user is authenticated
 */
export async function checkPrRequirements(cwd: string = process.cwd()): Promise<CreatePrResult> {
  const repoInfo = detectRepoType(cwd);

  if (repoInfo.type === 'unknown') {
    return {
      success: false,
      message: 'Could not detect repository type',
      error: 'This does not appear to be a GitHub or GitLab repository',
    };
  }

  if (repoInfo.type === 'github') {
    const cliCheck = await checkGitHubCli();

    if (!cliCheck.installed) {
      return {
        success: false,
        message: 'GitHub CLI (gh) is not installed',
        error: `GitHub CLI is required to create pull requests.\n\n${getGitHubCliInstallInstructions()}`,
      };
    }

    if (!cliCheck.authenticated) {
      return {
        success: false,
        message: 'Not authenticated with GitHub',
        error: `Please authenticate with GitHub:\n\n${getGitHubAuthInstructions()}`,
      };
    }

    return {
      success: true,
      message: `GitHub CLI is installed (${cliCheck.version}) and authenticated`,
    };
  } else {
    const cliCheck = await checkGitLabCli();

    if (!cliCheck.installed) {
      return {
        success: false,
        message: 'GitLab CLI (glab) is not installed',
        error: `GitLab CLI is required to create merge requests.\n\n${getGitLabCliInstallInstructions()}`,
      };
    }

    if (!cliCheck.authenticated) {
      return {
        success: false,
        message: 'Not authenticated with GitLab',
        error: `Please authenticate with GitLab:\n\n${getGitLabAuthInstructions()}`,
      };
    }

    return {
      success: true,
      message: `GitLab CLI is installed (${cliCheck.version}) and authenticated`,
    };
  }
}
