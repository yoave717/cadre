import { ChatCompletionTool } from "openai/resources";
import * as fileTools from '../tools/files.js';
import * as runTools from '../tools/run.js';

export const TOOLS: ChatCompletionTool[] = [
    {
        type: "function",
        function: {
            name: "list_files",
            description: "List files in a directory",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "The directory path to list (default to current directory)",
                    },
                },
                required: [],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "read_file",
            description: "Read the contents of a file",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "The path of the file to read",
                    },
                },
                required: ["path"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "write_file",
            description: "Write content to a file",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "The path of the file to write to",
                    },
                    content: {
                        type: "string",
                        description: "The content to write",
                    },
                },
                required: ["path", "content"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "create_directory",
            description: "Create a directory recursively",
            parameters: {
                type: "object",
                properties: {
                    path: {
                        type: "string",
                        description: "The directory path to create",
                    },
                },
                required: ["path"],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "run_command",
            description: "Run a shell command",
            parameters: {
                type: "object",
                properties: {
                    command: {
                        type: "string",
                        description: "The command to run",
                    },
                },
                required: ["command"],
            },
        },
    },
];

export const handleToolCall = async (name: string, args: any) => {
    switch (name) {
        case 'list_files':
            return await fileTools.listFiles(args.path);
        case 'read_file':
            return await fileTools.readFile(args.path);
        case 'write_file':
            return await fileTools.writeFile(args.path, args.content);
        case 'create_directory':
            return await fileTools.createDirectory(args.path);
        case 'run_command':
            return await runTools.runCommand(args.command);
        default:
            return `Unknown tool: ${name}`;
    }
}
