import fs from 'fs/promises';
import path from 'path';

export const listFiles = async (dirPath: string = '.') => {
    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        return entries.map(entry => {
            return `${entry.isDirectory() ? '[DIR]' : '[FILE]'} ${entry.name}`;
        }).join('\n');
    } catch (error: any) {
        return `Error listing files: ${error.message}`;
    }
};

export const readFile = async (filePath: string) => {
    try {
        const content = await fs.readFile(filePath, 'utf-8');
        return content;
    } catch (error: any) {
        return `Error reading file: ${error.message}`;
    }
};

export const writeFile = async (filePath: string, content: string) => {
    try {
        await fs.writeFile(filePath, content, 'utf-8');
        return `Successfully wrote to ${filePath}`;
    } catch (error: any) {
        return `Error writing file: ${error.message}`;
    }
}

export const createDirectory = async (dirPath: string) => {
    try {
        await fs.mkdir(dirPath, { recursive: true });
        return `Successfully created directory ${dirPath}`;
    } catch (error: any) {
        return `Error creating directory: ${error.message}`;
    }
}
