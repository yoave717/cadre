import path from 'path';
import type {
  ProjectIndex,
  FileIndex,
  IndexStats,
  SearchResult,
  Symbol,
  ProgressCallback,
  IndexingLimits,
  IndexingWarning,
} from './types.js';
import { loadIndex, saveIndex, hashProjectPath } from './storage.js';
import {
  indexDirectory,
  indexFile,
  hasFileChanged,
  countFiles,
  DEFAULT_INDEXING_LIMITS,
} from './file-indexer.js';
import { SqliteIndexManager } from './sqlite-manager.js';

export class IndexManager {
  private projectRoot: string;
  private index: ProjectIndex | null = null;
  private sqlite: SqliteIndexManager | null = null;
  private useSqlite: boolean;

  constructor(projectRoot: string, options: { useSqlite?: boolean } = {}) {
    this.projectRoot = path.resolve(projectRoot);
    this.useSqlite = options.useSqlite ?? true; // Default to SQLite

    if (this.useSqlite) {
      try {
        this.sqlite = new SqliteIndexManager(this.projectRoot);
      } catch (error) {
        console.warn('Failed to initialize SQLite, falling back to JSON:', error);
        this.useSqlite = false;
      }
    }
  }

  /**
   * Load existing index from disk
   */
  async load(): Promise<boolean> {
    if (this.useSqlite && this.sqlite) {
      // Try SQLite first
      try {
        const hasData = this.sqlite.hasData();
        if (hasData) {
          return true;
        }
      } catch {
        // Fall through to JSON
      }
    }

    // Load from JSON
    this.index = await loadIndex(this.projectRoot);

    // If we have JSON but not SQLite, import to SQLite
    if (this.index && this.useSqlite && this.sqlite) {
      try {
        this.sqlite.importFromJSON(this.index);
      } catch (error) {
        console.warn('Failed to import to SQLite:', error);
      }
    }

    return this.index !== null;
  }

  /**
   * Build a complete index of the project
   */
  async buildIndex(
    progressCallback?: ProgressCallback,
    limits: IndexingLimits = DEFAULT_INDEXING_LIMITS,
  ): Promise<IndexStats> {
    const startTime = Date.now();
    const warnings: IndexingWarning[] = [];

    // Count total files first for progress tracking
    if (progressCallback) {
      progressCallback({
        phase: 'scanning',
        current: 0,
        total: 0,
        message: 'Scanning project files...',
      });
    }

    const totalFiles = await countFiles(this.projectRoot, this.projectRoot);

    if (progressCallback) {
      progressCallback({
        phase: 'indexing',
        current: 0,
        total: totalFiles,
        message: `Indexing ${totalFiles} files...`,
      });
    }

    // Index all files with progress tracking
    const progressState = { current: 0, total: totalFiles };

    // Batch for SQLite insertions
    const batch: Record<string, FileIndex> = {};
    const BATCH_SIZE = 50;

    const onFileIndexed = async (fileIndex: FileIndex) => {
      if (this.useSqlite && this.sqlite) {
        batch[fileIndex.metadata.path] = fileIndex;

        if (Object.keys(batch).length >= BATCH_SIZE) {
          try {
            this.sqlite.insertBatch(batch);
          } catch (error) {
            console.error('Failed to insert batch into SQLite:', error);
          }

          // Clear batch
          for (const key in batch) delete batch[key];
        }
      }
    };

    const files = await indexDirectory(
      this.projectRoot,
      this.projectRoot,
      10,
      0,
      progressCallback,
      progressState,
      undefined, // Default concurrency
      onFileIndexed,
      limits, // Pass indexing limits
      warnings, // Track warnings
    );

    // Flush remaining items in batch
    if (this.useSqlite && this.sqlite && Object.keys(batch).length > 0) {
      try {
        this.sqlite.insertBatch(batch);
      } catch (error) {
        console.error('Failed to insert remaining batch into SQLite:', error);
      }
    }

    // Calculate statistics
    if (progressCallback) {
      progressCallback({
        phase: 'calculating',
        current: 0,
        total: Object.keys(files).length,
        message: 'Calculating statistics...',
      });
    }

    let totalSymbols = 0;
    let totalSize = 0;
    const languages: Record<string, number> = {};

    for (const fileIndex of Object.values(files)) {
      totalSymbols += fileIndex.symbols.length;
      totalSize += fileIndex.metadata.size;

      if (fileIndex.metadata.language) {
        languages[fileIndex.metadata.language] = (languages[fileIndex.metadata.language] || 0) + 1;
      }
    }

    // Create index
    this.index = {
      version: 1,
      projectRoot: this.projectRoot,
      projectHash: hashProjectPath(this.projectRoot),
      indexed_at: Date.now(),
      files,
      totalFiles: Object.keys(files).length,
      totalSymbols,
      languages,
    };

    // Save to disk
    if (progressCallback) {
      progressCallback({
        phase: 'saving',
        current: 0,
        total: 1,
        message: 'Saving index to disk...',
      });
    }

    await saveIndex(this.index);

    const duration = Date.now() - startTime;

    return {
      totalFiles: this.index.totalFiles,
      totalSymbols,
      totalSize,
      languages,
      indexed_at: this.index.indexed_at,
      duration,
      warnings: warnings.length > 0 ? warnings : undefined,
      skipped: warnings.length,
    };
  }

  /**
   * Update index incrementally (only changed files)
   */
  async updateIndex(): Promise<IndexStats> {
    if (!this.index) {
      return this.buildIndex();
    }

    const startTime = Date.now();

    // Check each indexed file for changes
    for (const [relativePath, fileIndex] of Object.entries(this.index.files)) {
      const absolutePath = path.join(this.projectRoot, relativePath);
      const changed = await hasFileChanged(
        absolutePath,
        fileIndex.metadata.mtime,
        fileIndex.metadata.hash,
      );

      if (changed) {
        const newIndex = await indexFile(absolutePath, this.projectRoot);
        if (newIndex) {
          this.index.files[relativePath] = newIndex;
        } else {
          // File was deleted or is now ignored
          delete this.index.files[relativePath];
        }
      }
    }

    // Recalculate statistics
    let totalSymbols = 0;
    let totalSize = 0;
    const languages: Record<string, number> = {};

    for (const fileIndex of Object.values(this.index.files)) {
      totalSymbols += fileIndex.symbols.length;
      totalSize += fileIndex.metadata.size;

      if (fileIndex.metadata.language) {
        languages[fileIndex.metadata.language] = (languages[fileIndex.metadata.language] || 0) + 1;
      }
    }

    this.index.totalFiles = Object.keys(this.index.files).length;
    this.index.totalSymbols = totalSymbols;
    this.index.languages = languages;
    this.index.indexed_at = Date.now();

    // Save updated index
    await saveIndex(this.index);

    const duration = Date.now() - startTime;

    return {
      totalFiles: this.index.totalFiles,
      totalSymbols,
      totalSize,
      languages,
      indexed_at: this.index.indexed_at,
      duration,
    };
  }

  /**
   * Search for symbols by name
   */
  searchSymbols(query: string, limit: number = 50): SearchResult[] {
    // Use SQLite if available
    if (this.useSqlite && this.sqlite) {
      return this.sqlite.searchSymbols(query, limit);
    }

    // Fallback to JSON search
    if (!this.index) return [];

    const results: SearchResult[] = [];
    const queryLower = query.toLowerCase();

    for (const [filePath, fileIndex] of Object.entries(this.index.files)) {
      for (const symbol of fileIndex.symbols) {
        const nameLower = symbol.name.toLowerCase();

        // Calculate relevance score
        let score = 0;

        // Exact match gets highest score
        if (symbol.name === query) {
          score = 100;
        }
        // Case-insensitive exact match
        else if (nameLower === queryLower) {
          score = 90;
        }
        // Starts with query
        else if (nameLower.startsWith(queryLower)) {
          score = 70;
        }
        // Contains query
        else if (nameLower.includes(queryLower)) {
          score = 50;
        }
        // Skip if no match
        else {
          continue;
        }

        // Boost exported symbols
        if (symbol.exported) {
          score += 10;
        }

        results.push({
          path: filePath,
          line: symbol.line,
          symbol,
          score,
        });
      }
    }

    // Sort by score (descending) and limit results
    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Find files by path pattern
   */
  findFiles(pattern: string, limit: number = 100): string[] {
    // Use SQLite if available
    if (this.useSqlite && this.sqlite) {
      return this.sqlite.findFiles(pattern, limit);
    }

    // Fallback to JSON search
    if (!this.index) return [];

    const results: string[] = [];
    const patternLower = pattern.toLowerCase();

    for (const filePath of Object.keys(this.index.files)) {
      const filePathLower = filePath.toLowerCase();

      if (
        filePathLower.includes(patternLower) ||
        path.basename(filePathLower).includes(patternLower)
      ) {
        results.push(filePath);

        if (results.length >= limit) break;
      }
    }

    return results;
  }

  /**
   * Get all symbols in a file
   */
  getFileSymbols(filePath: string): Symbol[] {
    // Use SQLite if available
    if (this.useSqlite && this.sqlite) {
      return this.sqlite.getFileSymbols(filePath);
    }

    // Fallback to JSON
    if (!this.index) return [];

    const fileIndex = this.index.files[filePath];
    return fileIndex ? fileIndex.symbols : [];
  }

  /**
   * Get file metadata
   */
  getFileMetadata(filePath: string): FileIndex | null {
    if (!this.index) return null;

    return this.index.files[filePath] || null;
  }

  /**
   * Get all files for a specific language
   */
  getFilesByLanguage(language: string): string[] {
    if (!this.index) return [];

    const files: string[] = [];

    for (const [filePath, fileIndex] of Object.entries(this.index.files)) {
      if (fileIndex.metadata.language === language) {
        files.push(filePath);
      }
    }

    return files;
  }

  /**
   * Find files that import a specific module
   */
  findImporters(moduleName: string): string[] {
    // Use SQLite if available
    if (this.useSqlite && this.sqlite) {
      return this.sqlite.findImporters(moduleName);
    }

    // Fallback to JSON
    if (!this.index) return [];

    const importers: string[] = [];

    for (const [filePath, fileIndex] of Object.entries(this.index.files)) {
      if (fileIndex.imports.some((imp) => imp.includes(moduleName))) {
        importers.push(filePath);
      }
    }

    return importers;
  }

  /**
   * Get index statistics
   */
  getStats(): IndexStats | null {
    // Use SQLite if available
    if (this.useSqlite && this.sqlite) {
      return this.sqlite.getStats();
    }

    // Fallback to JSON
    if (!this.index) return null;

    let totalSize = 0;
    for (const fileIndex of Object.values(this.index.files)) {
      totalSize += fileIndex.metadata.size;
    }

    return {
      totalFiles: this.index.totalFiles,
      totalSymbols: this.index.totalSymbols,
      totalSize,
      languages: this.index.languages,
      indexed_at: this.index.indexed_at,
      duration: 0, // Not tracked for existing index
    };
  }

  /**
   * Check if index exists and is loaded
   */
  isLoaded(): boolean {
    return this.index !== null;
  }

  /**
   * Get the current index (read-only)
   */
  getIndex(): ProjectIndex | null {
    return this.index;
  }
}
