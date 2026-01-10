import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import type { ProjectIndex, Symbol, SearchResult, IndexStats, FileIndex } from './types';
import { getIndexDir } from './storage';

export class SqliteIndexManager {
  private db: Database.Database;
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    const indexDir = getIndexDir(projectRoot);

    // Ensure directory exists before creating database
    if (!fs.existsSync(indexDir)) {
      fs.mkdirSync(indexDir, { recursive: true });
    }

    const dbPath = path.join(indexDir, 'index.db');
    this.db = new Database(dbPath);
    this.initSchema();
  }

  private initSchema(): void {
    // Enable Write-Ahead Logging for better concurrent performance
    this.db.pragma('journal_mode = WAL');

    this.db.exec(`
      -- Files table
      CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL UNIQUE,
        absolute_path TEXT NOT NULL,
        size INTEGER,
        mtime REAL,
        hash TEXT,
        language TEXT,
        lines INTEGER
      );
      
      -- Symbols table
      CREATE TABLE IF NOT EXISTS symbols (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        line INTEGER,
        end_line INTEGER,
        signature TEXT,
        exported INTEGER DEFAULT 0,
        FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
      );
      
      -- Imports table
      CREATE TABLE IF NOT EXISTS imports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id INTEGER NOT NULL,
        module TEXT NOT NULL,
        FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
      );
      
      -- Exports table
      CREATE TABLE IF NOT EXISTS exports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
      );
      
      -- Metadata table
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT
      );
      
      -- Indexes for fast queries
      CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
      CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file_id);
      CREATE INDEX IF NOT EXISTS idx_symbols_type ON symbols(type);
      CREATE INDEX IF NOT EXISTS idx_symbols_exported ON symbols(exported);
      CREATE INDEX IF NOT EXISTS idx_imports_module ON imports(module);
      CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
      CREATE INDEX IF NOT EXISTS idx_files_language ON files(language);
      
      -- FTS5 virtual table for full-text search
      CREATE VIRTUAL TABLE IF NOT EXISTS symbols_fts USING fts5(
        name,
        signature,
        content=symbols,
        content_rowid=id
      );
      
      -- Triggers to keep FTS5 in sync
      CREATE TRIGGER IF NOT EXISTS symbols_ai AFTER INSERT ON symbols BEGIN
        INSERT INTO symbols_fts(rowid, name, signature)
        VALUES (new.id, new.name, new.signature);
      END;
      
      CREATE TRIGGER IF NOT EXISTS symbols_ad AFTER DELETE ON symbols BEGIN
        DELETE FROM symbols_fts WHERE rowid = old.id;
      END;
      
      CREATE TRIGGER IF NOT EXISTS symbols_au AFTER UPDATE ON symbols BEGIN
        DELETE FROM symbols_fts WHERE rowid = old.id;
        INSERT INTO symbols_fts(rowid, name, signature)
        VALUES (new.id, new.name, new.signature);
      END;
    `);
  }

  /**
   * Set a metadata value
   */
  setMetadata(key: string, value: string): void {
    const stmt = this.db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)');
    stmt.run(key, value);
  }

  /**
   * Get a metadata value
   */
  getMetadata(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM metadata WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row ? row.value : null;
  }

  /**
   * Insert a batch of file indexes
   */
  insertBatch(files: Record<string, FileIndex>): void {
    const transaction = this.db.transaction(() => {
      this.insertBatchInternal(files);
    });
    transaction();
  }

  private insertBatchInternal(files: Record<string, FileIndex>): void {
    // Insert files and symbols
    const insertFile = this.db.prepare(`
      INSERT INTO files (path, absolute_path, size, mtime, hash, language, lines)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertSymbol = this.db.prepare(`
      INSERT INTO symbols (file_id, name, type, line, end_line, signature, exported)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertImport = this.db.prepare(`
      INSERT INTO imports (file_id, module) VALUES (?, ?)
    `);

    const insertExport = this.db.prepare(`
      INSERT INTO exports (file_id, name) VALUES (?, ?)
    `);

    for (const fileIndex of Object.values(files)) {
      // Check if file already exists to avoid unique constraint error
      // Ideally we should use UPSERT or DELETE first, but for batch inserts we might assume clear/update
      // Let's use INSERT OR REPLACE for files if we want to support updates,
      // but the table schema uses AUTOINCREMENT ID, so we need to be careful.
      // If we are appending or updating, we must handle existing entries.

      // For simplicity in this optimization task:
      // We will try to DELETE existing entry for this path first to ensure clean state
      this.db.prepare('DELETE FROM files WHERE path = ?').run(fileIndex.metadata.path);

      const fileResult = insertFile.run(
        fileIndex.metadata.path,
        fileIndex.metadata.absolutePath,
        fileIndex.metadata.size,
        fileIndex.metadata.mtime,
        fileIndex.metadata.hash,
        fileIndex.metadata.language || null,
        fileIndex.metadata.lines,
      );

      const fileId = fileResult.lastInsertRowid;

      // Insert symbols
      for (const symbol of fileIndex.symbols) {
        insertSymbol.run(
          fileId,
          symbol.name,
          symbol.type,
          symbol.line,
          symbol.endLine || null,
          symbol.signature || null,
          symbol.exported ? 1 : 0,
        );
      }

      // Insert imports
      for (const imp of fileIndex.imports) {
        insertImport.run(fileId, imp);
      }

      // Insert exports
      for (const exp of fileIndex.exports) {
        insertExport.run(fileId, exp);
      }
    }
  }

  /**
   * Search symbols with scoring (fast!)
   */
  searchSymbols(query: string, limit: number = 50): SearchResult[] {
    const stmt = this.db.prepare(`
      SELECT 
        f.path,
        s.name,
        s.type,
        s.line,
        s.end_line,
        s.signature,
        s.exported,
        CASE 
          WHEN s.name = ? THEN 100
          WHEN LOWER(s.name) = LOWER(?) THEN 90
          WHEN s.name LIKE ? THEN 70
          ELSE 50
        END as score
      FROM symbols s
      JOIN files f ON s.file_id = f.id
      WHERE LOWER(s.name) LIKE LOWER(?)
      ORDER BY 
        score DESC,
        s.exported DESC,
        s.name ASC
      LIMIT ?
    `);

    const pattern = `%${query}%`;
    const startPattern = `${query}%`;

    const rows = stmt.all(query, query, startPattern, pattern, limit) as Array<{
      path: string;
      name: string;
      type: string;
      line: number;
      end_line: number | null;
      signature: string | null;
      exported: number;
      score: number;
    }>;

    return rows.map((row) => ({
      path: row.path,
      line: row.line,
      symbol: {
        name: row.name,
        type: row.type as Symbol['type'],
        line: row.line,
        endLine: row.end_line || undefined,
        signature: row.signature || undefined,
        exported: Boolean(row.exported),
      },
      score: row.score,
    }));
  }

  /**
   * Find files by path pattern
   */
  findFiles(pattern: string, limit: number = 100): string[] {
    const stmt = this.db.prepare(`
      SELECT path
      FROM files
      WHERE LOWER(path) LIKE LOWER(?)
      ORDER BY path
      LIMIT ?
    `);

    const rows = stmt.all(`%${pattern}%`, limit) as Array<{ path: string }>;
    return rows.map((row) => row.path);
  }

  /**
   * Find files by glob pattern
   */
  globFiles(pattern: string, limit: number = 1000): string[] {
    // Note: SQLite GLOB is UNIX-style case sensitive.
    // Standard glob patterns usually use ** for recursive matching, but SQLite GLOB * matches path separators
    // so it effectively acts recursively (like **) unless restricted.
    // This provides a reasonable approximation for finding files.

    const stmt = this.db.prepare(`
      SELECT path
      FROM files
      WHERE path GLOB ?
      ORDER BY path
      LIMIT ?
    `);

    const rows = stmt.all(pattern, limit) as Array<{ path: string }>;
    return rows.map((row) => row.path);
  }

  /**
   * Find files by exact filename or path suffix
   */
  findFilesByName(filename: string, limit: number = 10): string[] {
    const stmt = this.db.prepare(`
      SELECT path
      FROM files
      WHERE path = ? OR path LIKE ?
      ORDER BY path
      LIMIT ?
    `);

    // Check exact match or suffix match (ending with /filename)
    // Note: path is stored as relative path usually.
    const suffix = `%/${filename}`;
    const rows = stmt.all(filename, suffix, limit) as Array<{ path: string }>;
    return rows.map((row) => row.path);
  }

  /**
   * Get symbols in a file
   */
  getFileSymbols(filePath: string): Symbol[] {
    const stmt = this.db.prepare(`
      SELECT s.*
      FROM symbols s
      JOIN files f ON s.file_id = f.id
      WHERE f.path = ?
      ORDER BY s.line
    `);

    const rows = stmt.all(filePath) as Array<{
      name: string;
      type: string;
      line: number;
      end_line: number | null;
      signature: string | null;
      exported: number;
    }>;

    return rows.map((row) => ({
      name: row.name,
      type: row.type as Symbol['type'],
      line: row.line,
      endLine: row.end_line || undefined,
      signature: row.signature || undefined,
      exported: Boolean(row.exported),
    }));
  }

  /**
   * Find files importing a module
   */
  findImporters(moduleName: string): string[] {
    const stmt = this.db.prepare(`
      SELECT DISTINCT f.path
      FROM imports i
      JOIN files f ON i.file_id = f.id
      WHERE i.module LIKE ?
      ORDER BY f.path
    `);

    const rows = stmt.all(`%${moduleName}%`) as Array<{ path: string }>;
    return rows.map((row) => row.path);
  }

  /**
   * Get all files with metadata (for incremental updates)
   */
  getAllFiles(): Array<{ path: string; absolutePath: string; mtime: number; hash: string }> {
    const stmt = this.db.prepare(`
      SELECT path, absolute_path, mtime, hash
      FROM files
    `);

    const rows = stmt.all() as Array<{
      path: string;
      absolute_path: string;
      mtime: number;
      hash: string;
    }>;

    return rows.map((row) => ({
      path: row.path,
      absolutePath: row.absolute_path,
      mtime: row.mtime,
      hash: row.hash,
    }));
  }

  /**
   * Get all file paths (for globbing)
   */
  getAllPaths(): string[] {
    const stmt = this.db.prepare('SELECT path FROM files ORDER BY path');
    const rows = stmt.all() as Array<{ path: string }>;
    return rows.map((r) => r.path);
  }

  /**
   * Delete a file from the index
   */
  deleteFile(path: string): void {
    // Cascading deletes will handle symbols, imports, exports
    this.db.prepare('DELETE FROM files WHERE path = ?').run(path);
  }

  /**
   * Get index statistics
   */
  getStats(): IndexStats | null {
    const stats = this.db
      .prepare(
        `
      SELECT 
        (SELECT value FROM metadata WHERE key = 'total_files') as total_files,
        (SELECT value FROM metadata WHERE key = 'total_symbols') as total_symbols,
        (SELECT value FROM metadata WHERE key = 'indexed_at') as indexed_at,
        (SELECT SUM(size) FROM files) as total_size
    `,
      )
      .get() as {
      total_files: string | null;
      total_symbols: string | null;
      indexed_at: string | null;
      total_size: number | null;
    };

    if (!stats.total_files) {
      return null;
    }

    const languages = this.db
      .prepare(
        `
      SELECT language, COUNT(*) as count
      FROM files
      WHERE language IS NOT NULL
      GROUP BY language
    `,
      )
      .all() as Array<{ language: string; count: number }>;

    return {
      totalFiles: parseInt(stats.total_files),
      totalSymbols: parseInt(stats.total_symbols || '0'),
      totalSize: stats.total_size || 0,
      indexed_at: parseInt(stats.indexed_at || '0'),
      languages: Object.fromEntries(languages.map((l) => [l.language, l.count])),
      duration: 0, // Not tracked for existing index
    };
  }

  /**
   * Check if index exists and has data
   */
  hasData(): boolean {
    const result = this.db.prepare('SELECT COUNT(*) as count FROM files').get() as {
      count: number;
    };
    return result.count > 0;
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }
}
