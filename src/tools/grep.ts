import fs from 'fs/promises';
import path from 'path';

// Common patterns to ignore when searching
const DEFAULT_IGNORE = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.nuxt',
  'coverage',
  '__pycache__',
  '.pytest_cache',
  'venv',
  '.venv',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  '*.min.js',
  '*.min.css',
  '*.map',
];

// Binary file extensions to skip
const BINARY_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.bmp',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.zip',
  '.tar',
  '.gz',
  '.rar',
  '.7z',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.mp3',
  '.mp4',
  '.avi',
  '.mov',
  '.wmv',
  '.pyc',
  '.pyo',
  '.class',
];

interface GrepOptions {
  cwd?: string;
  glob?: string; // File pattern filter
  ignore?: string[]; // Additional ignore patterns
  maxResults?: number; // Max number of matches to return
  contextLines?: number; // Lines of context around matches
  caseSensitive?: boolean;
}

interface GrepMatch {
  file: string;
  line: number;
  content: string;
  context?: { before: string[]; after: string[] };
}

/**
 * Check if a file should be ignored.
 */
function shouldIgnore(filePath: string, ignorePatterns: string[]): boolean {
  const parts = filePath.split(path.sep);

  for (const pattern of ignorePatterns) {
    // Check directory names
    if (parts.some((part) => part === pattern || part.match(pattern.replace(/\*/g, '.*')))) {
      return true;
    }
  }

  return false;
}

/**
 * Check if file is binary based on extension.
 */
function isBinaryFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return BINARY_EXTENSIONS.includes(ext);
}

/**
 * Simple glob pattern matching for file filtering.
 */
function matchGlob(filePath: string, pattern: string): boolean {
  const regex = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '<<GLOBSTAR>>')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/<<GLOBSTAR>>/g, '.*');

  return new RegExp(`^${regex}$`).test(filePath);
}

/**
 * Recursively search files for a pattern.
 */
async function searchDirectory(
  dir: string,
  baseDir: string,
  pattern: RegExp,
  options: GrepOptions,
  results: GrepMatch[],
): Promise<void> {
  const maxResults = options.maxResults || 500;
  if (results.length >= maxResults) return;

  const ignorePatterns = [...DEFAULT_IGNORE, ...(options.ignore || [])];

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
        await searchDirectory(fullPath, baseDir, pattern, options, results);
      } else if (entry.isFile()) {
        // Skip binary files
        if (isBinaryFile(fullPath)) continue;

        // Apply glob filter if specified
        if (options.glob && !matchGlob(relativePath, options.glob)) {
          continue;
        }

        // Search file
        await searchFile(fullPath, relativePath, pattern, options, results, maxResults);
      }
    }
  } catch (error) {
    // Ignore permission errors
  }
}

/**
 * Search a single file for matches.
 */
async function searchFile(
  fullPath: string,
  relativePath: string,
  pattern: RegExp,
  options: GrepOptions,
  results: GrepMatch[],
  maxResults: number,
): Promise<void> {
  try {
    const content = await fs.readFile(fullPath, 'utf-8');
    const lines = content.split('\n');
    const contextLines = options.contextLines || 0;

    for (let i = 0; i < lines.length; i++) {
      if (results.length >= maxResults) break;

      if (pattern.test(lines[i])) {
        const match: GrepMatch = {
          file: relativePath,
          line: i + 1,
          content: lines[i],
        };

        // Add context if requested
        if (contextLines > 0) {
          match.context = {
            before: lines.slice(Math.max(0, i - contextLines), i),
            after: lines.slice(i + 1, Math.min(lines.length, i + 1 + contextLines)),
          };
        }

        results.push(match);
      }
    }
  } catch (error) {
    // Skip files that can't be read
  }
}

/**
 * Search files for a pattern (like grep).
 */
export const grepFiles = async (
  searchPattern: string,
  options: GrepOptions = {},
): Promise<string> => {
  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();
  const maxResults = options.maxResults || 500;

  // Build regex
  let flags = 'g';
  if (!options.caseSensitive) {
    flags += 'i';
  }

  let pattern: RegExp;
  try {
    pattern = new RegExp(searchPattern, flags);
  } catch (error) {
    return `Error: Invalid regex pattern: ${searchPattern}`;
  }

  const results: GrepMatch[] = [];

  await searchDirectory(cwd, cwd, pattern, options, results);

  if (results.length === 0) {
    return `No matches found for: ${searchPattern}`;
  }

  // Format output
  let output = `Found ${results.length} match(es) for "${searchPattern}":\n\n`;

  for (const match of results) {
    output += `${match.file}:${match.line}: ${match.content.trim()}\n`;

    if (match.context) {
      if (match.context.before.length > 0) {
        for (let i = 0; i < match.context.before.length; i++) {
          const lineNum = match.line - match.context.before.length + i;
          output += `  ${lineNum}: ${match.context.before[i]}\n`;
        }
      }
      output += `> ${match.line}: ${match.content}\n`;
      if (match.context.after.length > 0) {
        for (let i = 0; i < match.context.after.length; i++) {
          const lineNum = match.line + 1 + i;
          output += `  ${lineNum}: ${match.context.after[i]}\n`;
        }
      }
      output += '\n';
    }
  }

  if (results.length >= maxResults) {
    output += `\n(Results limited to ${maxResults}. Use more specific pattern or glob filter.)`;
  }

  return output;
};

/**
 * Count occurrences of a pattern in files.
 */
export const grepCount = async (
  searchPattern: string,
  options: GrepOptions = {},
): Promise<string> => {
  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();

  let flags = 'g';
  if (!options.caseSensitive) {
    flags += 'i';
  }

  let pattern: RegExp;
  try {
    pattern = new RegExp(searchPattern, flags);
  } catch (error) {
    return `Error: Invalid regex pattern: ${searchPattern}`;
  }

  // Set very high max results for counting
  const countOptions = { ...options, maxResults: 10000 };
  const results: GrepMatch[] = [];

  await searchDirectory(cwd, cwd, pattern, countOptions, results);

  // Group by file
  const fileCounts: Record<string, number> = {};
  for (const match of results) {
    fileCounts[match.file] = (fileCounts[match.file] || 0) + 1;
  }

  if (Object.keys(fileCounts).length === 0) {
    return `No matches found for: ${searchPattern}`;
  }

  let output = `Match counts for "${searchPattern}":\n\n`;

  const sortedFiles = Object.entries(fileCounts).sort((a, b) => b[1] - a[1]);

  for (const [file, count] of sortedFiles) {
    output += `  ${count.toString().padStart(4)} ${file}\n`;
  }

  output += `\nTotal: ${results.length} matches in ${sortedFiles.length} files`;

  return output;
};

/**
 * List files containing a pattern (like grep -l).
 */
export const grepFilesOnly = async (
  searchPattern: string,
  options: GrepOptions = {},
): Promise<string> => {
  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();

  let flags = 'g';
  if (!options.caseSensitive) {
    flags += 'i';
  }

  let pattern: RegExp;
  try {
    pattern = new RegExp(searchPattern, flags);
  } catch (error) {
    return `Error: Invalid regex pattern: ${searchPattern}`;
  }

  const results: GrepMatch[] = [];
  await searchDirectory(cwd, cwd, pattern, options, results);

  // Get unique files
  const files = [...new Set(results.map((r) => r.file))].sort();

  if (files.length === 0) {
    return `No files found containing: ${searchPattern}`;
  }

  return `Files containing "${searchPattern}":\n${files.map((f) => `  ${f}`).join('\n')}`;
};
