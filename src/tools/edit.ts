import fs from 'fs/promises';
import path from 'path';
import { getPermissionManager } from '../permissions/index.js';
import { hasBeenRead } from './files.js';

interface EditOptions {
  oldString: string;
  newString: string;
  replaceAll?: boolean;
  startLine?: number;
  endLine?: number;
}

/**
 * Helper to apply a single edit to content.
 * Throws error if edit fails (string not found, ambiguous, etc.)
 */
const applyEdit = (content: string, options: EditOptions): { content: string; count: number } => {
  const { oldString, newString, replaceAll = false, startLine, endLine } = options;

  // If no range specified, use global logic
  if (!startLine && !endLine) {
    if (!content.includes(oldString)) {
      throw new Error(
        `String to replace not found.\nSearched for:\n${oldString.slice(0, 200)}${oldString.length > 200 ? '...' : ''}`,
      );
    }

    if (!replaceAll) {
      const occurrences = content.split(oldString).length - 1;
      if (occurrences > 1) {
        throw new Error(
          `String to replace appears ${occurrences} times. ` +
            `Provide more context or set replaceAll=true.`,
        );
      }
    }

    const newContent = replaceAll
      ? content.split(oldString).join(newString)
      : content.replace(oldString, newString);

    const count = replaceAll ? content.split(oldString).length - 1 : 1;
    return { content: newContent, count };
  }

  // Scoped replacement
  const lines = content.split('\n');
  const start = (startLine || 1) - 1;
  const end = endLine || lines.length;

  if (start < 0 || end > lines.length || start >= end) {
    throw new Error(`Invalid line range ${start + 1}-${end}. File has ${lines.length} lines.`);
  }

  const preSection = lines.slice(0, start);
  const targetSection = lines.slice(start, end);
  const postSection = lines.slice(end);

  const targetContent = targetSection.join('\n');

  if (!targetContent.includes(oldString)) {
    throw new Error(`String to replace not found in lines ${start + 1}-${end}.`);
  }

  if (!replaceAll) {
    const occurrences = targetContent.split(oldString).length - 1;
    if (occurrences > 1) {
      throw new Error(
        `String to replace appears ${occurrences} times in lines ${start + 1}-${end}. ` +
          `Provide more context or set replaceAll=true.`,
      );
    }
  }

  const newTargetContent = replaceAll
    ? targetContent.split(oldString).join(newString)
    : targetContent.replace(oldString, newString);

  const newFileContent = [...preSection, newTargetContent, ...postSection].join('\n');
  const count = replaceAll ? targetContent.split(oldString).length - 1 : 1;

  return { content: newFileContent, count };
};

/**
 * Edit a file by replacing a specific string with another.
 */
export const editFile = async (
  filePath: string,
  oldString: string,
  newString: string,
  replaceAll: boolean = false,
  startLine?: number,
  endLine?: number,
  requester?: string,
): Promise<string> => {
  return multiEditFile(
    filePath,
    [{ oldString, newString, replaceAll, startLine, endLine }],
    requester,
  );
};

/**
 * Perform multiple edits on a file sequentially.
 * Atomic: If one edit fails, none are applied.
 */
export const multiEditFile = async (
  filePath: string,
  edits: EditOptions[],
  requester?: string,
): Promise<string> => {
  const absolutePath = path.resolve(filePath);

  if (!hasBeenRead(absolutePath)) {
    return `Error: Cannot edit ${filePath} - file was not read first. Please read the file before editing.`;
  }

  const permissionManager = getPermissionManager();
  const hasPermission = await permissionManager.checkAndRequest(
    path.dirname(absolutePath),
    'edit',
    `edit file: ${filePath} (${edits.length} change${edits.length === 1 ? '' : 's'})`,
    requester,
  );

  if (!hasPermission) {
    return `Permission denied to edit file: ${filePath}`;
  }

  try {
    let content = await fs.readFile(absolutePath, 'utf-8');
    let totalCount = 0;

    for (let i = 0; i < edits.length; i++) {
      try {
        const result = applyEdit(content, edits[i]);
        content = result.content;
        totalCount += result.count;
      } catch (e) {
        const err = e as Error;
        return `Error applying edit #${i + 1}: ${err.message}\nNo changes were saved to the file.`;
      }
    }

    await fs.writeFile(absolutePath, content, 'utf-8');
    return `Successfully applied ${edits.length} edit(s) to ${filePath} (total ${totalCount} replacements).`;
  } catch (error) {
    const err = error as Error;
    return `Error processing file: ${err.message}`;
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
