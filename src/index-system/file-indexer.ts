import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import type { FileMetadata, FileIndex, Symbol } from './types.js';
import { extractSymbols, extractImports, extractExports, isLanguageSupported } from './symbol-extractor.js';

const DEFAULT_IGNORE = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  '.cache',
  '.ai',
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
 * Index a single file
 */
export async function indexFile(
  filePath: string,
  projectRoot: string,
): Promise<FileIndex | null> {
  try {
    // Check if file should be ignored
    const relativePath = path.relative(projectRoot, filePath);
    if (shouldIgnore(relativePath)) return null;

    // Check if file is binary
    if (isBinaryFile(filePath)) return null;

    // Get file stats
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) return null;

    // Skip files larger than 1MB for now
    if (stats.size > 1024 * 1024) return null;

    // Read file content
    const content = await fs.readFile(filePath, 'utf-8');
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
      symbols = extractSymbols(content, language);
      imports = extractImports(content, language);
      exports = extractExports(content, language);
    }

    return {
      metadata,
      symbols,
      imports,
      exports,
    };
  } catch (error) {
    // Skip files that can't be read or processed
    return null;
  }
}

/**
 * Index all files in a directory recursively
 */
export async function indexDirectory(
  dirPath: string,
  projectRoot: string,
  maxDepth: number = 10,
  currentDepth: number = 0,
): Promise<Record<string, FileIndex>> {
  const fileIndexes: Record<string, FileIndex> = {};

  if (currentDepth >= maxDepth) return fileIndexes;

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(projectRoot, fullPath);

      // Skip ignored paths
      if (shouldIgnore(relativePath)) continue;

      if (entry.isDirectory()) {
        // Recursively index subdirectory
        const subIndexes = await indexDirectory(fullPath, projectRoot, maxDepth, currentDepth + 1);
        Object.assign(fileIndexes, subIndexes);
      } else if (entry.isFile()) {
        // Index file
        const fileIndex = await indexFile(fullPath, projectRoot);
        if (fileIndex) {
          fileIndexes[relativePath] = fileIndex;
        }
      }
    }
  } catch (error) {
    // Skip directories that can't be read
  }

  return fileIndexes;
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
