import initSqlJs, { Database, Statement } from 'sql.js';
import path from 'path';
import fs from 'fs';
import type { Symbol, SearchResult, IndexStats, FileIndex } from './types.js';
import { getIndexDir } from './storage.js';

export class IndexDatabase {
  private db: Database | null = null;
  private projectRoot: string;
  private dbPath: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    const indexDir = getIndexDir(projectRoot);
    this.dbPath = path.join(indexDir, 'index.db');
  }

  /**
   * Initialize the database asynchronously
   */
  async init(): Promise<void> {
    const SQL = await initSqlJs();

    // Ensure directory exists
    const indexDir = path.dirname(this.dbPath);
    if (!fs.existsSync(indexDir)) {
      fs.mkdirSync(indexDir, { recursive: true });
    }

    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(buffer);
    } else {
      this.db = new SQL.Database();
      this.initSchema();
    }
  }

  private initSchema(): void {
    if (!this.db) throw new Error('Database not initialized');

    // FTS5 is not available in standard sql.js build usually, or creates issues.
    // We removed FTS5 usage as per plan.

    this.db.run(`
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
    `);

    this.save();
  }

  /**
   * Save database to disk
   */
  save(): void {
    if (!this.db) return;
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
  }

  /**
   * Set a metadata value
   */
  setMetadata(key: string, value: string): void {
    if (!this.db) throw new Error('Database not initialized');
    this.db.run('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)', [key, value]);
    this.save();
  }

  /**
   * Get a metadata value
   */
  getMetadata(key: string): string | null {
    if (!this.db) throw new Error('Database not initialized');
    const stmt = this.db.prepare('SELECT value FROM metadata WHERE key = ?');
    stmt.bind([key]);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return row.value as string;
    }
    stmt.free();
    return null;
  }

  /**
   * Insert a batch of file indexes
   */
  insertBatch(files: Record<string, FileIndex>): void {
    if (!this.db) throw new Error('Database not initialized');

    // sql.js doesn't support explicit transactions in the same way, but we can wrap in BEGIN/COMMIT
    this.db.run('BEGIN TRANSACTION');

    try {
      this.insertBatchInternal(files);
      this.db.run('COMMIT');
      this.save();
    } catch (err) {
      this.db.run('ROLLBACK');
      throw err;
    }
  }

  private insertBatchInternal(files: Record<string, FileIndex>): void {
    if (!this.db) return;

    for (const fileIndex of Object.values(files)) {
      // Delete existing entry
      this.db.run('DELETE FROM files WHERE path = ?', [fileIndex.metadata.path]);

      this.db.run(
        `INSERT INTO files (path, absolute_path, size, mtime, hash, language, lines)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          fileIndex.metadata.path,
          fileIndex.metadata.absolutePath,
          fileIndex.metadata.size,
          fileIndex.metadata.mtime,
          fileIndex.metadata.hash,
          fileIndex.metadata.language || null,
          fileIndex.metadata.lines,
        ],
      );

      // Get last insert ID
      const res = this.db.exec('SELECT last_insert_rowid()');
      const fileId = res[0].values[0][0] as number;

      // Insert symbols
      for (const symbol of fileIndex.symbols) {
        this.db.run(
          `INSERT INTO symbols (file_id, name, type, line, end_line, signature, exported)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            fileId,
            symbol.name,
            symbol.type,
            symbol.line,
            symbol.endLine || null,
            symbol.signature || null,
            symbol.exported ? 1 : 0,
          ],
        );
      }

      // Insert imports
      for (const imp of fileIndex.imports) {
        this.db.run('INSERT INTO imports (file_id, module) VALUES (?, ?)', [fileId, imp]);
      }

      // Insert exports
      for (const exp of fileIndex.exports) {
        this.db.run('INSERT INTO exports (file_id, name) VALUES (?, ?)', [fileId, exp]);
      }
    }
  }

  /**
   * Search symbols with scoring (fast!)
   */
  searchSymbols(query: string, limit: number = 50): SearchResult[] {
    if (!this.db) return [];

    const pattern = `%${query}%`;
    const startPattern = `${query}%`;

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

    stmt.bind([query, query, startPattern, pattern, limit]);

    const results: SearchResult[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      results.push({
        path: row.path as string,
        line: row.line as number,
        symbol: {
          name: row.name as string,
          type: row.type as Symbol['type'],
          line: row.line as number,
          endLine: (row.end_line as number) || undefined,
          signature: (row.signature as string) || undefined,
          exported: Boolean(row.exported),
        },
        score: row.score as number,
      });
    }
    stmt.free();

    return results;
  }

  /**
   * Find files by path pattern
   */
  findFiles(pattern: string, limit: number = 100): string[] {
    if (!this.db) return [];

    const stmt = this.db.prepare(`
      SELECT path
      FROM files
      WHERE LOWER(path) LIKE LOWER(?)
      ORDER BY path
      LIMIT ?
    `);

    stmt.bind([`%${pattern}%`, limit]);

    const paths: string[] = [];
    while (stmt.step()) {
      paths.push(stmt.getAsObject().path as string);
    }
    stmt.free();

    return paths;
  }

  /**
   * Find files by glob pattern
   */
  globFiles(pattern: string, limit: number = 1000): string[] {
    if (!this.db) return [];

    const stmt = this.db.prepare(`
      SELECT path
      FROM files
      WHERE path GLOB ?
      ORDER BY path
      LIMIT ?
    `);

    stmt.bind([pattern, limit]);

    const paths: string[] = [];
    while (stmt.step()) {
      paths.push(stmt.getAsObject().path as string);
    }
    stmt.free();

    return paths;
  }

  /**
   * Find files by exact filename or path suffix
   */
  findFilesByName(filename: string, limit: number = 10): string[] {
    if (!this.db) return [];

    const stmt = this.db.prepare(`
      SELECT path
      FROM files
      WHERE path = ? OR path LIKE ?
      ORDER BY path
      LIMIT ?
    `);

    const suffix = `%/${filename}`;
    stmt.bind([filename, suffix, limit]);

    const paths: string[] = [];
    while (stmt.step()) {
      paths.push(stmt.getAsObject().path as string);
    }
    stmt.free();

    return paths;
  }

  /**
   * Get symbols in a file
   */
  getFileSymbols(filePath: string): Symbol[] {
    if (!this.db) return [];

    const stmt = this.db.prepare(`
      SELECT s.*
      FROM symbols s
      JOIN files f ON s.file_id = f.id
      WHERE f.path = ?
      ORDER BY s.line
    `);

    stmt.bind([filePath]);

    const symbols: Symbol[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      symbols.push({
        name: row.name as string,
        type: row.type as Symbol['type'],
        line: row.line as number,
        endLine: (row.end_line as number) || undefined,
        signature: (row.signature as string) || undefined,
        exported: Boolean(row.exported),
      });
    }
    stmt.free();

    return symbols;
  }

  /**
   * Find files importing a module
   */
  findImporters(moduleName: string): string[] {
    if (!this.db) return [];

    const stmt = this.db.prepare(`
      SELECT DISTINCT f.path
      FROM imports i
      JOIN files f ON i.file_id = f.id
      WHERE i.module LIKE ?
      ORDER BY f.path
    `);

    stmt.bind([`%${moduleName}%`]);

    const paths: string[] = [];
    while (stmt.step()) {
      paths.push(stmt.getAsObject().path as string);
    }
    stmt.free();

    return paths;
  }

  /**
   * Get all files with metadata (for incremental updates)
   */
  getAllFiles(): Array<{ path: string; absolutePath: string; mtime: number; hash: string }> {
    if (!this.db) return [];

    const stmt = this.db.prepare(`
      SELECT path, absolute_path, mtime, hash
      FROM files
    `);

    const files: Array<{ path: string; absolutePath: string; mtime: number; hash: string }> = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      files.push({
        path: row.path as string,
        absolutePath: row.absolute_path as string,
        mtime: row.mtime as number,
        hash: row.hash as string,
      });
    }
    stmt.free();

    return files;
  }

  /**
   * Get all file paths (for globbing)
   */
  getAllPaths(): string[] {
    if (!this.db) return [];

    const stmt = this.db.prepare('SELECT path FROM files ORDER BY path');
    const paths: string[] = [];
    while (stmt.step()) {
      paths.push(stmt.getAsObject().path as string);
    }
    stmt.free();

    return paths;
  }

  /**
   * Delete a file from the index
   */
  deleteFile(path: string): void {
    if (!this.db) return;
    this.db.run('DELETE FROM files WHERE path = ?', [path]);
    this.save();
  }

  /**
   * Get index statistics
   */
  getStats(): IndexStats | null {
    if (!this.db) return null;

    // We need to fetch values individually as subqueries in SELECT clause
    // works fine but we need to handle result format.
    // Simpler to just query metadata directly or use the complex query.
    // sql.js exec returns [{columns:[], values:[[]]}]

    const metaParams = ['total_files', 'total_symbols', 'indexed_at'];
    const metaValues: Record<string, string> = {};

    for (const key of metaParams) {
      const stmt = this.db.prepare('SELECT value FROM metadata WHERE key = ?');
      stmt.bind([key]);
      if (stmt.step()) {
        metaValues[key] = stmt.getAsObject().value as string;
      }
      stmt.free();
    }

    // Get total size
    const sizeRes = this.db.exec('SELECT SUM(size) FROM files');
    const totalSize = (sizeRes[0]?.values[0]?.[0] as number) || 0;

    if (!metaValues.total_files) {
      return null;
    }

    // Get languages
    const langStmt = this.db.prepare(`
      SELECT language, COUNT(*) as count
      FROM files
      WHERE language IS NOT NULL
      GROUP BY language
    `);

    const languages: Record<string, number> = {};
    while (langStmt.step()) {
      const row = langStmt.getAsObject();
      languages[row.language as string] = row.count as number;
    }
    langStmt.free();

    return {
      totalFiles: parseInt(metaValues.total_files),
      totalSymbols: parseInt(metaValues.total_symbols || '0'),
      totalSize: totalSize,
      indexed_at: parseInt(metaValues.indexed_at || '0'),
      languages,
      duration: 0,
    };
  }

  /**
   * Check if index exists and has data
   */
  hasData(): boolean {
    if (!this.db) return false;
    try {
      const res = this.db.exec('SELECT COUNT(*) as count FROM files');
      return (res[0]?.values[0]?.[0] as number) > 0;
    } catch {
      return false;
    }
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
