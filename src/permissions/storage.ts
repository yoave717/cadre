import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export type PermissionType = 'bash' | 'write' | 'edit' | 'delete';

export interface ProjectPermissions {
  bash?: boolean;
  write?: boolean;
  edit?: boolean;
  delete?: boolean;
  granted_at: string;
}

export interface PermissionsData {
  version: number;
  projects: Record<string, ProjectPermissions>;
}

const PERMISSIONS_DIR = path.join(os.homedir(), '.cadre');
const PERMISSIONS_FILE = path.join(PERMISSIONS_DIR, 'permissions.json');

/**
 * Ensure the ~/.cadre directory exists.
 */
async function ensureDir(): Promise<void> {
  try {
    await fs.mkdir(PERMISSIONS_DIR, { recursive: true });
  } catch {
    // Directory already exists
  }
}

/**
 * Load permissions data from disk.
 */
export async function loadPermissions(): Promise<PermissionsData> {
  try {
    await ensureDir();
    const data = await fs.readFile(PERMISSIONS_FILE, 'utf-8');
    return JSON.parse(data) as PermissionsData;
  } catch {
    // File doesn't exist or is invalid, return default
    return { version: 1, projects: {} };
  }
}

/**
 * Save permissions data to disk.
 */
export async function savePermissions(data: PermissionsData): Promise<void> {
  await ensureDir();
  await fs.writeFile(PERMISSIONS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Check if a permission is granted for a project.
 */
export async function hasStoredPermission(
  projectPath: string,
  type: PermissionType,
): Promise<boolean> {
  const data = await loadPermissions();
  const project = data.projects[projectPath];
  if (!project) return false;
  return project[type] === true;
}

/**
 * Grant a permanent permission for a project.
 */
export async function grantPermission(projectPath: string, type: PermissionType): Promise<void> {
  const data = await loadPermissions();

  if (!data.projects[projectPath]) {
    data.projects[projectPath] = {
      granted_at: new Date().toISOString(),
    };
  }

  data.projects[projectPath][type] = true;
  data.projects[projectPath].granted_at = new Date().toISOString();

  await savePermissions(data);
}

/**
 * Revoke permissions for a project.
 */
export async function revokePermissions(projectPath: string, type?: PermissionType): Promise<void> {
  const data = await loadPermissions();

  if (!data.projects[projectPath]) return;

  if (type) {
    delete data.projects[projectPath][type];
  } else {
    delete data.projects[projectPath];
  }

  await savePermissions(data);
}

/**
 * List all projects with permissions.
 */
export async function listPermissions(): Promise<Record<string, ProjectPermissions>> {
  const data = await loadPermissions();
  return data.projects;
}

/**
 * Clear all permissions.
 */
export async function clearAllPermissions(): Promise<void> {
  await savePermissions({ version: 1, projects: {} });
}
