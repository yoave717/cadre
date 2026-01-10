import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import type {
  FileMetadata,
  FileIndex,
  Symbol,
  ProgressCallback,
  IndexingLimits,
  IndexingWarning,
} from './types.js';
import {
  extractSymbols,
  extractImports,
  extractExports,
  isLanguageSupported,
} from './symbol-extractor.js';
import os from 'os';

const DEFAULT_IGNORE = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  '.cache',
  '.cadre',
  'vendor',
  'target',
  'bin',
  'obj',
  '__pycache__',
  '.venv',
  'venv',
  '.pytest_cache',
  '.mypy_cache',
  '.tox',
  '.eggs',
  '*.egg-info',
  '.DS_Store',
  'thumbs.db',
];

const LANGUAGE_MAP: Record<string, string> = {
  ts: 'TypeScript',
  tsx: 'TypeScript',
  js: 'JavaScript',
  jsx: 'JavaScript',
  cjs: 'JavaScript',
  mjs: 'JavaScript',
  py: 'Python',
  go: 'Go',
  rs: 'Rust',
  java: 'Java',
  rb: 'Ruby',
  c: 'C',
  cpp: 'C++',
  cc: 'C++',
  h: 'C/C++',
  hpp: 'C++',
  cs: 'C#',
  php: 'PHP',
  swift: 'Swift',
  kt: 'Kotlin',
};

const BINARY_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'bmp',
  'ico',
  'svg',
  'webp',
  'pdf',
  'zip',
  'tar',
  'gz',
  'rar',
  '7z',
  'exe',
  'dll',
  'so',
  'dylib',
  'wasm',
  'bin',
  'dat',
  'db',
  'sqlite',
]);

/**
 * Default limits for defensive indexing
 */
export const DEFAULT_INDEXING_LIMITS: IndexingLimits = {
  maxFileSize: 1024 * 1024, // 1MB
  maxLineCount: 10000, // 10k lines
  maxLineLength: 10000, // 10k chars per line
  fileTimeout: 5000, // 5 seconds per file
  skipOnError: true,
};

/**
 * Simple concurrency limiter
 */
/**
 * Simple concurrency limiter (Iterative approach to avoid recursion depth issues)
 */
const limitConcurrency = async <T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> => {
  const executing: Promise<void>[] = [];

  for (const item of items) {
    const p = Promise.resolve().then(() => fn(item));
    executing.push(p);

    // Remove from executing list when done
    const clean = () => {
      const idx = executing.indexOf(p);
      if (idx !== -1) executing.splice(idx, 1);
    };
    p.then(clean).catch(clean);

    if (executing.length >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
};

/**
 * Timeout wrapper for async operations
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operationName: string,
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout;
  let warnHandle: NodeJS.Timeout;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`Timeout: ${operationName} exceeded ${timeoutMs}ms`));
    }, timeoutMs);
  });

  // Warn if taking more than 2 seconds (soft warning)
  warnHandle = setTimeout(() => {
    // Check if we are still pending (implicitly, since this runs)
    // Only log if timeoutMs is significantly larger than 2s to avoid double noise
    if (timeoutMs > 2000) {
      // Using console.error to bypass progress line clearing if possible, or just force newline
      process.stdout.write(
        `\n[WARN] Slow operation detected: ${operationName} (running for >2s)\n`,
      );
    }
  }, 2000);

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutHandle!);
    clearTimeout(warnHandle!);
    return result;
  } catch (error) {
    clearTimeout(timeoutHandle!);
    clearTimeout(warnHandle!);
    throw error;
  }
}

/**
 * Validate file content against limits
 */
function validateFileContent(
  content: string,
  filePath: string,
  limits: IndexingLimits,
): { valid: boolean; reason?: string; details?: string } {
  const lines = content.split('\n');

  // Check line count
  if (lines.length > limits.maxLineCount) {
    return {
      valid: false,
      reason: 'lines',
      details: `Exceeded max line count (${lines.length} > ${limits.maxLineCount})`,
    };
  }

  // Check max line length
  const maxLineLen = Math.max(...lines.map((l) => l.length));
  if (maxLineLen > limits.maxLineLength) {
    return {
      valid: false,
      reason: 'line-length',
      details: `Line too long (${maxLineLen} > ${limits.maxLineLength} chars)`,
    };
  }

  return { valid: true };
}

/**
 * Calculate hash of file content
 */
async function hashFile(filePath: string): Promise<string> {
  try {
    const content = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
  } catch {
    return '';
  }
}

/**
 * Check if a file should be ignored
 */
function shouldIgnore(relativePath: string): boolean {
  const parts = relativePath.split(path.sep);

  // Check each part against ignore patterns
  for (const part of parts) {
    if (DEFAULT_IGNORE.includes(part)) return true;

    // Handle wildcard patterns
    for (const pattern of DEFAULT_IGNORE) {
      if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        if (regex.test(part)) return true;
      }
    }
  }

  return false;
}

/**
 * Check if a file is binary
 */
function isBinaryFile(filePath: string): boolean {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

/**
 * Get language from file extension
 */
function getLanguage(filePath: string): string | undefined {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return LANGUAGE_MAP[ext];
}

/**
 * Index a single file with defensive safeguards
 */
export async function indexFile(
  filePath: string,
  projectRoot: string,
  limits: IndexingLimits = DEFAULT_INDEXING_LIMITS,
  warnings?: IndexingWarning[],
): Promise<FileIndex | null> {
  const relativePath = path.relative(projectRoot, filePath);

  try {
    // Wrap entire operation in timeout
    return await withTimeout(
      indexFileUnsafe(filePath, projectRoot, limits, warnings),
      limits.fileTimeout,
      `Indexing ${relativePath}`,
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Timeout:')) {
      // Log timeout warning
      if (warnings) {
        warnings.push({
          file: relativePath,
          reason: 'timeout',
          details: `File indexing timed out after ${limits.fileTimeout}ms`,
          timestamp: Date.now(),
        });
      }
      return null;
    }

    if (limits.skipOnError) {
      if (warnings) {
        warnings.push({
          file: relativePath,
          reason: 'error',
          details: error instanceof Error ? error.message : 'Unknown error',
          timestamp: Date.now(),
        });
      }
      return null;
    }

    throw error;
  }
}

/**
 * Internal file indexing implementation (without timeout wrapper)
 */
async function indexFileUnsafe(
  filePath: string,
  projectRoot: string,
  limits: IndexingLimits,
  warnings?: IndexingWarning[],
): Promise<FileIndex | null> {
  const relativePath = path.relative(projectRoot, filePath);

  // Check if file should be ignored
  if (shouldIgnore(relativePath)) return null;

  // Check if file is binary
  if (isBinaryFile(filePath)) return null;

  // Get file stats
  const stats = await fs.stat(filePath);
  if (!stats.isFile()) return null;

  // Check file size
  if (stats.size > limits.maxFileSize) {
    if (warnings) {
      warnings.push({
        file: relativePath,
        reason: 'size',
        details: `File too large (${stats.size} > ${limits.maxFileSize} bytes)`,
        timestamp: Date.now(),
      });
    }
    return null;
  }

  // Read file content
  const content = await fs.readFile(filePath, 'utf-8');

  // Validate content
  const validation = validateFileContent(content, filePath, limits);
  if (!validation.valid) {
    if (warnings) {
      warnings.push({
        file: relativePath,
        reason: validation.reason as IndexingWarning['reason'],
        details: validation.details || 'Validation failed',
        timestamp: Date.now(),
      });
    }
    return null;
  }

  const lines = content.split('\n').length;

  // Calculate hash
  const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);

  // Get language
  const language = getLanguage(filePath);

  // Create metadata
  const metadata: FileMetadata = {
    path: relativePath,
    absolutePath: filePath,
    size: stats.size,
    mtime: stats.mtimeMs,
    hash,
    language,
    lines,
  };

  // Extract symbols if language is supported
  let symbols: Symbol[] = [];
  let imports: string[] = [];
  let exports: string[] = [];

  if (language && isLanguageSupported(language)) {
    try {
      symbols = extractSymbols(content, language);
      imports = extractImports(content, language);
      exports = extractExports(content, language);
    } catch (error) {
      // If symbol extraction fails, log but continue with empty results
      if (warnings) {
        warnings.push({
          file: relativePath,
          reason: 'regex-timeout',
          details:
            'Symbol extraction failed: ' +
            (error instanceof Error ? error.message : 'Unknown error'),
          timestamp: Date.now(),
        });
      }
    }
  }

  return {
    metadata,
    symbols,
    imports,
    exports,
  };
}

/**
 * Count total files to be indexed (for progress tracking)
 */
export async function countFiles(
  dirPath: string,
  projectRoot: string,
  maxDepth: number = 10,
  currentDepth: number = 0,
): Promise<number> {
  let count = 0;

  if (currentDepth >= maxDepth) return count;

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(projectRoot, fullPath);

      // Skip ignored paths
      if (shouldIgnore(relativePath)) continue;

      if (entry.isDirectory()) {
        count += await countFiles(fullPath, projectRoot, maxDepth, currentDepth + 1);
      } else if (entry.isFile() && !isBinaryFile(fullPath)) {
        count++;
      }
    }
  } catch {
    // Skip directories that can't be read
  }

  return count;
}

/**
 * Collect all files to be indexed recursively
 */
async function collectFiles(
  dirPath: string,
  projectRoot: string,
  maxDepth: number,
  currentDepth: number,
  files: string[],
  visited: Set<string>,
) {
  if (currentDepth >= maxDepth) return;

  try {
    // Resolve real path to detect loops
    const realPath = await fs.realpath(dirPath);
    if (visited.has(realPath)) return;
    visited.add(realPath);

    const entries = await fs.readdir(realPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(realPath, entry.name);

      // Calculate relative path from project root for ignore checking
      // Note: fullPath is now based on realPath, which might be outside projectRoot if we followed a symlink
      // So we should be careful.
      // If we strictly don't want to follow symlinks out of project, we should check that.
      // But for now, let's just stick to preventing loops.
      const relativePath = path.relative(projectRoot, fullPath);

      // Skip ignored paths
      if (shouldIgnore(relativePath)) continue;

      if (entry.isDirectory()) {
        await collectFiles(fullPath, projectRoot, maxDepth, currentDepth + 1, files, visited);
      } else if (entry.isFile() && !isBinaryFile(fullPath)) {
        files.push(fullPath);
      }
    }
  } catch {
    // Skip directories that can't be read
  }
}

/**
 * Index all files in a directory recursively
 * Uses parallel processing for performance
 */
/**
 * Scan directory recursively to get all files (without indexing)
 */
export async function scanDirectory(
  dirPath: string,
  projectRoot: string,
  maxDepth: number = 10,
): Promise<string[]> {
  const files: string[] = [];
  const visited = new Set<string>();
  await collectFiles(dirPath, projectRoot, maxDepth, 0, files, visited);
  return files;
}

/**
 * Index a specific list of files
 */
export async function indexFiles(
  files: string[],
  projectRoot: string,
  progressCallback?: ProgressCallback,
  progressState?: { current: number; total: number },
  concurrency: number = os.cpus().length,
  onFileIndexed?: (file: FileIndex) => Promise<void> | void,
  limits: IndexingLimits = DEFAULT_INDEXING_LIMITS,
  warnings?: IndexingWarning[],
): Promise<Record<string, FileIndex>> {
  const fileIndexes: Record<string, FileIndex> = {};

  await limitConcurrency(files, concurrency, async (fullPath) => {
    const relativePath = path.relative(projectRoot, fullPath);

    // Index file with defensive limits and warning tracking
    const fileIndex = await indexFile(fullPath, projectRoot, limits, warnings);

    if (fileIndex) {
      fileIndexes[relativePath] = fileIndex;

      if (onFileIndexed) {
        await onFileIndexed(fileIndex);
      }
    }

    // Report progress
    if (progressCallback && progressState) {
      progressState.current++;
      progressCallback({
        phase: 'indexing',
        current: progressState.current,
        total: progressState.total,
        currentFile: relativePath,
      });
    }
  });

  return fileIndexes;
}

/**
 * Index all files in a directory recursively
 * Uses parallel processing for performance
 */
export async function indexDirectory(
  dirPath: string,
  projectRoot: string,
  maxDepth: number = 10,
  _currentDepth: number = 0, // Kept for signature compatibility, unused in new impl
  progressCallback?: ProgressCallback,
  progressState?: { current: number; total: number },
  concurrency: number = os.cpus().length, // Default to CPU count
  onFileIndexed?: (file: FileIndex) => Promise<void> | void,
  limits: IndexingLimits = DEFAULT_INDEXING_LIMITS,
  warnings?: IndexingWarning[],
): Promise<Record<string, FileIndex>> {
  // Step 1: Collect files
  const files = await scanDirectory(dirPath, projectRoot, maxDepth);

  // Step 2: Index files
  return indexFiles(
    files,
    projectRoot,
    progressCallback,
    progressState,
    concurrency,
    onFileIndexed,
    limits,
    warnings,
  );
}

/**
 * Check if a file has changed since last index
 */
export async function hasFileChanged(
  filePath: string,
  lastMtime: number,
  lastHash: string,
): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath);

    // Check mtime first (faster)
    if (stats.mtimeMs !== lastMtime) {
      // Verify with hash to avoid false positives
      const currentHash = await hashFile(filePath);
      return currentHash !== lastHash;
    }

    return false;
  } catch {
    // File doesn't exist or can't be read - consider it changed
    return true;
  }
}
