import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import initSqlJs from 'sql.js';

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
 * Delete index for a project
 */
export function deleteIndex(projectPath: string): Promise<void> {
  // Use clearProjectIndex implementation logic
  return clearProjectIndex(projectPath);
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

    // Initialize SQL.js once
    const SQL = await initSqlJs();

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const projectPath = path.join(INDEX_DIR, entry.name);

        // Check for index
        try {
          const dbPath = path.join(projectPath, 'index.db');
          const stats = await fs.stat(dbPath);
          if (stats.isFile()) {
            // Read file buffer
            const buffer = await fs.readFile(dbPath);
            const db = new SQL.Database(buffer);

            try {
              const stmt = db.prepare(
                "SELECT key, value FROM metadata WHERE key IN ('project_root', 'indexed_at')",
              );

              const rows: Array<{ key: string; value: string }> = [];
              while (stmt.step()) {
                const row = stmt.getAsObject();
                rows.push({ key: row.key as string, value: row.value as string });
              }
              stmt.free();

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
          // Ignore invalid DBs
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
  try {
    // Check for index
    const indexDir = getIndexDir(projectPath);
    const dbPath = path.join(indexDir, 'index.db');
    const stats = await fs.stat(dbPath);

    if (!stats.isFile()) return null;

    const SQL = await initSqlJs();
    const buffer = await fs.readFile(dbPath);
    const db = new SQL.Database(buffer);

    try {
      const stmt = db.prepare(
        "SELECT key, value FROM metadata WHERE key IN ('total_files', 'total_symbols', 'indexed_at')",
      );

      const rows: Array<{ key: string; value: string }> = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        rows.push({ key: row.key as string, value: row.value as string });
      }
      stmt.free();

      const totalFiles = rows.find((r) => r.key === 'total_files')?.value;
      const totalSymbols = rows.find((r) => r.key === 'total_symbols')?.value;
      const indexedAt = rows.find((r) => r.key === 'indexed_at')?.value;

      return {
        size: stats.size, // File size of DB
        files: totalFiles ? parseInt(totalFiles) : 0,
        symbols: totalSymbols ? parseInt(totalSymbols) : 0,
        indexed_at: indexedAt ? parseInt(indexedAt) : stats.mtimeMs,
      };
    } finally {
      db.close();
    }
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
