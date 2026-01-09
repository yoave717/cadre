import { exec } from 'child_process';
import util from 'util';

const execAsync = util.promisify(exec);

export const runCommand = async (command: string) => {
    try {
        const { stdout, stderr } = await execAsync(command);
        return `stdout:\n${stdout}\nstderr:\n${stderr}`;
    } catch (error: any) {
        return `Error running command: ${error.message}\n${error.stdout ? 'stdout:\n' + error.stdout : ''}\n${error.stderr ? 'stderr:\n' + error.stderr : ''}`;
    }
};
