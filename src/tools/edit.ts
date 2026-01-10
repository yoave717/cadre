import fs from 'fs/promises';
import path from 'path';
import { getPermissionManager } from '../permissions/index.js';
import { hasBeenRead } from './files.js';

/**
 * Edit a file by replacing a specific string with another.
 * The old_string must be unique in the file to prevent ambiguous edits.
 */
export const editFile = async (
  filePath: string,
  oldString: string,
  newString: string,
  replaceAll: boolean = false,
): Promise<string> => {
  const absolutePath = path.resolve(filePath);

  // Check if file was read first
  if (!hasBeenRead(absolutePath)) {
    return `Error: Cannot edit ${filePath} - file was not read first. Please read the file before editing.`;
  }

  // Get permission
  const permissionManager = getPermissionManager();
  const hasPermission = await permissionManager.checkAndRequest(
    path.dirname(absolutePath),
    'edit',
    `edit file: ${filePath}`,
  );

  if (!hasPermission) {
    return `Permission denied to edit file: ${filePath}`;
  }

  try {
    const content = await fs.readFile(absolutePath, 'utf-8');

    // Check if old_string exists
    if (!content.includes(oldString)) {
      return `Error: The string to replace was not found in ${filePath}.\nSearched for:\n${oldString.slice(0, 200)}${oldString.length > 200 ? '...' : ''}`;
    }

    // Check for uniqueness if not replacing all
    if (!replaceAll) {
      const occurrences = content.split(oldString).length - 1;
      if (occurrences > 1) {
        return (
          `Error: The string to replace appears ${occurrences} times in ${filePath}. ` +
          `Either provide more context to make it unique, or set replaceAll=true to replace all occurrences.`
        );
      }
    }

    // Perform the replacement
    let newContent: string;
    let replacementCount: number;

    if (replaceAll) {
      const parts = content.split(oldString);
      replacementCount = parts.length - 1;
      newContent = parts.join(newString);
    } else {
      newContent = content.replace(oldString, newString);
      replacementCount = 1;
    }

    // Write the file
    await fs.writeFile(absolutePath, newContent, 'utf-8');

    return `Successfully edited ${filePath}: replaced ${replacementCount} occurrence(s).`;
  } catch (error) {
    const err = error as Error;
    return `Error editing file: ${err.message}`;
  }
};

/**
 * Insert content at a specific line number in a file.
 */
export const insertAtLine = async (
  filePath: string,
  lineNumber: number,
  content: string,
): Promise<string> => {
  const absolutePath = path.resolve(filePath);

  // Check if file was read first
  if (!hasBeenRead(absolutePath)) {
    return `Error: Cannot edit ${filePath} - file was not read first. Please read the file before editing.`;
  }

  // Get permission
  const permissionManager = getPermissionManager();
  const hasPermission = await permissionManager.checkAndRequest(
    path.dirname(absolutePath),
    'edit',
    `insert in file: ${filePath} at line ${lineNumber}`,
  );

  if (!hasPermission) {
    return `Permission denied to edit file: ${filePath}`;
  }

  try {
    const fileContent = await fs.readFile(absolutePath, 'utf-8');
    const lines = fileContent.split('\n');

    if (lineNumber < 1 || lineNumber > lines.length + 1) {
      return `Error: Line number ${lineNumber} is out of range. File has ${lines.length} lines.`;
    }

    // Insert at the specified line (1-indexed)
    lines.splice(lineNumber - 1, 0, content);

    await fs.writeFile(absolutePath, lines.join('\n'), 'utf-8');

    return `Successfully inserted content at line ${lineNumber} in ${filePath}.`;
  } catch (error) {
    const err = error as Error;
    return `Error inserting content: ${err.message}`;
  }
};

/**
 * Delete lines from a file.
 */
export const deleteLines = async (
  filePath: string,
  startLine: number,
  endLine: number,
): Promise<string> => {
  const absolutePath = path.resolve(filePath);

  // Check if file was read first
  if (!hasBeenRead(absolutePath)) {
    return `Error: Cannot edit ${filePath} - file was not read first. Please read the file before editing.`;
  }

  // Get permission
  const permissionManager = getPermissionManager();
  const hasPermission = await permissionManager.checkAndRequest(
    path.dirname(absolutePath),
    'edit',
    `delete lines ${startLine}-${endLine} in file: ${filePath}`,
  );

  if (!hasPermission) {
    return `Permission denied to edit file: ${filePath}`;
  }

  try {
    const content = await fs.readFile(absolutePath, 'utf-8');
    const lines = content.split('\n');

    if (startLine < 1 || endLine > lines.length || startLine > endLine) {
      return `Error: Invalid line range ${startLine}-${endLine}. File has ${lines.length} lines.`;
    }

    // Delete the lines (1-indexed)
    const deletedCount = endLine - startLine + 1;
    lines.splice(startLine - 1, deletedCount);

    await fs.writeFile(absolutePath, lines.join('\n'), 'utf-8');

    return `Successfully deleted ${deletedCount} line(s) from ${filePath}.`;
  } catch (error) {
    const err = error as Error;
    return `Error deleting lines: ${err.message}`;
  }
};
