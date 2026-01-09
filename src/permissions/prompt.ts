import { select } from '@inquirer/prompts';
import chalk from 'chalk';
import { PermissionType } from './storage.js';
import { getProjectName } from './git.js';

export type PermissionResponse = 'yes_once' | 'yes_always' | 'deny';

/**
 * Prompt the user for permission to perform an operation.
 */
export async function promptForPermission(
  projectPath: string,
  type: PermissionType,
  context: string,
): Promise<PermissionResponse> {
  const projectName = getProjectName(projectPath);

  console.log('');
  console.log(chalk.yellow('⚠ Permission required'));
  console.log(chalk.dim(`  Project: ${projectName}`));
  console.log(chalk.dim(`  Path:    ${projectPath}`));
  console.log(chalk.dim(`  Action:  ${context}`));
  console.log('');

  const answer = await select({
    message: `Allow ${type} operations in ${projectName}?`,
    choices: [
      {
        name: 'Yes, just this once',
        value: 'yes_once' as const,
      },
      {
        name: 'Yes, always for this project (remember)',
        value: 'yes_always' as const,
      },
      {
        name: 'No, deny',
        value: 'deny' as const,
      },
    ],
  });

  return answer;
}

/**
 * Format a permission type for display.
 */
export function formatPermissionType(type: PermissionType): string {
  switch (type) {
    case 'bash':
      return 'run shell commands';
    case 'write':
      return 'write files';
    case 'edit':
      return 'edit files';
    case 'delete':
      return 'delete files';
    default:
      return type;
  }
}
