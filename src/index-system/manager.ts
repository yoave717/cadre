import path from 'path';
import type { ProjectIndex, FileIndex, IndexStats, SearchResult, Symbol } from './types.js';
import { loadIndex, saveIndex, hashProjectPath } from './storage.js';
import { indexDirectory, indexFile, hasFileChanged } from './file-indexer.js';

export class IndexManager {
  private projectRoot: string;
  private index: ProjectIndex | null = null;

  constructor(projectRoot: string) {
    this.projectRoot = path.resolve(projectRoot);
  }

  /**
   * Load existing index from disk
   */
  async load(): Promise<boolean> {
    this.index = await loadIndex(this.projectRoot);
    return this.index !== null;
  }

  /**
   * Build a complete index of the project
   */
  async buildIndex(): Promise<IndexStats> {
    const startTime = Date.now();

    // Index all files
    const files = await indexDirectory(this.projectRoot, this.projectRoot);

    // Calculate statistics
    let totalSymbols = 0;
    let totalSize = 0;
    const languages: Record<string, number> = {};

    for (const fileIndex of Object.values(files)) {
      totalSymbols += fileIndex.symbols.length;
      totalSize += fileIndex.metadata.size;

      if (fileIndex.metadata.language) {
        languages[fileIndex.metadata.language] =
          (languages[fileIndex.metadata.language] || 0) + 1;
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
   * Update index incrementally (only changed files)
   */
  async updateIndex(): Promise<IndexStats> {
    if (!this.index) {
      return this.buildIndex();
    }

    const startTime = Date.now();
    let filesUpdated = 0;

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
          filesUpdated++;
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
        languages[fileIndex.metadata.language] =
          (languages[fileIndex.metadata.language] || 0) + 1;
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
