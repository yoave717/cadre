import { ChatCompletionTool } from 'openai/resources';
import * as fileTools from '../tools/files.js';
import * as runTools from '../tools/run.js';
import * as editTools from '../tools/edit.js';
import * as globTools from '../tools/glob.js';
import * as grepTools from '../tools/grep.js';

export const TOOLS: ChatCompletionTool[] = [
  // File operations
  {
    type: 'function',
    function: {
      name: 'list_files',
      description:
        'List files and directories in a path. Returns entries with [DIR] or [FILE] prefix.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The directory path to list (defaults to current directory)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description:
        'Read the contents of a file. Returns content with line numbers. For large files, use offset and limit.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The path of the file to read',
          },
          offset: {
            type: 'number',
            description: 'Starting line number (0-indexed). Use for large files.',
          },
          limit: {
            type: 'number',
            description: 'Number of lines to read. Use for large files.',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description:
        "Write content to a file. Creates the file if it doesn't exist. IMPORTANT: You must read the file first before overwriting an existing file.",
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The path of the file to write to',
          },
          content: {
            type: 'string',
            description: 'The content to write',
          },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description:
        'Make surgical edits to a file by replacing specific text. The old_string must be unique in the file. You must read the file first.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The path of the file to edit',
          },
          old_string: {
            type: 'string',
            description: 'The exact string to find and replace. Must be unique in the file.',
          },
          new_string: {
            type: 'string',
            description: 'The string to replace it with',
          },
          replace_all: {
            type: 'boolean',
            description: 'If true, replace all occurrences. Default is false (must be unique).',
          },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_directory',
      description: 'Create a directory recursively (like mkdir -p)',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The directory path to create',
          },
        },
        required: ['path'],
      },
    },
  },

  // Search operations
  {
    type: 'function',
    function: {
      name: 'glob',
      description:
        'Find files matching a glob pattern. Supports *, **, ?. Automatically ignores node_modules, .git, etc.',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: "Glob pattern to match (e.g., '**/*.ts', 'src/**/*.js', '*.json')",
          },
          path: {
            type: 'string',
            description: 'Base directory to search from (defaults to current directory)',
          },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'grep',
      description:
        'Search for a pattern in files (like grep). Returns matching lines with file paths and line numbers.',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'Regex pattern to search for',
          },
          path: {
            type: 'string',
            description: 'Directory to search in (defaults to current directory)',
          },
          glob: {
            type: 'string',
            description: "File pattern filter (e.g., '**/*.ts' to only search TypeScript files)",
          },
          context_lines: {
            type: 'number',
            description: 'Number of context lines to show before and after each match',
          },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'directory_tree',
      description: 'Show directory structure as a tree. Useful for understanding project layout.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Directory to show tree for (defaults to current directory)',
          },
          max_depth: {
            type: 'number',
            description: 'Maximum depth to traverse (default 3)',
          },
        },
        required: [],
      },
    },
  },

  // Shell operations
  {
    type: 'function',
    function: {
      name: 'run_command',
      description:
        'Run a shell command. Use for git, npm, build tools, etc. Be cautious with destructive commands.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The shell command to run',
          },
          cwd: {
            type: 'string',
            description: 'Working directory for the command (defaults to current directory)',
          },
        },
        required: ['command'],
      },
    },
  },
];

export const handleToolCall = async (name: string, args: any): Promise<string> => {
  switch (name) {
    // File operations
    case 'list_files':
      return await fileTools.listFiles(args.path);
    case 'read_file':
      return await fileTools.readFile(args.path, args.offset, args.limit);
    case 'write_file':
      return await fileTools.writeFile(args.path, args.content);
    case 'edit_file':
      return await editTools.editFile(
        args.path,
        args.old_string,
        args.new_string,
        args.replace_all,
      );
    case 'create_directory':
      return await fileTools.createDirectory(args.path);

    // Search operations
    case 'glob':
      return await globTools.globFiles(args.pattern, { cwd: args.path });
    case 'grep':
      return await grepTools.grepFiles(args.pattern, {
        cwd: args.path,
        glob: args.glob,
        contextLines: args.context_lines,
      });
    case 'directory_tree':
      return await globTools.directoryTree(args.path, args.max_depth);

    // Shell operations
    case 'run_command':
      return await runTools.runCommand(args.command, args.cwd);

    default:
      return `Unknown tool: ${name}`;
  }
};
