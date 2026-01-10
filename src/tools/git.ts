import { exec } from 'child_process';
import util from 'util';
import { getPermissionManager } from '../permissions/index.js';

const execAsync = util.promisify(exec);

// Protected branches that should never be force-pushed to
const PROTECTED_BRANCHES = ['main', 'master', 'develop', 'production'];

/**
 * Execute a git command with permission checking.
 */
async function runGitCommand(command: string, cwd?: string): Promise<string> {
  const permissionManager = getPermissionManager();
  const workDir = cwd || process.cwd();

  const hasPermission = await permissionManager.checkAndRequest(
    workDir,
    'bash',
    `run git command: ${command}`,
  );

  if (!hasPermission) {
    return `Permission denied to run git command in ${workDir}`;
  }

  try {
    const { stdout, stderr } = await execAsync(`git ${command}`, {
      cwd: workDir,
      timeout: 30000, // 30 second timeout for git commands
      maxBuffer: 5 * 1024 * 1024, // 5MB buffer
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
 * Get current git repository status.
 * Returns structured information about current branch, staged/unstaged files, etc.
 */
export const gitStatus = async (cwd?: string): Promise<string> => {
  const result = await runGitCommand('status --porcelain --branch', cwd);

  if (result.startsWith('Error') || result.startsWith('Permission denied')) {
    return result;
  }

  // Parse porcelain output for better structure
  const lines = result.split('\n');
  const branchLine = lines[0] || '';
  const fileLines = lines.slice(1).filter((line) => line.trim());

  let output = '=== Git Status ===\n';

  // Parse branch info
  if (branchLine.startsWith('##')) {
    const branchInfo = branchLine.substring(3).trim();
    output += `Branch: ${branchInfo}\n`;
  }

  if (fileLines.length === 0) {
    output += '\nWorking tree clean - no changes to commit.';
    return output;
  }

  // Categorize files
  const staged: string[] = [];
  const modified: string[] = [];
  const untracked: string[] = [];

  fileLines.forEach((line) => {
    const status = line.substring(0, 2);
    const file = line.substring(3);

    if (status[0] !== ' ' && status[0] !== '?') {
      staged.push(`${status} ${file}`);
    }
    if (status[1] === 'M' || status[1] === 'D') {
      modified.push(file);
    }
    if (status === '??') {
      untracked.push(file);
    }
  });

  if (staged.length > 0) {
    output += '\nStaged changes:\n';
    staged.forEach((file) => {
      output += `  ${file}\n`;
    });
  }

  if (modified.length > 0) {
    output += '\nUnstaged changes:\n';
    modified.forEach((file) => {
      output += `  ${file}\n`;
    });
  }

  if (untracked.length > 0) {
    output += '\nUntracked files:\n';
    untracked.forEach((file) => {
      output += `  ${file}\n`;
    });
  }

  return output;
};

/**
 * Git branch operations: list, create, switch, delete.
 */
export const gitBranch = async (
  operation: 'list' | 'create' | 'switch' | 'delete',
  branchName?: string,
  cwd?: string,
): Promise<string> => {
  switch (operation) {
    case 'list': {
      const local = await runGitCommand('branch -v', cwd);
      const remote = await runGitCommand('branch -r', cwd);

      if (local.startsWith('Error') || remote.startsWith('Error')) {
        return local.startsWith('Error') ? local : remote;
      }

      return `=== Local Branches ===\n${local}\n\n=== Remote Branches ===\n${remote}`;
    }

    case 'create':
      if (!branchName) {
        return 'Error: branch_name is required for create operation';
      }
      return runGitCommand(`checkout -b ${branchName}`, cwd);

    case 'switch':
      if (!branchName) {
        return 'Error: branch_name is required for switch operation';
      }
      return runGitCommand(`checkout ${branchName}`, cwd);

    case 'delete': {
      if (!branchName) {
        return 'Error: branch_name is required for delete operation';
      }

      // Safety check: prevent deleting protected branches
      if (PROTECTED_BRANCHES.includes(branchName)) {
        return `Error: Cannot delete protected branch '${branchName}'. Protected branches: ${PROTECTED_BRANCHES.join(', ')}`;
      }

      return runGitCommand(`branch -d ${branchName}`, cwd);
    }

    default:
      return `Error: Unknown operation '${operation}'. Valid operations: list, create, switch, delete`;
  }
};

/**
 * Create a git commit.
 */
export const gitCommit = async (
  message: string,
  files?: string[],
  cwd?: string,
): Promise<string> => {
  if (!message) {
    return 'Error: commit message is required';
  }

  let result = '';

  // Stage files if specified, otherwise stage all changes
  if (files && files.length > 0) {
    const addResult = await runGitCommand(`add ${files.join(' ')}`, cwd);
    if (addResult.startsWith('Error')) {
      return addResult;
    }
    result += `Staged files: ${files.join(', ')}\n`;
  } else {
    const addResult = await runGitCommand('add -A', cwd);
    if (addResult.startsWith('Error')) {
      return addResult;
    }
    result += 'Staged all changes\n';
  }

  // Create commit
  const escapedMessage = message.replace(/"/g, '\\"');
  const commitResult = await runGitCommand(`commit -m "${escapedMessage}"`, cwd);

  if (commitResult.startsWith('Error')) {
    return commitResult;
  }

  return `${result}${commitResult}`;
};

/**
 * Sync with remote repository.
 */
export const gitSync = async (
  operation: 'fetch' | 'pull' | 'push',
  remote?: string,
  branch?: string,
  cwd?: string,
): Promise<string> => {
  const remoteName = remote || 'origin';

  switch (operation) {
    case 'fetch':
      return runGitCommand(`fetch ${remoteName}`, cwd);

    case 'pull': {
      const branchArg = branch ? ` ${remoteName} ${branch}` : '';
      return runGitCommand(`pull${branchArg}`, cwd);
    }

    case 'push': {
      // Get current branch if not specified
      let targetBranch = branch;
      if (!targetBranch) {
        const branchResult = await runGitCommand('rev-parse --abbrev-ref HEAD', cwd);
        if (branchResult.startsWith('Error')) {
          return branchResult;
        }
        targetBranch = branchResult.trim();
      }

      // Safety check: warn about pushing to protected branches
      if (PROTECTED_BRANCHES.includes(targetBranch)) {
        return `Warning: Pushing to protected branch '${targetBranch}'. Use with caution.\n${await runGitCommand(`push ${remoteName} ${targetBranch}`, cwd)}`;
      }

      const pushArg = branch ? ` ${remoteName} ${branch}` : '';
      return runGitCommand(`push${pushArg}`, cwd);
    }

    default:
      return `Error: Unknown operation '${operation}'. Valid operations: fetch, pull, push`;
  }
};

/**
 * View git commit history.
 */
export const gitLog = async (
  limit: number = 10,
  format: 'oneline' | 'detailed' = 'oneline',
  cwd?: string,
): Promise<string> => {
  const formatArg =
    format === 'detailed' ? '--pretty=format:"%h - %an, %ar : %s"' : '--pretty=format:"%h %s"';

  return runGitCommand(`log ${formatArg} -n ${limit}`, cwd);
};

/**
 * View git diff.
 */
export const gitDiff = async (
  target?: 'working' | 'staged' | string,
  cwd?: string,
): Promise<string> => {
  let command = 'diff';

  if (target === 'staged') {
    command = 'diff --staged';
  } else if (target === 'working' || !target) {
    command = 'diff';
  } else {
    // Treat as commit/branch reference
    command = `diff ${target}`;
  }

  const result = await runGitCommand(command, cwd);

  if (!result || result === 'Command completed with no output.') {
    return 'No differences found.';
  }

  return result;
};
