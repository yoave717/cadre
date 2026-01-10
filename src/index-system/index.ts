/**
 * Project indexing system for cadre
 * Provides fast file and symbol search for improved performance
 */

export { IndexManager } from './manager';
export { SqliteIndexManager } from './sqlite-manager';
export {
  deleteIndex,
  listIndexedProjects,
  getIndexStats,
  clearAllIndexes,
  clearProjectIndex,
  hashProjectPath,
} from './storage';
export type {
  FileMetadata,
  Symbol,
  FileIndex,
  ProjectIndex,
  IndexStats,
  SearchResult,
  IndexingLimits,
  IndexingWarning,
} from './types';
