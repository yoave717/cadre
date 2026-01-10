import fs from 'fs/promises';
import path from 'path';

import { getPermissionManager } from '../permissions/index.js';

// Track which files have been read in this session (for safety)
const readFiles: Set<string> = new Set();

export const listFiles = async (dirPath: string = '.'): Promise<string> => {
  try {
    const absolutePath = path.resolve(dirPath);
    const entries = await fs.readdir(absolutePath, { withFileTypes: true });

    const formatted = entries.map((entry) => {
      const prefix = entry.isDirectory() ? '[DIR] ' : '[FILE]';
      return `${prefix} ${entry.name}`;
    });

    return `Contents of ${absolutePath}:\n${formatted.join('\n')}`;
  } catch (error) {
    const err = error as Error;
    return `Error listing files: ${err.message}`;
  }
};

export const readFile = async (
  filePath: string,
  offset?: number,
  limit?: number,
): Promise<string> => {
  try {
    const absolutePath = path.resolve(filePath);

    // Track that this file was read
    readFiles.add(absolutePath);

    // If no offset/limit, use fast path (standard readFile)
    if (offset === undefined && limit === undefined) {
      const content = await fs.readFile(absolutePath, 'utf-8');
      const lines = content.split('\n');

      // Truncate if too large (default safety)
      if (lines.length > 2000) {
        const numbered = lines
          .slice(0, 2000)
          .map((line, i) => `${String(i + 1).padStart(4)}│ ${line}`);
        return `${numbered.join('\n')}\n... (truncated, ${lines.length - 2000} more lines. Use offset/limit to read more)`;
      }

      const numbered = lines.map((line, i) => `${String(i + 1).padStart(4)}│ ${line}`);
      return numbered.join('\n');
    }

    // Streaming path for partial reads
    const fileStream = (await import('fs')).createReadStream(absolutePath, { encoding: 'utf-8' });
    const rl = (await import('readline')).createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    const lines: string[] = [];
    let lineCount = 0;
    const startLine = offset || 0;
    const endLine = startLine + (limit || Number.MAX_SAFE_INTEGER);

    for await (const line of rl) {
      if (lineCount >= startLine) {
        lines.push(`${String(lineCount + 1).padStart(4)}│ ${line}`);
      }

      lineCount++;

      if (lineCount >= endLine) {
        break;
      }
    }

    // Clean up
    rl.close();
    fileStream.destroy();

    if (lines.length === 0 && lineCount > 0) {
      return `File has ${lineCount} lines. Requested range ${startLine}-${endLine} is out of bounds.`;
    }

    return lines.join('\n');
  } catch (error) {
    const err = error as Error & { code?: string };

    // Smart Resolution: If file not found, try to find it in the index
    if (err.code === 'ENOENT') {
      try {
        // Dynamic import to avoid circular dependency
        const { findFilesByName } = await import('./index.js');
        const basename = path.basename(filePath);

        // Only attempt resolution if input looks like a filename (not just a directory or empty)
        if (basename && basename !== '.' && basename !== '..') {
          const matches = await findFilesByName(basename);

          if (matches.length === 1) {
            // Unique match found! Auto-resolve.
            const resolvedPath = matches[0];
            const autoContent = await readFile(resolvedPath, offset, limit);
            return `(Auto-resolved to ${resolvedPath})\n${autoContent}`;
          } else if (matches.length > 1) {
            return `File not found: ${filePath}\nDid you mean one of these?\n${matches.map((m) => `  - ${m}`).join('\n')}`;
          }
        }
      } catch (indexErr) {
        // Ignore index errors, fallback to original error
      }
    }

    return `Error reading file: ${err.message}`;
  }
};

export const writeFile = async (
  filePath: string,
  content: string,
  requester?: string,
): Promise<string> => {
  const absolutePath = path.resolve(filePath);

  // Check if file was read first (safety measure)
  const fileExists = await fs
    .access(absolutePath)
    .then(() => true)
    .catch(() => false);
  if (fileExists && !readFiles.has(absolutePath)) {
    return `Error: Cannot write to ${filePath} - file exists but was not read first. Please read the file before overwriting.`;
  }

  // Get permission
  const permissionManager = getPermissionManager();
  const hasPermission = await permissionManager.checkAndRequest(
    path.dirname(absolutePath),
    'write',
    `write file: ${filePath}`,
    requester,
  );

  if (!hasPermission) {
    return `Permission denied to write file: ${filePath}`;
  }

  try {
    // Ensure directory exists
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });

    await fs.writeFile(absolutePath, content, 'utf-8');

    // Track the file as read now
    readFiles.add(absolutePath);

    // Update index if applicable
    try {
      const { updateFileIndex } = await import('./index.js');
      await updateFileIndex(absolutePath);
    } catch (error) {
      // Ignore indexing errors (don't fail the write)
      const err = error as Error;
      // We might want to log this but for now silently ignore to avoid noise in tool output
    }

    const lines = content.split('\n').length;
    return `Successfully wrote ${lines} lines to ${filePath}`;
  } catch (error) {
    const err = error as Error;
    return `Error writing file: ${err.message}`;
  }
};

export const createDirectory = async (dirPath: string): Promise<string> => {
  const absolutePath = path.resolve(dirPath);

  // Get permission
  const permissionManager = getPermissionManager();
  const hasPermission = await permissionManager.checkAndRequest(
    path.dirname(absolutePath),
    'write',
    `create directory: ${dirPath}`,
  );

  if (!hasPermission) {
    return `Permission denied to create directory: ${dirPath}`;
  }

  try {
    await fs.mkdir(absolutePath, { recursive: true });
    return `Successfully created directory ${dirPath}`;
  } catch (error) {
    const err = error as Error;
    return `Error creating directory: ${err.message}`;
  }
};

/**
 * Check if a file has been read in this session.
 */
export const hasBeenRead = (filePath: string): boolean => {
  return readFiles.has(path.resolve(filePath));
};

/**
 * Clear the read files tracking (for testing).
 */
export const clearReadTracking = (): void => {
  readFiles.clear();
};
