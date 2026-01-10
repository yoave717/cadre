/**
 * Types for the project indexing system
 */

export interface FileMetadata {
  path: string; // Relative to project root
  absolutePath: string;
  size: number;
  mtime: number; // Modified time in ms
  hash: string; // Content hash for change detection
  language?: string;
  lines: number;
}

export interface Symbol {
  name: string;
  type: 'function' | 'class' | 'interface' | 'type' | 'variable' | 'constant' | 'method';
  line: number;
  endLine?: number;
  signature?: string;
  exported?: boolean;
}

export interface FileIndex {
  metadata: FileMetadata;
  symbols: Symbol[];
  imports: string[]; // Imported modules/files
  exports: string[]; // Exported symbols
}

export interface ProjectIndex {
  version: number;
  projectRoot: string;
  projectHash: string; // Hash of project root path
  indexed_at: number; // Timestamp
  files: Record<string, FileIndex>; // path -> FileIndex
  totalFiles: number;
  totalSymbols: number;
  languages: Record<string, number>; // language -> file count
}

export interface IndexingWarning {
  file: string;
  reason: 'size' | 'lines' | 'timeout' | 'line-length' | 'regex-timeout' | 'error';
  details: string;
  timestamp: number;
}

export interface IndexingLimits {
  maxFileSize: number; // in bytes
  maxLineCount: number; // max lines per file
  maxLineLength: number; // max characters per line
  fileTimeout: number; // timeout per file in ms
  skipOnError: boolean; // skip files with errors instead of throwing
}

export interface IndexStats {
  totalFiles: number;
  totalSymbols: number;
  totalSize: number;
  languages: Record<string, number>;
  indexed_at: number;
  duration: number; // indexing duration in ms
  warnings?: IndexingWarning[]; // files that were skipped with reasons
  skipped?: number; // count of skipped files
}

export interface SearchResult {
  path: string;
  line: number;
  symbol?: Symbol;
  context?: string;
  score: number; // Relevance score
}

export interface IndexProgress {
  phase: 'scanning' | 'indexing' | 'calculating' | 'saving';
  current: number;
  total: number;
  currentFile?: string;
  message?: string;
}

export type ProgressCallback = (progress: IndexProgress) => void;
