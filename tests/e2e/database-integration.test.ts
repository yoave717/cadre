import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';

describe('E2E: Database Index Integration', () => {
  const testProjectDir = path.join(process.cwd(), 'test-sqldb-e2e-' + Date.now());
  const indexDir = path.join(process.env.HOME || '', '.cadre', 'indexes');

  beforeAll(() => {
    // Create test project
    fs.mkdirSync(testProjectDir, { recursive: true });
    fs.mkdirSync(path.join(testProjectDir, 'src'), { recursive: true });

    // Create test files
    fs.writeFileSync(
      path.join(testProjectDir, 'src', 'index.ts'),
      `
export function hello() {
  return 'world';
}

export class Greeter {
  greet() {
    return 'Hello!';
  }
}
`,
    );

    fs.writeFileSync(
      path.join(testProjectDir, 'src', 'utils.ts'),
      `
import { hello } from './index';

export function utilFunction() {
  return hello();
}
`,
    );
  });

  afterAll(() => {
    // Cleanup test project
    if (fs.existsSync(testProjectDir)) {
      fs.rmSync(testProjectDir, { recursive: true, force: true });
    }

    // Cleanup indexes
    try {
      execSync('cadre index clear', { cwd: testProjectDir, stdio: 'pipe' });
    } catch {
      // Ignore errors
    }

    // Manual fallback cleanup
    const hash = crypto.createHash('sha256').update(testProjectDir).digest('hex').slice(0, 16);
    const dbDir = path.join(os.homedir(), '.cadre', 'indexes', hash);
    if (fs.existsSync(dbDir)) {
      try {
        fs.rmSync(dbDir, { recursive: true, force: true });
      } catch {
        // Ignore
      }
    }
  });

  describe('Index Building with Database', () => {
    it('should build index successfully', () => {
      const output = execSync('cadre index build', {
        cwd: testProjectDir,
        encoding: 'utf-8',
      });

      expect(output).toContain('Index built successfully');
      expect(output).toContain('Files indexed:');
      expect(output).toContain('Symbols found:');
    });

    it('should create index.db file', () => {
      // Build index first
      execSync('cadre index build', { cwd: testProjectDir, stdio: 'pipe' });

      // Find the index directory for this project
      const dirs = fs.readdirSync(indexDir);
      expect(dirs.length).toBeGreaterThan(0);

      const projectIndexDir = path.join(indexDir, dirs[0]);
      const dbFile = path.join(projectIndexDir, 'index.db');

      expect(fs.existsSync(dbFile)).toBe(true);

      const dbSize = fs.statSync(dbFile).size;

      expect(dbSize).toBeGreaterThan(0);
    });
  });

  describe('Index Statistics', () => {
    it('should show correct stats', { timeout: 30000 }, () => {
      execSync('cadre index build', { cwd: testProjectDir, stdio: 'pipe' });

      const output = execSync('cadre index stats', {
        cwd: testProjectDir,
        encoding: 'utf-8',
      });

      expect(output).toContain('Project Index Statistics');
      expect(output).toContain('Total files:');
      expect(output).toContain('Total symbols:');
    });
  });

  describe('Index Update', () => {
    it('should update index incrementally', { timeout: 30000 }, () => {
      // Build initial index
      execSync('cadre index build', { cwd: testProjectDir, stdio: 'pipe' });

      // Modify a file
      fs.appendFileSync(
        path.join(testProjectDir, 'src', 'index.ts'),
        '\nexport const NEW_CONST = 42;\n',
      );

      // Update index
      const output = execSync('cadre index update', {
        cwd: testProjectDir,
        encoding: 'utf-8',
      });

      expect(output).toContain('Index updated successfully');
    });
  });

  describe('Error Handling', () => {
    it('should handle missing index gracefully', { timeout: 30000 }, () => {
      execSync('cadre index clear', { cwd: testProjectDir, stdio: 'pipe' });

      const output = execSync('cadre index stats', {
        cwd: testProjectDir,
        encoding: 'utf-8',
      });

      expect(output).toContain('No index found');
    });
  });
});
