import { exec, spawn } from 'child_process';
import util from 'util';
import { getPermissionManager } from '../permissions/index.js';

const execAsync = util.promisify(exec);

// Commands that are always blocked for safety
const BLOCKED_COMMANDS = [
  'rm -rf /',
  'rm -rf /*',
  'rm -rf ~',
  'sudo rm -rf',
  ':(){:|:&};:', // Fork bomb
  'mkfs.',
  'dd if=/dev/',
  '> /dev/sda',
];

// Commands that should require extra caution
const DANGEROUS_PATTERNS = [/^sudo\s/, /rm\s+-rf?\s/, />\s*\/dev\//, /mkfs\./];

/**
 * Check if a command is blocked.
 */
function isBlocked(command: string): boolean {
  const normalized = command.toLowerCase().trim();
  return BLOCKED_COMMANDS.some((blocked) => normalized.includes(blocked.toLowerCase()));
}

/**
 * Check if a command is potentially dangerous.
 */
function isDangerous(command: string): boolean {
  return DANGEROUS_PATTERNS.some((pattern) => pattern.test(command));
}

export const runCommand = async (command: string, cwd?: string): Promise<string> => {
  // Check for blocked commands
  if (isBlocked(command)) {
    return `Error: This command is blocked for safety reasons: ${command}`;
  }

  // Get permission
  const permissionManager = getPermissionManager();
  const workDir = cwd || process.cwd();
  const context = isDangerous(command)
    ? `run dangerous command: ${command}`
    : `run command: ${command}`;

  const hasPermission = await permissionManager.checkAndRequest(workDir, 'bash', context);

  if (!hasPermission) {
    return `Permission denied to run command in ${workDir}`;
  }

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: workDir,
      timeout: 120000, // 2 minute timeout
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    let result = '';
    if (stdout.trim()) {
      result += `stdout:\n${stdout}`;
    }
    if (stderr.trim()) {
      result += `${result ? '\n' : ''}stderr:\n${stderr}`;
    }
    return result || 'Command completed with no output.';
  } catch (error: any) {
    let result = `Error running command: ${error.message}`;
    if (error.stdout) {
      result += `\nstdout:\n${error.stdout}`;
    }
    if (error.stderr) {
      result += `\nstderr:\n${error.stderr}`;
    }
    return result;
  }
};

/**
 * Run a command with real-time output streaming.
 * Returns a promise that resolves with the combined output.
 */
export const runCommandStream = async (
  command: string,
  cwd?: string,
  onOutput?: (data: string, type: 'stdout' | 'stderr') => void,
): Promise<string> => {
  // Check for blocked commands
  if (isBlocked(command)) {
    return `Error: This command is blocked for safety reasons: ${command}`;
  }

  // Get permission
  const permissionManager = getPermissionManager();
  const workDir = cwd || process.cwd();
  const hasPermission = await permissionManager.checkAndRequest(
    workDir,
    'bash',
    `run command: ${command}`,
  );

  if (!hasPermission) {
    return `Permission denied to run command in ${workDir}`;
  }

  return new Promise((resolve) => {
    const child = spawn('sh', ['-c', command], {
      cwd: workDir,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      const str = data.toString();
      stdout += str;
      onOutput?.(str, 'stdout');
    });

    child.stderr.on('data', (data) => {
      const str = data.toString();
      stderr += str;
      onOutput?.(str, 'stderr');
    });

    child.on('close', (code) => {
      let result = '';
      if (stdout.trim()) {
        result += `stdout:\n${stdout}`;
      }
      if (stderr.trim()) {
        result += `${result ? '\n' : ''}stderr:\n${stderr}`;
      }
      if (code !== 0) {
        result = `Exit code: ${code}\n${result}`;
      }
      resolve(result || 'Command completed with no output.');
    });

    child.on('error', (error) => {
      resolve(`Error spawning command: ${error.message}`);
    });

    // Timeout after 2 minutes
    setTimeout(() => {
      child.kill();
      resolve(`Command timed out after 120 seconds.\n${stdout}\n${stderr}`);
    }, 120000);
  });
};
