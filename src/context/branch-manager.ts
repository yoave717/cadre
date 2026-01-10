import fs from 'fs';
import path from 'path';
import { HistoryItem } from '../agent/index.js';

export interface BranchInfo {
  name: string;
  created: number;
  lastModified: number;
  messageCount: number;
}

export interface BranchData {
  messages: HistoryItem[];
  created: number;
  lastModified: number;
}

/**
 * Manages conversation branches.
 * Stores branches in .cadre/branches/<name>.json
 */
export class BranchManager {
  private baseDir: string;

  constructor(baseDir: string = '.cadre/branches') {
    this.baseDir = path.resolve(process.cwd(), baseDir);
  }

  /**
   * Initialize storage directory.
   */
  private async initDir(): Promise<void> {
    if (!fs.existsSync(this.baseDir)) {
      await fs.promises.mkdir(this.baseDir, { recursive: true });
    }
  }

  /**
   * Validate branch name.
   * Alphanumeric, hyphens, max 50 chars.
   */
  validateName(name: string): boolean {
    if (!name || name.length > 50) return false;
    return /^[a-zA-Z0-9-]+$/.test(name);
  }

  /**
   * Get path for a branch file.
   */
  private getBranchPath(name: string): string {
    return path.join(this.baseDir, `${name}.json`);
  }

  /**
   * Create a new branch with current history.
   * Throws if branch already exists.
   */
  async createBranch(name: string, history: HistoryItem[]): Promise<void> {
    if (!this.validateName(name)) {
      throw new Error('Invalid branch name. Use alphanumeric and hyphens only, max 50 chars.');
    }

    await this.initDir();

    // Check limit
    const branches = await this.listBranches();
    if (branches.length >= 10) {
      throw new Error('Branch limit reached (10). Delete a branch to create a new one.');
    }

    const filePath = this.getBranchPath(name);

    if (fs.existsSync(filePath)) {
      throw new Error(`Branch '${name}' already exists.`);
    }

    const data: BranchData = {
      messages: history,
      created: Date.now(),
      lastModified: Date.now(),
    };

    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * Save updates to an existing branch.
   * Creates if not exists (upsert), but intended for updates.
   */
  async saveBranch(name: string, history: HistoryItem[]): Promise<void> {
    if (!this.validateName(name)) {
      throw new Error('Invalid branch name.');
    }

    await this.initDir();
    const filePath = this.getBranchPath(name);

    let created = Date.now();

    // Preserve creation time if exists
    if (fs.existsSync(filePath)) {
      try {
        const existingRaw = await fs.promises.readFile(filePath, 'utf-8');
        const existing = JSON.parse(existingRaw) as BranchData;
        created = existing.created || created;
      } catch {
        // Ignore read error, just overwrite
      }
    }

    const data: BranchData = {
      messages: history,
      created,
      lastModified: Date.now(),
    };

    await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * Load history from a branch.
   */
  async loadBranch(name: string): Promise<HistoryItem[]> {
    const filePath = this.getBranchPath(name);

    if (!fs.existsSync(filePath)) {
      throw new Error(`Branch '${name}' not found.`);
    }

    const raw = await fs.promises.readFile(filePath, 'utf-8');
    const data = JSON.parse(raw) as BranchData;
    return data.messages;
  }

  /**
   * List all available branches.
   */
  async listBranches(): Promise<BranchInfo[]> {
    await this.initDir();

    const files = await fs.promises.readdir(this.baseDir);
    const branches: BranchInfo[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      try {
        const content = await fs.promises.readFile(path.join(this.baseDir, file), 'utf-8');
        const data = JSON.parse(content) as BranchData;

        branches.push({
          name: file.replace('.json', ''),
          created: data.created,
          lastModified: data.lastModified,
          messageCount: data.messages.length,
        });
      } catch {
        // Skip invalid files
      }
    }

    return branches.sort((a, b) => b.lastModified - a.lastModified);
  }

  /**
   * Delete a branch.
   */
  async deleteBranch(name: string): Promise<void> {
    const filePath = this.getBranchPath(name);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }

  /**
   * Check if a branch exists.
   */
  branchExists(name: string): boolean {
    const filePath = this.getBranchPath(name);
    return fs.existsSync(filePath);
  }

  /**
   * Checkout to a different branch.
   * Saves current history to currentBranch (if provided), then loads target branch.
   * @param targetBranch - Branch to switch to
   * @param currentBranch - Current active branch (null for main)
   * @param currentHistory - Current conversation history to save
   * @returns History from the target branch
   */
  async checkout(
    targetBranch: string,
    currentBranch: string | null,
    currentHistory: HistoryItem[],
  ): Promise<HistoryItem[]> {
    // Validate target branch exists
    if (!this.branchExists(targetBranch)) {
      throw new Error(`Branch '${targetBranch}' not found.`);
    }

    // Auto-save current branch before checkout
    if (currentBranch) {
      await this.saveBranch(currentBranch, currentHistory);
    }

    // Load target branch history
    return this.loadBranch(targetBranch);
  }
}
