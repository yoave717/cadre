import { select } from '@inquirer/prompts';
import chalk from 'chalk';
import { PermissionType } from './storage.js';
import { getProjectName } from './git.js';

export type PermissionResponse = 'yes_once' | 'yes_always' | 'deny';

/**
 * Prompt the user for permission to perform an operation.
 *
 * @param projectPath - The project path
 * @param type - The permission type
 * @param context - Description of the action
 * @param requester - Optional identifier of who is requesting (e.g., worker-id)
 */
export async function promptForPermission(
  projectPath: string,
  type: PermissionType,
  context: string,
  requester?: string,
): Promise<PermissionResponse> {
  const projectName = getProjectName(projectPath);

  console.log('');
  console.log(chalk.yellow('⚠ Permission required'));
  console.log(chalk.dim(`  Project: ${projectName}`));
  console.log(chalk.dim(`  Path:    ${projectPath}`));
  console.log(chalk.dim(`  Action:  ${context}`));
  if (requester) {
    console.log(chalk.dim(`  Requester: ${chalk.cyan(requester)}`));
  }
  console.log('');

  const message = requester
    ? `Allow ${type} operations for ${chalk.cyan(requester)} in ${projectName}?`
    : `Allow ${type} operations in ${projectName}?`;

  const answer = await select({
    message,
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
