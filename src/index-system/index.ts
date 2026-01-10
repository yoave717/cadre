/**
 * Project indexing system for cadre
 * Provides fast file and symbol search for improved performance
 */

export { IndexManager } from './manager.js';
export {
  loadIndex,
  saveIndex,
  deleteIndex,
  listIndexedProjects,
  getIndexStats,
  clearAllIndexes,
  hashProjectPath,
} from './storage.js';
export type {
  FileMetadata,
  Symbol,
  FileIndex,
  ProjectIndex,
  IndexStats,
  SearchResult,
} from './types.js';
