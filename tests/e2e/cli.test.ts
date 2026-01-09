import { describe, it, expect } from 'vitest';
import { exec } from 'child_process';
import path from 'path';
import util from 'util';

const execAsync = util.promisify(exec);
const cliPath = path.resolve(__dirname, '../../dist/index.js');

describe('E2E CLI', () => {
  it('should show help information', async () => {
    // We use node to run the built JS file
    // Ensure "npm run build" is run before this, or we run ts-node if we want to test source
    // But testing the built artifact is better for E2E.
    // For this test environment, let's assume valid dist or use ts-node for reliability in dev
    
    // Using ts-node to run directly from source for dev speed if dist might be stale
    // const command = `npx ts-node ${path.resolve(__dirname, '../../src/index.ts')} --help`;
    
    // Ideally we test the distribution. Let's try running the build script first, or assume user flow. 
    // The instructions said "E2E tests will execute the build CLI command".
    
    // Let's rely on the build.
    const command = `node ${cliPath} --help`;
    
    try {
        const { stdout } = await execAsync(command);
        expect(stdout).toContain('Usage: cadre');
        expect(stdout).toContain('Options:');
    } catch (error: any) {
        // If dist doesn't exist, we might fail. 
        // We can try to build or just fail and tell user.
        // But for robust implementation, let's fallback or just assert failure message if it's a "not found" issue.
        // Actually, let's just assert on the error if it fails, which will show us why.
        throw new Error(`CLI execution failed: ${error.message}`);
    }
  });

  it('should show version', async () => {
      const command = `node ${cliPath} --version`;
      try {
        const { stdout } = await execAsync(command);
        // Version is 1.0.0 in package.json
        expect(stdout).toContain('1.0.0');
      } catch (error: any) {
         throw new Error(`CLI execution failed: ${error.message}`);
      }
  });
});
