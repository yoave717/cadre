import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import type { ProjectIndex } from './types.js';

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
 */
export async function loadIndex(projectPath: string): Promise<ProjectIndex | null> {
  try {
    const indexFile = getIndexFile(projectPath);
    const data = await fs.readFile(indexFile, 'utf-8');
    return JSON.parse(data) as ProjectIndex;
  } catch {
    // Index doesn't exist or is invalid
    return null;
  }
}

/**
 * Save index to disk
 */
export async function saveIndex(index: ProjectIndex): Promise<void> {
  await ensureIndexDir(index.projectRoot);
  const indexFile = getIndexFile(index.projectRoot);
  await fs.writeFile(indexFile, JSON.stringify(index, null, 2), 'utf-8');
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
export async function listIndexedProjects(): Promise<Array<{ path: string; hash: string; indexed_at: number }>> {
  try {
    await fs.mkdir(INDEX_DIR, { recursive: true });
    const entries = await fs.readdir(INDEX_DIR, { withFileTypes: true });
    const projects = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        try {
          const indexFile = path.join(INDEX_DIR, entry.name, 'index.json');
          const data = await fs.readFile(indexFile, 'utf-8');
          const index = JSON.parse(data) as ProjectIndex;
          projects.push({
            path: index.projectRoot,
            hash: entry.name,
            indexed_at: index.indexed_at,
          });
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
 * Clear all indexes
 */
export async function clearAllIndexes(): Promise<void> {
  try {
    await fs.rm(INDEX_DIR, { recursive: true, force: true });
  } catch {
    // Directory doesn't exist or couldn't be deleted
  }
}
