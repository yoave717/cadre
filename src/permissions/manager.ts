import { findGitRoot } from './git.js';
import {
  PermissionType,
  hasStoredPermission,
  grantPermission,
  revokePermissions,
  listPermissions,
  clearAllPermissions,
  ProjectPermissions,
} from './storage.js';
import { promptForPermission } from './prompt.js';

/**
 * Session-level permissions that expire when the process exits.
 * Maps project path to set of granted permission types.
 */
export class PermissionManager {
  /**
   * Session-level permissions that expire when the process exits.
   * Maps project path to set of granted permission types.
   */
  private sessionGrants: Map<string, Set<PermissionType>> = new Map();

  /**
   * Check if permission is granted (from storage or session).
   */
  async hasPermission(targetPath: string, type: PermissionType): Promise<boolean> {
    const projectKey = await this.getProjectKey(targetPath);

    // Check session grants first (faster)
    const sessionSet = this.sessionGrants.get(projectKey);
    if (sessionSet?.has(type)) {
      return true;
    }

    // Check stored permissions
    return hasStoredPermission(projectKey, type);
  }

  /**
   * Check and request permission if needed.
   * Returns true if permission is granted, false if denied.
   */
  async checkAndRequest(
    targetPath: string,
    type: PermissionType,
    context: string,
  ): Promise<boolean> {
    const projectKey = await this.getProjectKey(targetPath);

    // Already have permission?
    if (await this.hasPermission(targetPath, type)) {
      return true;
    }

    // Prompt user
    const response = await promptForPermission(projectKey, type, context);

    switch (response) {
      case 'yes_once':
        this.grantSession(projectKey, type);
        return true;

      case 'yes_always':
        await grantPermission(projectKey, type);
        return true;

      case 'deny':
        return false;

      default:
        return false;
    }
  }

  /**
   * Grant a session-level permission (cleared on exit).
   */
  grantSession(projectPath: string, type: PermissionType): void {
    if (!this.sessionGrants.has(projectPath)) {
      this.sessionGrants.set(projectPath, new Set());
    }
    this.sessionGrants.get(projectPath)!.add(type);
  }

  /**
   * Grant a permanent permission.
   */

  async grantPermanent(projectPath: string, type: PermissionType): Promise<void> {
    await grantPermission(projectPath, type);
  }

  /**
   * Revoke permission for a project.
   */
  async revoke(projectPath: string, type?: PermissionType): Promise<void> {
    // Clear session grants
    if (type) {
      this.sessionGrants.get(projectPath)?.delete(type);
    } else {
      this.sessionGrants.delete(projectPath);
    }

    // Clear stored permissions
    await revokePermissions(projectPath, type);
  }

  /**
   * List all stored permissions.
   */

  async list(): Promise<Record<string, ProjectPermissions>> {
    return listPermissions();
  }

  /**
   * Clear all permissions (session and stored).
   */
  async clearAll(): Promise<void> {
    this.sessionGrants.clear();
    await clearAllPermissions();
  }

  /**
   * Get the project key (git root or directory) for a path.
   */

  private async getProjectKey(targetPath: string): Promise<string> {
    const gitRoot = await findGitRoot(targetPath);
    // Use git root if in a git project, otherwise use the current working directory
    return gitRoot || process.cwd();
  }
}

// Singleton instance
let instance: PermissionManager | null = null;

export function getPermissionManager(): PermissionManager {
  if (!instance) {
    instance = new PermissionManager();
  }
  return instance;
}
