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
    const content = await fs.readFile(absolutePath, 'utf-8');

    // Track that this file was read
    readFiles.add(absolutePath);

    // Handle offset and limit for large files
    if (offset !== undefined || limit !== undefined) {
      const lines = content.split('\n');
      const startLine = offset || 0;
      const numLines = limit || lines.length;
      const selectedLines = lines.slice(startLine, startLine + numLines);

      // Add line numbers
      const numbered = selectedLines.map(
        (line, i) => `${String(startLine + i + 1).padStart(4)}│ ${line}`,
      );

      return numbered.join('\n');
    }

    // For full file, add line numbers
    const lines = content.split('\n');
    const numbered = lines.map((line, i) => `${String(i + 1).padStart(4)}│ ${line}`);

    // Truncate if too large
    if (numbered.length > 2000) {
      return `${numbered
        .slice(0, 2000)
        .join(
          '\n',
        )}\n... (truncated, ${lines.length - 2000} more lines. Use offset/limit to read more)`;
    }

    return numbered.join('\n');
  } catch (error) {
    const err = error as Error;
    return `Error reading file: ${err.message}`;
  }
};

export const writeFile = async (filePath: string, content: string): Promise<string> => {
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
