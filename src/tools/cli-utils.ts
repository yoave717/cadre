import { execSync } from 'child_process';

export interface CliCheckResult {
  installed: boolean;
  authenticated: boolean;
  version?: string;
  error?: string;
}

/**
 * Check if GitHub CLI (gh) is installed and authenticated
 */
export async function checkGitHubCli(): Promise<CliCheckResult> {
  try {
    // Check if gh is installed
    const version = execSync('gh --version', { encoding: 'utf-8', timeout: 5000 }).trim();

    // Check authentication status
    try {
      execSync('gh auth status', { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' });
      return {
        installed: true,
        authenticated: true,
        version: version.split('\n')[0],
      };
    } catch {
      return {
        installed: true,
        authenticated: false,
        version: version.split('\n')[0],
        error: 'Not authenticated',
      };
    }
  } catch {
    return {
      installed: false,
      authenticated: false,
      error: 'GitHub CLI (gh) not found',
    };
  }
}

/**
 * Check if GitLab CLI (glab) is installed and authenticated
 */
export async function checkGitLabCli(): Promise<CliCheckResult> {
  try {
    // Check if glab is installed
    const version = execSync('glab --version', { encoding: 'utf-8', timeout: 5000 }).trim();

    // Check authentication status
    try {
      execSync('glab auth status', { encoding: 'utf-8', timeout: 5000, stdio: 'pipe' });
      return {
        installed: true,
        authenticated: true,
        version: version.split('\n')[0],
      };
    } catch {
      return {
        installed: false,
        authenticated: false,
        version: version.split('\n')[0],
        error: 'Not authenticated',
      };
    }
  } catch {
    return {
      installed: false,
      authenticated: false,
      error: 'GitLab CLI (glab) not found',
    };
  }
}

/**
 * Get installation instructions for GitHub CLI
 */
export function getGitHubCliInstallInstructions(): string {
  const platform = process.platform;

  if (platform === 'darwin') {
    return `Install GitHub CLI using Homebrew:
  brew install gh

Or download from: https://github.com/cli/cli/releases`;
  } else if (platform === 'linux') {
    return `Install GitHub CLI:

  Debian/Ubuntu:
    sudo apt update
    sudo apt install gh

  Fedora/RHEL:
    sudo dnf install gh

  Or see: https://github.com/cli/cli/blob/trunk/docs/install_linux.md`;
  } else if (platform === 'win32') {
    return `Install GitHub CLI:

  Using winget:
    winget install --id GitHub.cli

  Using scoop:
    scoop install gh

  Or download from: https://github.com/cli/cli/releases`;
  }

  return 'Visit https://cli.github.com/ for installation instructions';
}

/**
 * Get installation instructions for GitLab CLI
 */
export function getGitLabCliInstallInstructions(): string {
  const platform = process.platform;

  if (platform === 'darwin') {
    return `Install GitLab CLI using Homebrew:
  brew install glab

Or download from: https://gitlab.com/gitlab-org/cli/-/releases`;
  } else if (platform === 'linux') {
    return `Install GitLab CLI:

  Debian/Ubuntu:
    sudo apt update
    sudo apt install glab

  Fedora/RHEL:
    sudo dnf install glab

  Or see: https://gitlab.com/gitlab-org/cli#installation`;
  } else if (platform === 'win32') {
    return `Install GitLab CLI:

  Using scoop:
    scoop install glab

  Or download from: https://gitlab.com/gitlab-org/cli/-/releases`;
  }

  return 'Visit https://gitlab.com/gitlab-org/cli#installation for installation instructions';
}

/**
 * Get authentication instructions for GitHub CLI
 */
export function getGitHubAuthInstructions(): string {
  return `Authenticate with GitHub:
  gh auth login

Follow the prompts to authenticate via browser or token.`;
}

/**
 * Get authentication instructions for GitLab CLI
 */
export function getGitLabAuthInstructions(): string {
  return `Authenticate with GitLab:
  glab auth login

Follow the prompts to authenticate via browser or token.`;
}
