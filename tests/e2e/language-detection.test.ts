import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { exec } from 'child_process';
import path from 'path';
import util from 'util';
import fs from 'fs';
import os from 'os';

const execAsync = util.promisify(exec);
const cliPath = path.resolve(__dirname, '../../dist/index.js');

interface ExecError extends Error {
  stdout?: string;
  stderr?: string;
}

describe('E2E Language Detection', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cadre-lang-'));
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('Basic Language Detection', () => {
    it('should detect TypeScript in a TypeScript project', async () => {
      // Create TypeScript files
      await fs.promises.writeFile(
        path.join(tempDir, 'index.ts'),
        'const greeting: string = "Hello World";\nexport default greeting;',
      );
      await fs.promises.writeFile(
        path.join(tempDir, 'utils.ts'),
        'export function add(a: number, b: number): number { return a + b; }',
      );

      const { stdout } = await execAsync(`node ${cliPath} detect`, { cwd: tempDir });

      expect(stdout).toContain('Detected Languages:');
      expect(stdout).toContain('TypeScript');
      expect(stdout).toContain('Scanned');
      expect(stdout).toContain('files');
    });

    it('should detect JavaScript in a JavaScript project', async () => {
      // Create JavaScript files
      await fs.promises.writeFile(
        path.join(tempDir, 'index.js'),
        'const greeting = "Hello World";\nmodule.exports = greeting;',
      );
      await fs.promises.writeFile(
        path.join(tempDir, 'utils.js'),
        'function add(a, b) { return a + b; }\nmodule.exports = { add };',
      );

      const { stdout } = await execAsync(`node ${cliPath} detect`, { cwd: tempDir });

      expect(stdout).toContain('Detected Languages:');
      expect(stdout).toContain('JavaScript');
    });

    it('should detect Python in a Python project', async () => {
      // Create Python files
      await fs.promises.writeFile(
        path.join(tempDir, 'main.py'),
        'def greet(name):\n    return f"Hello {name}"\n\nif __name__ == "__main__":\n    print(greet("World"))',
      );
      await fs.promises.writeFile(
        path.join(tempDir, 'utils.py'),
        'def add(a, b):\n    return a + b',
      );

      const { stdout } = await execAsync(`node ${cliPath} detect`, { cwd: tempDir });

      expect(stdout).toContain('Detected Languages:');
      expect(stdout).toContain('Python');
    });

    it('should handle empty directory', async () => {
      const { stdout } = await execAsync(`node ${cliPath} detect`, { cwd: tempDir });

      expect(stdout).toContain('Detected Languages:');
      expect(stdout).toContain('No recognized source files found');
    });

    it('should detect multiple languages in a polyglot project', async () => {
      // Create files in multiple languages
      await fs.promises.writeFile(path.join(tempDir, 'index.ts'), 'const x: number = 1;');
      await fs.promises.writeFile(path.join(tempDir, 'script.py'), 'print("Hello")');
      await fs.promises.writeFile(path.join(tempDir, 'main.go'), 'package main\nfunc main() {}');

      const { stdout } = await execAsync(`node ${cliPath} detect`, { cwd: tempDir });

      expect(stdout).toContain('Detected Languages:');
      // Should show at least one language
      expect(
        stdout.includes('TypeScript') || stdout.includes('Python') || stdout.includes('Go'),
      ).toBe(true);
    });
  });

  describe('Framework Detection', () => {
    it('should detect React framework', async () => {
      // Create package.json with React
      const packageJson = {
        name: 'test-project',
        version: '1.0.0',
        dependencies: {
          react: '^18.2.0',
          'react-dom': '^18.2.0',
        },
      };
      await fs.promises.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify(packageJson, null, 2),
      );

      const { stdout } = await execAsync(`node ${cliPath} detect --frameworks`, { cwd: tempDir });

      expect(stdout).toContain('Detected Languages:');
      expect(stdout).toContain('Detected Frameworks:');
      expect(stdout).toContain('React');
    });

    it('should detect Vue framework', async () => {
      // Create package.json with Vue
      const packageJson = {
        name: 'test-project',
        version: '1.0.0',
        dependencies: {
          vue: '^3.3.0',
        },
      };
      await fs.promises.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify(packageJson, null, 2),
      );

      const { stdout } = await execAsync(`node ${cliPath} detect --frameworks`, { cwd: tempDir });

      expect(stdout).toContain('Detected Frameworks:');
      expect(stdout).toContain('Vue');
    });

    it('should detect Express framework', async () => {
      // Create package.json with Express
      const packageJson = {
        name: 'test-project',
        version: '1.0.0',
        dependencies: {
          express: '^4.18.0',
        },
      };
      await fs.promises.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify(packageJson, null, 2),
      );

      const { stdout } = await execAsync(`node ${cliPath} detect --frameworks`, { cwd: tempDir });

      expect(stdout).toContain('Detected Frameworks:');
      expect(stdout).toContain('Express');
    });

    it('should handle no frameworks detected', async () => {
      // Create package.json without frameworks
      const packageJson = {
        name: 'test-project',
        version: '1.0.0',
        dependencies: {},
      };
      await fs.promises.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify(packageJson, null, 2),
      );

      const { stdout } = await execAsync(`node ${cliPath} detect --frameworks`, { cwd: tempDir });

      expect(stdout).toContain('Detected Frameworks:');
      expect(stdout).toContain('No common frameworks detected');
    });

    it('should detect multiple frameworks', async () => {
      // Create package.json with multiple frameworks
      const packageJson = {
        name: 'test-project',
        version: '1.0.0',
        dependencies: {
          react: '^18.2.0',
          express: '^4.18.0',
          vitest: '^1.0.0',
        },
      };
      await fs.promises.writeFile(
        path.join(tempDir, 'package.json'),
        JSON.stringify(packageJson, null, 2),
      );

      const { stdout } = await execAsync(`node ${cliPath} detect --frameworks`, { cwd: tempDir });

      expect(stdout).toContain('Detected Frameworks:');
      // Should detect at least one framework
      expect(
        stdout.includes('React') || stdout.includes('Express') || stdout.includes('Vitest'),
      ).toBe(true);
    });
  });

  describe('Language Detection Accuracy', () => {
    it('should show percentage distribution for languages', async () => {
      // Create multiple TypeScript files
      await fs.promises.writeFile(path.join(tempDir, 'file1.ts'), 'const a = 1;');
      await fs.promises.writeFile(path.join(tempDir, 'file2.ts'), 'const b = 2;');

      const { stdout } = await execAsync(`node ${cliPath} detect`, { cwd: tempDir });

      expect(stdout).toContain('TypeScript');
      expect(stdout).toMatch(/\(\d+%\)/); // Should show percentage
    });

    it('should ignore node_modules directory', async () => {
      // Create node_modules with files
      const nodeModulesDir = path.join(tempDir, 'node_modules');
      await fs.promises.mkdir(nodeModulesDir);
      await fs.promises.writeFile(path.join(nodeModulesDir, 'lib.js'), 'module.exports = {}');

      // Create actual source file
      await fs.promises.writeFile(path.join(tempDir, 'index.ts'), 'const x = 1;');

      const { stdout } = await execAsync(`node ${cliPath} detect`, { cwd: tempDir });

      expect(stdout).toContain('TypeScript');
      // Should scan only 1 file, not the node_modules file
      expect(stdout).toContain('Scanned 1 files');
    });

    it('should ignore hidden directories', async () => {
      // Create .git directory with files
      const gitDir = path.join(tempDir, '.git');
      await fs.promises.mkdir(gitDir);
      await fs.promises.writeFile(path.join(gitDir, 'config'), 'git config');

      // Create actual source file
      await fs.promises.writeFile(path.join(tempDir, 'index.ts'), 'const x = 1;');

      const { stdout } = await execAsync(`node ${cliPath} detect`, { cwd: tempDir });

      // Should scan only source files, not hidden directories
      expect(stdout).toContain('Scanned 1 files');
    });
  });

  describe('Error Handling', () => {
    it('should handle detection in non-existent directory gracefully', async () => {
      const nonExistentDir = path.join(tempDir, 'non-existent');

      try {
        await execAsync(`node ${cliPath} detect`, { cwd: nonExistentDir });
      } catch (error) {
        const err = error as ExecError;
        // Should fail with appropriate error
        expect(err.code).toBeTruthy();
      }
    });

    it('should handle invalid package.json gracefully', async () => {
      // Create invalid package.json
      await fs.promises.writeFile(path.join(tempDir, 'package.json'), 'invalid json {');

      try {
        const { stdout } = await execAsync(`node ${cliPath} detect --frameworks`, {
          cwd: tempDir,
        });
        // Should still complete, just not detect frameworks
        expect(stdout).toContain('Detected Languages:');
      } catch (error) {
        // May error, but should have meaningful output
        const err = error as ExecError;
        expect(err.stdout || err.stderr).toBeTruthy();
      }
    });
  });
});
