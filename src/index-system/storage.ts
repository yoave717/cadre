import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import zlib from 'zlib';
import { promisify } from 'util';
import type { ProjectIndex } from './types.js';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const INDEX_DIR = path.join(os.homedir(), '.cadre', 'indexes');

/**
 * Generate a hash for a project path to use as directory name
 */
export function hashProjectPath(projectPath: string): string {
  return crypto.createHash('sha256').update(projectPath).digest('hex').slice(0, 16);
}

/**
 * Get the index directory for a project
 */
export function getIndexDir(projectPath: string): string {
  const hash = hashProjectPath(projectPath);
  return path.join(INDEX_DIR, hash);
}

/**
 * Get the index file path for a project
 */
export function getIndexFile(projectPath: string): string {
  return path.join(getIndexDir(projectPath), 'index.json');
}

/**
 * Ensure the index directory exists
 */
async function ensureIndexDir(projectPath: string): Promise<void> {
  const indexDir = getIndexDir(projectPath);
  try {
    await fs.mkdir(indexDir, { recursive: true });
  } catch {
    // Directory already exists
  }
}

/**
 * Load index from disk
 * Supports both compressed (new) and uncompressed (legacy) formats
 */
export async function loadIndex(projectPath: string): Promise<ProjectIndex | null> {
  try {
    const indexFile = getIndexFile(projectPath);
    const data = await fs.readFile(indexFile);

    // Try to decompress (new format)
    try {
      const decompressed = await gunzip(data);
      return JSON.parse(decompressed.toString('utf-8')) as ProjectIndex;
    } catch {
      // Fallback to uncompressed JSON (legacy format)
      // This provides backward compatibility with existing indexes
      return JSON.parse(data.toString('utf-8')) as ProjectIndex;
    }
  } catch {
    // Index doesn't exist or is invalid
    return null;
  }
}

/**
 * Save index to disk with gzip compression
 */
export async function saveIndex(index: ProjectIndex): Promise<void> {
  await ensureIndexDir(index.projectRoot);
  const indexFile = getIndexFile(index.projectRoot);

  // Minified JSON (no pretty print for smaller size)
  const json = JSON.stringify(index);

  // Gzip compress for 60-70% size reduction
  const compressed = await gzip(json);

  // Write compressed data
  await fs.writeFile(indexFile, compressed);
}

/**
 * Delete index for a project
 */
export async function deleteIndex(projectPath: string): Promise<void> {
  try {
    const indexDir = getIndexDir(projectPath);
    await fs.rm(indexDir, { recursive: true, force: true });
  } catch {
    // Index doesn't exist or couldn't be deleted
  }
}

/**
 * List all indexed projects
 */
export async function listIndexedProjects(): Promise<
  Array<{ path: string; hash: string; indexed_at: number }>
> {
  try {
    await fs.mkdir(INDEX_DIR, { recursive: true });
    const entries = await fs.readdir(INDEX_DIR, { withFileTypes: true });
    const projects = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        try {
          const projectPath = path.join(INDEX_DIR, entry.name);
          // Try to load JSON index
          const index = await loadIndex(projectPath);

          if (index) {
            projects.push({
              path: index.projectRoot,
              hash: entry.name,
              indexed_at: index.indexed_at,
            });
          } else {
            // Check for SQLite index
            try {
              const dbPath = path.join(projectPath, 'index.db');
              const stats = await fs.stat(dbPath);
              if (stats.isFile()) {
                // We have a DB, try to read metadata using better-sqlite3
                // Dynamic import to avoid loading native module if not needed
                const Database = (await import('better-sqlite3')).default;
                const db = new Database(dbPath, { readonly: true });

                try {
                  const meta = db
                    .prepare(
                      "SELECT value FROM metadata WHERE key IN ('project_root', 'indexed_at')",
                    )
                    .all() as Array<{ value: string }>;
                  // This returns an array of rows, we need to map them manually since the query doesn't give keys in the result row if we select only value,
                  // but we can select key, value
                  const rows = db
                    .prepare(
                      "SELECT key, value FROM metadata WHERE key IN ('project_root', 'indexed_at')",
                    )
                    .all() as Array<{ key: string; value: string }>;

                  const projectRoot = rows.find((r) => r.key === 'project_root')?.value;
                  const indexedAt = rows.find((r) => r.key === 'indexed_at')?.value;

                  if (projectRoot) {
                    projects.push({
                      path: projectRoot,
                      hash: entry.name,
                      indexed_at: indexedAt ? parseInt(indexedAt) : stats.mtimeMs,
                    });
                  }
                } finally {
                  db.close();
                }
              }
            } catch {
              // Ignore invalid SQLite DBs
            }
          }
        } catch {
          // Skip invalid indexes
        }
      }
    }

    return projects;
  } catch {
    return [];
  }
}

/**
 * Get index statistics
 */
export async function getIndexStats(projectPath: string): Promise<{
  size: number;
  files: number;
  symbols: number;
  indexed_at: number;
} | null> {
  const index = await loadIndex(projectPath);
  if (!index) return null;

  try {
    const indexFile = getIndexFile(projectPath);
    const stats = await fs.stat(indexFile);
    return {
      size: stats.size,
      files: index.totalFiles,
      symbols: index.totalSymbols,
      indexed_at: index.indexed_at,
    };
  } catch {
    return null;
  }
}

/**
 * Clear index for a specific project
 * This is the safe, default way to clear an index - it only affects the current project
 */
export async function clearProjectIndex(projectPath: string): Promise<void> {
  try {
    const indexDir = getIndexDir(projectPath);
    await fs.rm(indexDir, { recursive: true, force: true });
  } catch {
    // Index doesn't exist or couldn't be deleted
  }
}

/**
 * Clear all indexes for all projects
 * WARNING: This is a destructive operation that removes ALL project indexes
 * Use clearProjectIndex() instead for project-specific clearing
 */
export async function clearAllIndexes(): Promise<void> {
  try {
    await fs.rm(INDEX_DIR, { recursive: true, force: true });
  } catch {
    // Directory doesn't exist or couldn't be deleted
  }
}
