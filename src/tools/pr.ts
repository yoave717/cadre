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
    // Get PR template or use default
    let body = options.body;
    if (!body) {
      const template = findPrTemplate(cwd, 'github');
      body = template || getDefaultPrTemplate();
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
    // Get MR template or use default
    let body = options.body;
    if (!body) {
      const template = findPrTemplate(cwd, 'gitlab');
      body = template || getDefaultPrTemplate();
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
