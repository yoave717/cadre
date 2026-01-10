import fs from 'fs/promises';
import path from 'path';

/**
 * Completion system for Cadre CLI
 * Provides tab completion for commands, file paths, and context-aware suggestions
 */

export interface CompletionResult {
  completions: string[];
  prefix: string; // The part that will be replaced
}

// All available slash commands
const SLASH_COMMANDS = [
  '/help',
  '/clear',
  '/reset',
  '/save',
  '/load',
  '/list',
  '/exit',
  '/quit',
  '/history',
  '/log',
  '/branches',
  '/checkout',
  '/new',
  '/branch',
  '/parallel',
  '/multiline',
  '/normal',
  '/context',
] as const;

// Commands that expect file/directory paths as arguments
const PATH_COMMANDS = ['/save', '/load'] as const;

// Commands that expect branch names (handled separately)
const BRANCH_COMMANDS = ['/checkout'] as const;

/**
 * Get completions for the current input
 */
export async function getCompletions(
  text: string,
  cachedBranchNames: string[] = [],
): Promise<string[]> {
  // Empty input - suggest slash commands
  if (text === '' || text === '/') {
    return SLASH_COMMANDS.map((cmd) => cmd);
  }

  // Completing a slash command
  if (text.startsWith('/') && !text.includes(' ')) {
    const partial = text.slice(1).toLowerCase();
    return SLASH_COMMANDS.filter((cmd) => cmd.slice(1).toLowerCase().startsWith(partial));
  }

  // Command with arguments
  if (text.startsWith('/') && text.includes(' ')) {
    const [command, ...argsParts] = text.split(' ');
    const argsText = argsParts.join(' ');

    // Branch name completion for /checkout
    if (BRANCH_COMMANDS.includes(command as any)) {
      return completeBranchNames(text, command, argsText, cachedBranchNames);
    }

    // File path completion for path commands
    if (PATH_COMMANDS.includes(command as any)) {
      return await completeFilePath(text, command, argsText);
    }
  }

  // For regular text (not commands), suggest file paths if it looks like a path
  if (text.includes('/') || text.includes('.') || text.includes('~')) {
    return await completeFilePath(text, '', text);
  }

  return [];
}

/**
 * Complete branch names for /checkout command
 */
function completeBranchNames(
  fullText: string,
  command: string,
  partial: string,
  cachedBranchNames: string[],
): string[] {
  const lowerPartial = partial.toLowerCase();
  const matches = cachedBranchNames.filter((name) => name.toLowerCase().startsWith(lowerPartial));

  return matches.map((name) => `${command} ${name}`);
}

/**
 * Complete file/directory paths
 */
async function completeFilePath(
  fullText: string,
  command: string,
  pathPart: string,
): Promise<string[]> {
  try {
    // Normalize the path
    let searchPath = pathPart.trim();
    if (searchPath.startsWith('~')) {
      const home = process.env.HOME || process.env.USERPROFILE || '';
      searchPath = searchPath.replace('~', home);
    }

    // Determine the directory to search and the prefix to match
    let searchDir: string;
    let filePrefix: string;

    if (searchPath === '' || searchPath === '.') {
      searchDir = process.cwd();
      filePrefix = '';
    } else if (searchPath.endsWith('/') || searchPath.endsWith(path.sep)) {
      // User typed a directory path ending with /
      searchDir = path.resolve(searchPath);
      filePrefix = '';
    } else {
      // Extract directory and file prefix
      searchDir = path.dirname(path.resolve(searchPath));
      filePrefix = path.basename(searchPath).toLowerCase();
    }

    // Check if directory exists
    try {
      await fs.access(searchDir);
    } catch {
      return []; // Directory doesn't exist
    }

    // Read directory contents
    const entries = await fs.readdir(searchDir, { withFileTypes: true });

    // Filter by prefix and format
    const matches = entries
      .filter((entry) => {
        if (filePrefix === '') return true;
        return entry.name.toLowerCase().startsWith(filePrefix);
      })
      .map((entry) => {
        // Build the full path relative to original input
        let basePath: string;
        if (searchPath === '' || searchPath === '.') {
          basePath = '';
        } else if (searchPath.endsWith('/') || searchPath.endsWith(path.sep)) {
          basePath = searchPath;
        } else {
          basePath = path.dirname(searchPath);
          if (basePath === '.') basePath = '';
        }

        const fullPath = basePath
          ? path.join(basePath, entry.name).replace(/\\/g, '/')
          : entry.name;

        // Add trailing slash for directories
        const displayPath = entry.isDirectory() ? `${fullPath}/` : fullPath;

        // Return full command if we're completing a command argument
        return command ? `${command} ${displayPath}` : displayPath;
      });

    return matches.slice(0, 50); // Limit to 50 completions
  } catch (error) {
    // Silently fail - no completions available
    return [];
  }
}

/**
 * Get command suggestions based on partial input
 * This provides inline suggestions (different from tab completion)
 */
export function getCommandSuggestions(text: string): string[] {
  if (!text.startsWith('/')) return [];

  const partial = text.slice(1).toLowerCase();
  if (partial === '') return [];

  return SLASH_COMMANDS.filter((cmd) => cmd.slice(1).toLowerCase().startsWith(partial))
    .slice(0, 5) // Top 5 suggestions
    .map((cmd) => cmd);
}

/**
 * Get inline suggestion for the current input
 * Returns the suggested completion that could be shown in gray
 */
export function getInlineSuggestion(text: string, cachedBranchNames: string[] = []): string {
  // Only suggest for slash commands
  if (!text.startsWith('/')) return '';

  // Don't suggest if we're in the middle of arguments
  if (text.includes(' ')) return '';

  const partial = text.slice(1).toLowerCase();
  if (partial === '') return '';

  // Find first matching command
  const match = SLASH_COMMANDS.find((cmd) => cmd.slice(1).toLowerCase().startsWith(partial));

  if (match && match !== text) {
    // Return only the part that should be suggested (after current text)
    return match.slice(text.length);
  }

  return '';
}
