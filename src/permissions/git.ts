import fs from 'fs/promises';
import path from 'path';

/**
 * Find the git root directory for a given path.
 * Walks up the directory tree looking for a .git folder.
 */
export async function findGitRoot(startPath: string): Promise<string | null> {
  let current = path.resolve(startPath);
  const { root } = path.parse(current);

  while (current !== root) {
    const gitDir = path.join(current, '.git');
    try {
      const stat = await fs.stat(gitDir);
      if (stat.isDirectory()) {
        return current;
      }
    } catch {
      // .git doesn't exist here, keep searching
    }
    current = path.dirname(current);
  }

  return null; // Not in a git project
}

/**
 * Get a friendly project name from a git root path.
 */
export function getProjectName(gitRoot: string): string {
  return path.basename(gitRoot);
}

/**
 * Check if a path is within a git repository.
 */
export async function isInGitRepo(targetPath: string): Promise<boolean> {
  const gitRoot = await findGitRoot(targetPath);
  return gitRoot !== null;
}
