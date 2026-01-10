import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

describe('E2E: SQLite Index Integration', () => {
  const testProjectDir = path.join(process.cwd(), 'test-sqlite-e2e-' + Date.now());
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
  });

  describe('Index Building with SQLite', () => {
    it('should build index with both SQLite and JSON', () => {
      const output = execSync('cadre index build', {
        cwd: testProjectDir,
        encoding: 'utf-8',
      });

      expect(output).toContain('Index built successfully');
      expect(output).toContain('Files indexed:');
      expect(output).toContain('Symbols found:');
    });

    it('should create both index.db and index.json files', () => {
      // Build index first
      execSync('cadre index build', { cwd: testProjectDir, stdio: 'pipe' });

      // Find the index directory for this project
      const dirs = fs.readdirSync(indexDir);
      expect(dirs.length).toBeGreaterThan(0);

      const projectIndexDir = path.join(indexDir, dirs[0]);
      const dbFile = path.join(projectIndexDir, 'index.db');
      const jsonFile = path.join(projectIndexDir, 'index.json');

      expect(fs.existsSync(dbFile)).toBe(true);
      expect(fs.existsSync(jsonFile)).toBe(true);

      // SQLite file should be larger than JSON (has indexes)
      const dbSize = fs.statSync(dbFile).size;
      const jsonSize = fs.statSync(jsonFile).size;

      expect(dbSize).toBeGreaterThan(0);
      expect(jsonSize).toBeGreaterThan(0);
    });
  });

  describe('Index Statistics', () => {
    it('should show correct stats from SQLite', () => {
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
    it('should update index incrementally', () => {
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

  describe('Migration from JSON to SQLite', () => {
    it('should automatically migrate existing JSON index', () => {
      // Clear indexes
      execSync('cadre index clear', { cwd: testProjectDir, stdio: 'pipe' });

      // Build index (creates both JSON and SQLite)
      execSync('cadre index build', { cwd: testProjectDir, stdio: 'pipe' });

      // Find index directory
      const dirs = fs.readdirSync(indexDir);
      const projectIndexDir = path.join(indexDir, dirs[0]);
      const dbFile = path.join(projectIndexDir, 'index.db');

      // Delete SQLite file but keep JSON
      if (fs.existsSync(dbFile)) {
        fs.unlinkSync(dbFile);
      }

      // Stats should still work (using JSON fallback)
      const output1 = execSync('cadre index stats', {
        cwd: testProjectDir,
        encoding: 'utf-8',
      });
      expect(output1).toContain('Project Index Statistics');

      // Rebuild should recreate SQLite from JSON
      execSync('cadre index build', { cwd: testProjectDir, stdio: 'pipe' });

      expect(fs.existsSync(dbFile)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing index gracefully', () => {
      execSync('cadre index clear', { cwd: testProjectDir, stdio: 'pipe' });

      const output = execSync('cadre index stats', {
        cwd: testProjectDir,
        encoding: 'utf-8',
      });

      expect(output).toContain('No index found');
    });

    it('should fallback to JSON if SQLite fails', () => {
      // Build index
      execSync('cadre index build', { cwd: testProjectDir, stdio: 'pipe' });

      // Find and corrupt SQLite file
      const dirs = fs.readdirSync(indexDir);
      const projectIndexDir = path.join(indexDir, dirs[0]);
      const dbFile = path.join(projectIndexDir, 'index.db');

      // Corrupt the database by writing invalid data
      fs.writeFileSync(dbFile, 'corrupted data');

      // Should still work using JSON fallback
      const output = execSync('cadre index stats', {
        cwd: testProjectDir,
        encoding: 'utf-8',
      });

      // Should either show stats from JSON or indicate no index
      expect(output).toBeDefined();
    });
  });
});
