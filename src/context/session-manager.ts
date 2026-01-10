import fs from 'fs';
import path from 'path';

export interface SessionData {
  lastBranch: string | null;
}

/**
 * Manages session state across restarts.
 * Stores session data in .ai/session.json
 */
export class SessionManager {
  private sessionPath: string;

  constructor(baseDir: string = '.ai') {
    this.sessionPath = path.resolve(process.cwd(), baseDir, 'session.json');
  }

  /**
   * Initialize storage directory.
   */
  private async initDir(): Promise<void> {
    const dir = path.dirname(this.sessionPath);
    if (!fs.existsSync(dir)) {
      await fs.promises.mkdir(dir, { recursive: true });
    }
  }

  /**
   * Get the last active branch from session.
   */
  async getLastBranch(): Promise<string | null> {
    try {
      if (!fs.existsSync(this.sessionPath)) {
        return null;
      }

      const raw = await fs.promises.readFile(this.sessionPath, 'utf-8');
      const data = JSON.parse(raw) as SessionData;
      return data.lastBranch || null;
    } catch {
      return null;
    }
  }

  /**
   * Save the last active branch to session.
   */
  async setLastBranch(branchName: string | null): Promise<void> {
    await this.initDir();

    const data: SessionData = {
      lastBranch: branchName,
    };

    await fs.promises.writeFile(this.sessionPath, JSON.stringify(data, null, 2), 'utf-8');
  }
}
