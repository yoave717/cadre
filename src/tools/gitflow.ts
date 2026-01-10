import { gitBranch } from './git.js';

/**
 * Execute a git command with permission checking (re-export from git.ts).
 * This is used internally by gitflow functions.
 */
async function execGit(command: string, cwd?: string): Promise<string> {
  // Import the internal runGitCommand from git.ts
  // Since it's not exported, we'll use gitBranch with 'list' as a workaround
  // and implement our own simplified version here
  const { exec } = await import('child_process');
  const util = await import('util');
  const { getPermissionManager } = await import('../permissions/index.js');

  const execAsync = util.promisify(exec);
  const permissionManager = getPermissionManager();
  const workDir = cwd || process.cwd();

  const hasPermission = await permissionManager.checkAndRequest(
    workDir,
    'bash',
    `run gitflow command: ${command}`,
  );

  if (!hasPermission) {
    return `Permission denied to run git command in ${workDir}`;
  }

  try {
    const { stdout, stderr } = await execAsync(`git ${command}`, {
      cwd: workDir,
      timeout: 30000,
      maxBuffer: 5 * 1024 * 1024,
    });

    let result = '';
    if (stdout.trim()) {
      result += stdout.trim();
    }
    if (stderr.trim()) {
      result += `${result ? '\n' : ''}${stderr.trim()}`;
    }
    return result || 'Command completed with no output.';
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = error as any;
    let result = `Error: ${err.message}`;
    if (err.stdout?.trim()) {
      result += `\n${err.stdout.trim()}`;
    }
    if (err.stderr?.trim()) {
      result += `\n${err.stderr.trim()}`;
    }
    return result;
  }
}

/**
 * Initialize gitflow in the repository.
 */
export const gitflowInit = async (cwd?: string): Promise<string> => {
  // Check if gitflow is already initialized
  const checkConfig = await execGit('config --get gitflow.branch.master', cwd);

  if (!checkConfig.startsWith('Error')) {
    return 'Gitflow is already initialized in this repository.';
  }

  // Set up basic gitflow configuration
  const commands = [
    'config gitflow.branch.master main',
    'config gitflow.branch.develop develop',
    'config gitflow.prefix.feature feature/',
    'config gitflow.prefix.release release/',
    'config gitflow.prefix.hotfix hotfix/',
    'config gitflow.prefix.support support/',
    'config gitflow.prefix.versiontag ""',
  ];

  let result = '=== Initializing Gitflow ===\n';

  for (const command of commands) {
    const cmdResult = await execGit(command, cwd);
    if (cmdResult.startsWith('Error')) {
      return `Failed to initialize gitflow: ${cmdResult}`;
    }
  }

  result += 'Gitflow configuration set:\n';
  result += '  - Production branch: main\n';
  result += '  - Development branch: develop\n';
  result += '  - Feature prefix: feature/\n';
  result += '  - Release prefix: release/\n';
  result += '  - Hotfix prefix: hotfix/\n';

  // Check if develop branch exists, create if not
  const branchCheck = await execGit('rev-parse --verify develop', cwd);
  if (branchCheck.startsWith('Error')) {
    result += '\nCreating develop branch...\n';
    const createDevelop = await execGit('checkout -b develop', cwd);
    if (createDevelop.startsWith('Error')) {
      return `${result}\nFailed to create develop branch: ${createDevelop}`;
    }
    result += 'Develop branch created successfully.';
  }

  return result;
};

/**
 * Gitflow feature operations: start, finish, list.
 */
export const gitflowFeature = async (
  action: 'start' | 'finish' | 'list',
  name?: string,
  cwd?: string,
): Promise<string> => {
  switch (action) {
    case 'list': {
      const branches = await execGit('branch', cwd);
      if (branches.startsWith('Error')) {
        return branches;
      }

      const featureBranches = branches
        .split('\n')
        .filter((branch) => branch.includes('feature/'))
        .map((branch) => branch.trim().replace('* ', ''));

      if (featureBranches.length === 0) {
        return 'No feature branches found.';
      }

      return `=== Feature Branches ===\n${featureBranches.join('\n')}`;
    }

    case 'start': {
      if (!name) {
        return 'Error: feature name is required for start action';
      }

      // Ensure we're on develop branch
      const checkout = await execGit('checkout develop', cwd);
      if (checkout.startsWith('Error')) {
        return `Error: Cannot start feature. ${checkout}`;
      }

      // Pull latest changes
      const pull = await execGit('pull origin develop', cwd);
      if (pull.startsWith('Error') && !pull.includes('no tracking information')) {
        return `Warning: Could not pull latest changes: ${pull}\nContinuing anyway...`;
      }

      // Create feature branch
      const branchName = `feature/${name}`;
      return gitBranch('create', branchName, cwd);
    }

    case 'finish': {
      if (!name) {
        return 'Error: feature name is required for finish action';
      }

      const branchName = `feature/${name}`;

      // Switch to develop
      const checkoutDevelop = await execGit('checkout develop', cwd);
      if (checkoutDevelop.startsWith('Error')) {
        return `Error: Cannot finish feature. ${checkoutDevelop}`;
      }

      // Merge feature branch
      const merge = await execGit(`merge --no-ff ${branchName}`, cwd);
      if (merge.startsWith('Error')) {
        return `Error merging feature: ${merge}`;
      }

      // Delete feature branch
      const deleteBranch = await execGit(`branch -d ${branchName}`, cwd);

      return `Feature '${name}' finished successfully.\n${merge}\n${deleteBranch}`;
    }

    default:
      return `Error: Unknown action '${action}'. Valid actions: start, finish, list`;
  }
};

/**
 * Gitflow release operations: start, finish, list.
 */
export const gitflowRelease = async (
  action: 'start' | 'finish' | 'list',
  version?: string,
  cwd?: string,
): Promise<string> => {
  switch (action) {
    case 'list': {
      const branches = await execGit('branch', cwd);
      if (branches.startsWith('Error')) {
        return branches;
      }

      const releaseBranches = branches
        .split('\n')
        .filter((branch) => branch.includes('release/'))
        .map((branch) => branch.trim().replace('* ', ''));

      if (releaseBranches.length === 0) {
        return 'No release branches found.';
      }

      return `=== Release Branches ===\n${releaseBranches.join('\n')}`;
    }

    case 'start': {
      if (!version) {
        return 'Error: version is required for start action';
      }

      // Ensure we're on develop branch
      const checkout = await execGit('checkout develop', cwd);
      if (checkout.startsWith('Error')) {
        return `Error: Cannot start release. ${checkout}`;
      }

      // Create release branch
      const branchName = `release/${version}`;
      return gitBranch('create', branchName, cwd);
    }

    case 'finish': {
      if (!version) {
        return 'Error: version is required for finish action';
      }

      const branchName = `release/${version}`;
      let result = '';

      // Merge to main
      const checkoutMain = await execGit('checkout main', cwd);
      if (checkoutMain.startsWith('Error')) {
        return `Error: Cannot finish release. ${checkoutMain}`;
      }

      const mergeMain = await execGit(`merge --no-ff ${branchName}`, cwd);
      if (mergeMain.startsWith('Error')) {
        return `Error merging to main: ${mergeMain}`;
      }
      result += `Merged to main\n`;

      // Tag the release
      const tag = await execGit(`tag -a v${version} -m "Release ${version}"`, cwd);
      if (!tag.startsWith('Error')) {
        result += `Tagged as v${version}\n`;
      }

      // Merge back to develop
      const checkoutDevelop = await execGit('checkout develop', cwd);
      if (!checkoutDevelop.startsWith('Error')) {
        const mergeDevelop = await execGit(`merge --no-ff ${branchName}`, cwd);
        if (!mergeDevelop.startsWith('Error')) {
          result += `Merged to develop\n`;
        }
      }

      // Delete release branch
      const deleteBranch = await execGit(`branch -d ${branchName}`, cwd);
      result += deleteBranch;

      return `Release '${version}' finished successfully.\n${result}`;
    }

    default:
      return `Error: Unknown action '${action}'. Valid actions: start, finish, list`;
  }
};

/**
 * Gitflow hotfix operations: start, finish, list.
 */
export const gitflowHotfix = async (
  action: 'start' | 'finish' | 'list',
  version?: string,
  cwd?: string,
): Promise<string> => {
  switch (action) {
    case 'list': {
      const branches = await execGit('branch', cwd);
      if (branches.startsWith('Error')) {
        return branches;
      }

      const hotfixBranches = branches
        .split('\n')
        .filter((branch) => branch.includes('hotfix/'))
        .map((branch) => branch.trim().replace('* ', ''));

      if (hotfixBranches.length === 0) {
        return 'No hotfix branches found.';
      }

      return `=== Hotfix Branches ===\n${hotfixBranches.join('\n')}`;
    }

    case 'start': {
      if (!version) {
        return 'Error: version is required for start action';
      }

      // Start from main branch
      const checkout = await execGit('checkout main', cwd);
      if (checkout.startsWith('Error')) {
        return `Error: Cannot start hotfix. ${checkout}`;
      }

      // Create hotfix branch
      const branchName = `hotfix/${version}`;
      return gitBranch('create', branchName, cwd);
    }

    case 'finish': {
      if (!version) {
        return 'Error: version is required for finish action';
      }

      const branchName = `hotfix/${version}`;
      let result = '';

      // Merge to main
      const checkoutMain = await execGit('checkout main', cwd);
      if (checkoutMain.startsWith('Error')) {
        return `Error: Cannot finish hotfix. ${checkoutMain}`;
      }

      const mergeMain = await execGit(`merge --no-ff ${branchName}`, cwd);
      if (mergeMain.startsWith('Error')) {
        return `Error merging to main: ${mergeMain}`;
      }
      result += `Merged to main\n`;

      // Tag the hotfix
      const tag = await execGit(`tag -a v${version} -m "Hotfix ${version}"`, cwd);
      if (!tag.startsWith('Error')) {
        result += `Tagged as v${version}\n`;
      }

      // Merge back to develop
      const checkoutDevelop = await execGit('checkout develop', cwd);
      if (!checkoutDevelop.startsWith('Error')) {
        const mergeDevelop = await execGit(`merge --no-ff ${branchName}`, cwd);
        if (!mergeDevelop.startsWith('Error')) {
          result += `Merged to develop\n`;
        }
      }

      // Delete hotfix branch
      const deleteBranch = await execGit(`branch -d ${branchName}`, cwd);
      result += deleteBranch;

      return `Hotfix '${version}' finished successfully.\n${result}`;
    }

    default:
      return `Error: Unknown action '${action}'. Valid actions: start, finish, list`;
  }
};
