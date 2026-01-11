import { ChatCompletionTool } from 'openai/resources';
import * as fileTools from '../tools/files.js';
import * as runTools from '../tools/run.js';
import * as editTools from '../tools/edit.js';
import * as globTools from '../tools/glob.js';
import * as grepTools from '../tools/grep.js';
import * as indexTools from '../tools/index.js';
import * as gitTools from '../tools/git.js';
import * as gitflowTools from '../tools/gitflow.js';
import * as prTools from '../tools/pr.js';

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
        "Write content to a file. Creates the file if it doesn't exist. Read the file first when overwriting existing files.",
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
        'Make surgical edits to a file by replacing specific text. The old_string must be unique in the file. Read the file first when needed.',
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
          start_line: {
            type: 'number',
            description: 'Optional start line (1-indexed) to restrict editing scope.',
          },
          end_line: {
            type: 'number',
            description: 'Optional end line (1-indexed) to restrict editing scope.',
          },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'multi_edit_file',
      description:
        'Perform multiple edits to a single file in one go. Edits are applied sequentially, so effectively atomic. If one fails, none are saved.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The path of the file to edit',
          },
          edits: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                old_string: { type: 'string', description: 'String to replace' },
                new_string: { type: 'string', description: 'Replacement string' },
                replace_all: {
                  type: 'boolean',
                  description: 'Replace all occurrences (default false)',
                },
                start_line: { type: 'number', description: 'Optional start line (1-indexed)' },
                end_line: { type: 'number', description: 'Optional end line (1-indexed)' },
              },
              required: ['old_string', 'new_string'],
            },
            description: 'List of edits to apply',
          },
        },
        required: ['path', 'edits'],
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
        'Run a shell command. Use for npm, build tools, etc. For git operations, prefer specialized git tools.',
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

  // Index operations
  {
    type: 'function',
    function: {
      name: 'build_index',
      description:
        'Build a complete index of the project for fast search. Indexes files, symbols, and dependencies. Run this once when starting work on a project.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_index',
      description:
        'Update the existing project index incrementally (only changed files). Faster than build_index.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_symbols',
      description:
        'Search for code symbols (functions, classes, interfaces, etc.) in the indexed project. Much faster than grep for finding definitions.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Symbol name to search for (supports partial matching)',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results (default 50)',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_files',
      description:
        'Find files by path or name pattern using the index. Faster than glob for large projects.',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'File path or name pattern to search for',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results (default 100)',
          },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_file_symbols',
      description:
        'Get all symbols defined in a specific file from the index. Useful for understanding file structure.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the file',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_importers',
      description:
        'Find all files that import a specific module. Useful for understanding dependencies.',
      parameters: {
        type: 'object',
        properties: {
          module: {
            type: 'string',
            description: 'Module name to search for',
          },
        },
        required: ['module'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'index_stats',
      description:
        'Show statistics about the current project index (file count, symbol count, languages, etc.)',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },

  // Git operations
  {
    type: 'function',
    function: {
      name: 'git_status',
      description:
        'Get current git repository status with structured output. Shows current branch, staged/unstaged files, and untracked files.',
      parameters: {
        type: 'object',
        properties: {
          cwd: {
            type: 'string',
            description: 'Working directory (defaults to current directory)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_branch',
      description:
        'Git branch operations: list all branches, create new branch, switch to existing branch, or delete branch.',
      parameters: {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            description: "Operation to perform: 'list', 'create', 'switch', or 'delete'",
            enum: ['list', 'create', 'switch', 'delete'],
          },
          branch_name: {
            type: 'string',
            description: 'Branch name (required for create, switch, and delete operations)',
          },
          cwd: {
            type: 'string',
            description: 'Working directory (defaults to current directory)',
          },
        },
        required: ['operation'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_commit',
      description:
        'Create a git commit. Stages files (or all changes) and commits with the given message. Use conventional commit format.',
      parameters: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            description:
              "Commit message. Use conventional commit format: 'type(scope): description'",
          },
          files: {
            type: 'array',
            items: { type: 'string' },
            description: 'Specific files to stage and commit (if omitted, stages all changes)',
          },
          cwd: {
            type: 'string',
            description: 'Working directory (defaults to current directory)',
          },
        },
        required: ['message'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_sync',
      description:
        'Sync with remote repository: fetch, pull, or push changes. Includes safety checks for protected branches.',
      parameters: {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            description: "Operation to perform: 'fetch', 'pull', or 'push'",
            enum: ['fetch', 'pull', 'push'],
          },
          remote: {
            type: 'string',
            description: "Remote name (defaults to 'origin')",
          },
          branch: {
            type: 'string',
            description: 'Branch name (optional, uses current branch if omitted)',
          },
          cwd: {
            type: 'string',
            description: 'Working directory (defaults to current directory)',
          },
        },
        required: ['operation'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_log',
      description: 'View git commit history with formatted output.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: 'Number of commits to show (default: 10)',
          },
          format: {
            type: 'string',
            description: "Output format: 'oneline' or 'detailed' (default: 'oneline')",
            enum: ['oneline', 'detailed'],
          },
          cwd: {
            type: 'string',
            description: 'Working directory (defaults to current directory)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'git_diff',
      description:
        'View git diff for working directory, staged changes, or against a specific commit/branch.',
      parameters: {
        type: 'object',
        properties: {
          target: {
            type: 'string',
            description:
              "What to diff: 'working' (unstaged changes), 'staged' (staged changes), or a commit/branch reference",
          },
          cwd: {
            type: 'string',
            description: 'Working directory (defaults to current directory)',
          },
        },
        required: [],
      },
    },
  },

  // Gitflow operations
  {
    type: 'function',
    function: {
      name: 'gitflow_init',
      description:
        'Initialize gitflow in the repository. Sets up main/develop branches and gitflow configuration.',
      parameters: {
        type: 'object',
        properties: {
          cwd: {
            type: 'string',
            description: 'Working directory (defaults to current directory)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'gitflow_feature',
      description:
        'Gitflow feature operations: start new feature, finish feature (merge to develop), or list features.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: "Action to perform: 'start', 'finish', or 'list'",
            enum: ['start', 'finish', 'list'],
          },
          name: {
            type: 'string',
            description: 'Feature name (required for start and finish)',
          },
          cwd: {
            type: 'string',
            description: 'Working directory (defaults to current directory)',
          },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'gitflow_release',
      description:
        'Gitflow release operations: start release branch, finish release (merge to main and develop, create tag), or list releases.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: "Action to perform: 'start', 'finish', or 'list'",
            enum: ['start', 'finish', 'list'],
          },
          version: {
            type: 'string',
            description: 'Version number (required for start and finish)',
          },
          cwd: {
            type: 'string',
            description: 'Working directory (defaults to current directory)',
          },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'gitflow_hotfix',
      description:
        'Gitflow hotfix operations: start hotfix from main, finish hotfix (merge to main and develop, create tag), or list hotfixes.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            description: "Action to perform: 'start', 'finish', or 'list'",
            enum: ['start', 'finish', 'list'],
          },
          version: {
            type: 'string',
            description: 'Version number (required for start and finish)',
          },
          cwd: {
            type: 'string',
            description: 'Working directory (defaults to current directory)',
          },
        },
        required: ['action'],
      },
    },
  },

  // Pull Request operations
  {
    type: 'function',
    function: {
      name: 'create_auto_branch',
      description:
        'Create an automatic branch for a new task with naming pattern: cadre/<feature-name>-<random-hash>. Similar to Claude Code branch creation.',
      parameters: {
        type: 'object',
        properties: {
          feature_name: {
            type: 'string',
            description:
              'Feature or task name (will be sanitized). Example: "add-login-feature" becomes "cadre/add-login-feature-a1b2c"',
          },
          cwd: {
            type: 'string',
            description: 'Working directory (defaults to current directory)',
          },
        },
        required: ['feature_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_pr_requirements',
      description:
        'Check if GitHub CLI (gh) or GitLab CLI (glab) is installed and authenticated. Shows installation/authentication instructions if needed.',
      parameters: {
        type: 'object',
        properties: {
          cwd: {
            type: 'string',
            description: 'Working directory (defaults to current directory)',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_pull_request',
      description:
        'Create a pull request (GitHub) or merge request (GitLab). Provide a summary that explains what problem is being solved and how. Technical details are added automatically.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'PR/MR title - clear and descriptive',
          },
          summary: {
            type: 'string',
            description:
              'Concise summary explaining what problem/feature this addresses and how it was implemented.',
          },
          body: {
            type: 'string',
            description:
              'Complete PR/MR body (optional - if not provided, will auto-generate using summary + commits + file changes)',
          },
          base_branch: {
            type: 'string',
            description: "Base branch to merge into (optional - defaults to 'main' or 'master')",
          },
          draft: {
            type: 'boolean',
            description: 'Create as draft PR/MR (optional, default false)',
          },
          cwd: {
            type: 'string',
            description: 'Working directory (defaults to current directory)',
          },
        },
        required: ['title', 'summary'],
      },
    },
  },
];

export const handleToolCall = async (
  name: string,
  args: any,
  executionContext?: string,
): Promise<string> => {
  switch (name) {
    // File operations
    case 'list_files':
      return fileTools.listFiles(args.path);
    case 'read_file':
      return fileTools.readFile(args.path, args.offset, args.limit);
    case 'write_file':
      return fileTools.writeFile(args.path, args.content, executionContext);
    case 'edit_file':
      return editTools.editFile(
        args.path,
        args.old_string,
        args.new_string,
        args.replace_all,
        args.start_line,
        args.end_line,
        executionContext,
      );
    case 'multi_edit_file':
      return editTools.multiEditFile(
        args.path,
        args.edits.map((e: any) => ({
          oldString: e.old_string,
          newString: e.new_string,
          replaceAll: e.replace_all,
          startLine: e.start_line,
          endLine: e.end_line,
        })),
        executionContext,
      );
    case 'create_directory':
      return fileTools.createDirectory(args.path);

    // Search operations
    case 'glob':
      return globTools.globFiles(args.pattern, { cwd: args.path });
    case 'grep':
      return grepTools.grepFiles(args.pattern, {
        cwd: args.path,
        glob: args.glob,
        contextLines: args.context_lines,
      });
    case 'directory_tree':
      return globTools.directoryTree(args.path, args.max_depth);

    // Shell operations
    case 'run_command':
      return runTools.runCommand(args.command, args.cwd, executionContext);

    // Index operations
    case 'build_index':
      return indexTools.buildIndex();
    case 'update_index':
      return indexTools.updateIndex();
    case 'search_symbols':
      return indexTools.searchSymbols(args.query, { limit: args.limit });
    case 'find_files':
      return indexTools.findFiles(args.pattern, { limit: args.limit });
    case 'get_file_symbols':
      return indexTools.getFileSymbols(args.path);
    case 'find_importers':
      return indexTools.findImporters(args.module);
    case 'index_stats':
      return indexTools.indexStats();

    // Git operations
    case 'git_status':
      return gitTools.gitStatus(args.cwd);
    case 'git_branch':
      return gitTools.gitBranch(args.operation, args.branch_name, args.cwd);
    case 'git_commit':
      return gitTools.gitCommit(args.message, args.files, args.cwd);
    case 'git_sync':
      return gitTools.gitSync(args.operation, args.remote, args.branch, args.cwd);
    case 'git_log':
      return gitTools.gitLog(args.limit, args.format, args.cwd);
    case 'git_diff':
      return gitTools.gitDiff(args.target, args.cwd);

    // Gitflow operations
    case 'gitflow_init':
      return gitflowTools.gitflowInit(args.cwd);
    case 'gitflow_feature':
      return gitflowTools.gitflowFeature(args.action, args.name, args.cwd);
    case 'gitflow_release':
      return gitflowTools.gitflowRelease(args.action, args.version, args.cwd);
    case 'gitflow_hotfix':
      return gitflowTools.gitflowHotfix(args.action, args.version, args.cwd);

    // Pull Request operations
    case 'create_auto_branch': {
      const result = await prTools.createAutoBranch(args.feature_name, args.cwd);
      return JSON.stringify(result, null, 2);
    }
    case 'check_pr_requirements': {
      const result = await prTools.checkPrRequirements(args.cwd);
      return JSON.stringify(result, null, 2);
    }
    case 'create_pull_request': {
      const result = await prTools.createPullRequest({
        title: args.title,
        body: args.body,
        summary: args.summary,
        baseBranch: args.base_branch,
        draft: args.draft,
        cwd: args.cwd,
      });
      return JSON.stringify(result, null, 2);
    }

    default:
      return `Unknown tool: ${name}`;
  }
};
