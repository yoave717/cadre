/**
 * Index-aware tools for fast search and lookup
 */

import path from 'path';
import chalk from 'chalk';
import { IndexManager } from '../index-system/index';
import { IndexProgress } from '../index-system/types';
import { theme, formatSymbolType } from '../ui/colors.js';

const indexManagers = new Map<string, IndexManager>();

/**
 * Get or create index manager for a directory
 */
function getIndexManager(dir: string = process.cwd()): IndexManager {
  const root = path.resolve(dir);
  if (!indexManagers.has(root)) {
    indexManagers.set(root, new IndexManager(root));
  }
  return indexManagers.get(root)!;
}

/**
 * Update index for a single file (used by other tools)
 */
export async function updateFileIndex(filePath: string): Promise<void> {
  const absolutePath = path.resolve(filePath);
  const projectRoot = process.cwd(); // Assume CWD is project root for now

  // Only update if we have an active manager or if we want to be proactive
  const manager = getIndexManager(projectRoot);

  // Always attempt to index the file.
  // The IndexManager is initialized (DB created), so we should use it.
  await manager.indexFile(absolutePath);
}

/**
 * Search for symbols in the indexed codebase
 */
export async function searchSymbols(
  query: string,
  options: { limit?: number } = {},
): Promise<string> {
  const manager = getIndexManager();

  // Try to load existing index
  const loaded = await manager.load();

  if (!loaded) {
    return theme.warning(
      'No index found. Run the build_index tool first to create an index of your project.',
    );
  }

  const results = manager.searchSymbols(query, options.limit || 50);

  if (results.length === 0) {
    return `No symbols found matching: ${query}`;
  }

  const output: string[] = [];
  output.push(`Found ${results.length} symbol${results.length === 1 ? '' : 's'}:\n`);

  for (const result of results) {
    const { path: filePath, line, symbol } = result;
    const { color: typeColor, exportedColor } = formatSymbolType(symbol!.type, symbol!.exported);

    output.push(
      `${theme.path(filePath)}:${theme.lineNumber(line.toString())} - ${typeColor(symbol!.type)} ${theme.emphasis(symbol!.name)}${symbol!.exported ? exportedColor(' (exported)') : ''}`,
    );
    if (symbol!.signature) {
      output.push(`  ${theme.dim(symbol!.signature)}`);
    }
  }

  return output.join('\n');
}

/**
 * Find files by path or name pattern
 */
export async function findFiles(
  pattern: string,
  options: { limit?: number } = {},
): Promise<string> {
  const manager = getIndexManager();

  // Try to load existing index
  const loaded = await manager.load();

  if (!loaded) {
    return theme.warning(
      'No index found. Run the build_index tool first to create an index of your project.',
    );
  }

  const results = manager.findFiles(pattern, options.limit || 100);

  if (results.length === 0) {
    return `No files found matching: ${pattern}`;
  }

  const output: string[] = [];
  output.push(`Found ${results.length} file${results.length === 1 ? '' : 's'}:\n`);

  for (const filePath of results) {
    output.push(theme.path(filePath));
  }

  return output.join('\n');
}

/**
 * Get all file paths from index
 */
export async function getAllFilePaths(): Promise<string[]> {
  const manager = getIndexManager();
  const loaded = await manager.load();
  if (!loaded) return [];
  return manager.getAllFilePaths();
}

/**
 * Find files by name (for smart resolution)
 */
export async function findFilesByName(filename: string): Promise<string[]> {
  const manager = getIndexManager();
  const loaded = await manager.load();
  if (!loaded) return [];
  return manager.findFilesByName(filename);
}

/**
 * Build or rebuild the project index
 */
export async function buildIndex(): Promise<string> {
  const manager = getIndexManager();

  const output: string[] = [];
  const progressLines: string[] = [];

  const stats = await manager.buildIndex((progress: IndexProgress) => {
    let message = '';
    if (progress.phase === 'scanning') {
      message = 'Scanning project files...';
    } else if (progress.phase === 'indexing') {
      const percent =
        progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
      message = `Indexing files: ${progress.current}/${progress.total} (${percent}%)`;
      if (progress.currentFile) {
        message += ` - ${progress.currentFile}`;
      }
    } else if (progress.phase === 'calculating') {
      message = 'Calculating statistics...';
    } else if (progress.phase === 'saving') {
      message = 'Saving index...';
    }
    progressLines.push(message);
  });

  // Include progress in output for transparency
  if (progressLines.length > 0) {
    output.push(theme.dim('Progress:'));
    output.push(theme.dim(`  ${progressLines[0]}`)); // First (scanning)
    output.push(theme.dim(`  ${progressLines[Math.floor(progressLines.length / 2)]}`)); // Middle
    output.push(theme.dim(`  ${progressLines[progressLines.length - 1]}`)); // Last
    output.push('');
  }

  output.push(theme.success('✓ Index built successfully!\n'));
  output.push(`Files indexed: ${theme.emphasis(stats.totalFiles.toString())}`);
  output.push(`Symbols found: ${theme.emphasis(stats.totalSymbols.toString())}`);
  output.push(`Total size: ${theme.emphasis((stats.totalSize / 1024).toFixed(2))} KB`);
  output.push(`Duration: ${theme.emphasis(stats.duration.toString())} ms\n`);

  if (Object.keys(stats.languages).length > 0) {
    output.push('Languages:');
    for (const [lang, count] of Object.entries(stats.languages)) {
      output.push(`  ${lang}: ${count} files`);
    }
  }

  return output.join('\n');
}

/**
 * Update the project index (incremental)
 */
export async function updateIndex(): Promise<string> {
  const manager = getIndexManager();

  // Try to load existing index
  const loaded = await manager.load();

  if (!loaded) {
    return theme.warning('No existing index found. Use build_index to create a new index.');
  }

  const output: string[] = [];
  output.push(theme.info('Updating project index...\n'));

  const stats = await manager.updateIndex();

  output.push(theme.success('✓ Index updated successfully!\n'));
  output.push(`Files indexed: ${theme.emphasis(stats.totalFiles.toString())}`);
  output.push(`Symbols found: ${theme.emphasis(stats.totalSymbols.toString())}`);
  output.push(`Duration: ${theme.emphasis(stats.duration.toString())} ms`);

  return output.join('\n');
}

/**
 * Show index statistics
 */
export async function indexStats(): Promise<string> {
  const manager = getIndexManager();

  // Try to load existing index
  const loaded = await manager.load();

  if (!loaded) {
    return theme.warning('No index found for this project.');
  }

  const stats = manager.getStats();

  if (!stats) {
    return 'Unable to get index statistics.';
  }

  const output: string[] = [];
  output.push(theme.emphasis('Project Index Statistics\n'));
  output.push(`Total files: ${theme.info(stats.totalFiles.toString())}`);
  output.push(`Total symbols: ${theme.info(stats.totalSymbols.toString())}`);
  output.push(`Total size: ${theme.info((stats.totalSize / 1024).toFixed(2))} KB`);
  output.push(`Last indexed: ${theme.info(new Date(stats.indexed_at).toLocaleString())}\n`);

  if (Object.keys(stats.languages).length > 0) {
    output.push(theme.emphasis('Languages:'));
    for (const [lang, count] of Object.entries(stats.languages)) {
      output.push(`  ${lang}: ${count} files`);
    }
  }

  return output.join('\n');
}

/**
 * Get symbols in a specific file
 */
export async function getFileSymbols(filePath: string): Promise<string> {
  const manager = getIndexManager();

  // Try to load existing index
  const loaded = await manager.load();

  if (!loaded) {
    return theme.warning('No index found. Run the build_index tool first.');
  }

  // Convert to relative path if absolute
  const relativePath = path.isAbsolute(filePath)
    ? path.relative(process.cwd(), filePath)
    : filePath;

  const symbols = manager.getFileSymbols(relativePath);

  if (symbols.length === 0) {
    return `No symbols found in: ${filePath}`;
  }

  const output: string[] = [];
  output.push(`Symbols in ${theme.emphasis(filePath)}:\n`);

  // Group symbols by type
  const byType: Record<string, typeof symbols> = {};
  for (const symbol of symbols) {
    if (!byType[symbol.type]) {
      byType[symbol.type] = [];
    }
    byType[symbol.type].push(symbol);
  }

  for (const [type, syms] of Object.entries(byType)) {
    output.push(theme.emphasis(`${type}s:`));
    for (const symbol of syms) {
      const { exportedColor } = formatSymbolType(symbol.type, symbol.exported);
      output.push(
        `  ${theme.dim(symbol.line.toString())} ${symbol.name}${symbol.exported ? exportedColor(' (exported)') : ''}`,
      );
    }
  }

  return output.join('\n');
}

/**
 * Find files that import a specific module
 */
export async function findImporters(moduleName: string): Promise<string> {
  const manager = getIndexManager();

  // Try to load existing index
  const loaded = await manager.load();

  if (!loaded) {
    return theme.warning('No index found. Run the build_index tool first.');
  }

  const importers = manager.findImporters(moduleName);

  if (importers.length === 0) {
    return `No files found importing: ${moduleName}`;
  }

  const output: string[] = [];
  output.push(`Files importing ${theme.emphasis(moduleName)}:\n`);

  for (const filePath of importers) {
    output.push(theme.path(filePath));
  }

  return output.join('\n');
}
