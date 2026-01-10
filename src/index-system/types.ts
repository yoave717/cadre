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

export interface IndexStats {
  totalFiles: number;
  totalSymbols: number;
  totalSize: number;
  languages: Record<string, number>;
  indexed_at: number;
  duration: number; // indexing duration in ms
}

export interface SearchResult {
  path: string;
  line: number;
  symbol?: Symbol;
  context?: string;
  score: number; // Relevance score
}
