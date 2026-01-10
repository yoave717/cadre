import fs from 'fs/promises';
import path from 'path';

// Common patterns to ignore
const DEFAULT_IGNORE = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.nuxt',
  'coverage',
  '.nyc_output',
  '__pycache__',
  '.pytest_cache',
  'venv',
  '.venv',
  'env',
  '.env',
  '*.pyc',
  '*.pyo',
  '.DS_Store',
  'Thumbs.db',
];

interface GlobOptions {
  cwd?: string;
  ignore?: string[];
  maxResults?: number;
}

/**
 * Simple glob pattern matching.
 * Supports: *, **, ?
 */
function matchPattern(filePath: string, pattern: string): boolean {
  // Convert glob pattern to regex
  let regex = pattern
    .replace(/\./g, '\\.') // Escape dots
    .replace(/\*\*/g, '<<GLOBSTAR>>') // Placeholder for **
    .replace(/\*/g, '[^/]*') // * matches anything except /
    .replace(/\?/g, '[^/]') // ? matches single char except /
    .replace(/<<GLOBSTAR>>/g, '.*'); // ** matches anything including /

  // Anchor the pattern
  regex = `^${regex}$`;

  return new RegExp(regex).test(filePath);
}

/**
 * Check if a path should be ignored.
 */
function shouldIgnore(relativePath: string, ignorePatterns: string[]): boolean {
  const parts = relativePath.split(path.sep);

  return ignorePatterns.some((pattern) => {
    // Check if any part of the path matches the ignore pattern
    if (parts.some((part) => matchPattern(part, pattern))) {
      return true;
    }
    // Also check full path match
    return matchPattern(relativePath, pattern);
  });
}

/**
 * Recursively walk a directory and find files matching a pattern.
 */
async function walkDirectory(
  dir: string,
  baseDir: string,
  pattern: string,
  ignorePatterns: string[],
  results: string[],
  maxResults: number,
): Promise<void> {
  if (results.length >= maxResults) return;

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (results.length >= maxResults) break;

      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(baseDir, fullPath);

      // Skip ignored paths
      if (shouldIgnore(relativePath, ignorePatterns)) {
        continue;
      }

      if (entry.isDirectory()) {
        // Recurse into directory

        await walkDirectory(fullPath, baseDir, pattern, ignorePatterns, results, maxResults);
      } else if (entry.isFile()) {
        // Check if file matches pattern
        if (matchPattern(relativePath, pattern)) {
          results.push(relativePath);
        }
      }
    }
  } catch {
    // Ignore permission errors and continue
  }
}

/**
 * Find files matching a glob pattern.
 */
export const globFiles = async (pattern: string, options: GlobOptions = {}): Promise<string> => {
  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();
  const ignorePatterns = [...DEFAULT_IGNORE, ...(options.ignore || [])];
  const maxResults = options.maxResults || 1000;

  const results: string[] = [];

  try {
    await walkDirectory(cwd, cwd, pattern, ignorePatterns, results, maxResults);

    if (results.length === 0) {
      return `No files found matching pattern: ${pattern}`;
    }

    // Sort by path
    results.sort();

    let output = `Found ${results.length} file(s) matching "${pattern}":\n`;
    output += results.map((f) => `  ${f}`).join('\n');

    if (results.length >= maxResults) {
      output += `\n\n(Results limited to ${maxResults}. Use more specific pattern to narrow down.)`;
    }

    return output;
  } catch (error) {
    const err = error as Error;
    return `Error searching files: ${err.message}`;
  }
};

/**
 * Find files by extension.
 */
export const findByExtension = async (
  extension: string,
  options: GlobOptions = {},
): Promise<string> => {
  // Normalize extension (remove leading dot if present)
  const ext = extension.startsWith('.') ? extension.slice(1) : extension;
  return globFiles(`**/*.${ext}`, options);
};

/**
 * List directory tree structure.
 */
export const directoryTree = async (
  dirPath: string = '.',
  maxDepth: number = 3,
): Promise<string> => {
  const absolutePath = path.resolve(dirPath);
  const lines: string[] = [];

  async function buildTree(dir: string, prefix: string, depth: number): Promise<void> {
    if (depth > maxDepth) {
      lines.push(`${prefix}...`);
      return;
    }

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      // Sort: directories first, then files
      entries.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

      // Filter out common ignore patterns
      const filtered = entries.filter(
        (e) => !DEFAULT_IGNORE.some((ignore) => e.name === ignore || matchPattern(e.name, ignore)),
      );

      for (let i = 0; i < filtered.length; i += 1) {
        const entry = filtered[i];
        const isLast = i === filtered.length - 1;
        const connector = isLast ? '└── ' : '├── ';
        const childPrefix = isLast ? '    ' : '│   ';

        if (entry.isDirectory()) {
          lines.push(`${prefix}${connector}${entry.name}/`);

          await buildTree(path.join(dir, entry.name), prefix + childPrefix, depth + 1);
        } else {
          lines.push(`${prefix}${connector}${entry.name}`);
        }
      }
    } catch {
      lines.push(`${prefix}[error reading directory]`);
    }
  }

  lines.push(`${path.basename(absolutePath)}/`);
  await buildTree(absolutePath, '', 1);

  return lines.join('\n');
};
