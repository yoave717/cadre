# Cadre

Cadre is a Claude Code-like AI Coding Assistant CLI that provides an intelligent, terminal-based coding experience. It connects to OpenAI-compatible APIs (OpenAI, vLLM, Together, Qwen, etc.) to bring powerful AI assistance directly to your terminal.

## Features

- **Multi-Worker Parallel Execution** - Execute complex tasks with multiple AI agents running in parallel
- **Interactive Agent Loop** - Natural conversation with your codebase
- **Streaming Responses** - Real-time token streaming
- **Full Tool Suite** - Read, write, edit files, run commands, glob, grep
- **Project Indexing** - Fast symbol and file search with on-prem indexing (like Cursor IDE)
- **Git Workflow Integration** - Automatic branch creation and PR/MR creation for GitHub & GitLab
- **Automatic PR Descriptions** - Auto-generates PR descriptions from commits and changes
- **Context Compression** - Automatic summarization for long conversations
- **Permission System** - Per-project permissions with queued prompts for multi-worker safety
- **Multi-model Support** - OpenAI, vLLM, Together, Qwen, and other OpenAI-compatible APIs
- **Conversation Branching** - Create named branches to experiment with multiple solutions
- **Cross-platform** - Works on Mac, Linux, and Windows

## Installation

### Quick Install (Mac/Linux)

```bash
curl -fsSL https://raw.githubusercontent.com/yoave717/cadre/main/scripts/install.sh | bash
```

### Quick Install (Windows PowerShell)

```powershell
iwr -useb https://raw.githubusercontent.com/yoave717/cadre/main/scripts/install.ps1 | iex
```

### From npm

```bash
npm install -g cadre
```

### From Source

```bash
git clone https://github.com/yoave717/cadre.git
cd cadre
npm install
npm run build
npm link
```

## Configuration

### Option 1: Environment File (.env)

Create a `.env` file in your project directory or `~/.cadre/.env`:

```env
OPENAI_API_KEY=sk-your-api-key-here
MODEL_NAME=gpt-4o
```

### Option 2: CLI Configuration

```bash
cadre config --key sk-your-api-key-here --model gpt-4o
```

### For OpenAI-compatible APIs (vLLM, Together, etc.)

```env
API_KEY=your-api-key
API_BASE_URL=http://localhost:8000/v1
MODEL_NAME=meta-llama/Meta-Llama-3-8B-Instruct
```

Or for Qwen via Together:

```env
API_KEY=your-together-api-key
API_BASE_URL=https://api.together.xyz/v1
MODEL_NAME=Qwen/Qwen2.5-Coder-32B-Instruct
```

## Usage

### Interactive Mode

```bash
cadre
```

### With Initial Prompt

```bash
cadre "explain this codebase"
```

### One-shot Mode (print and exit)

```bash
cadre -p "what does the main function do?"
```

### Override Model

```bash
cadre --model gpt-4-turbo "review this code"
```

## Interactive Commands

| Command        | Description                                  |
| -------------- | -------------------------------------------- |
| `/help`        | Show available commands                      |
| `/parallel`    | Execute task with multiple workers           |
| `/workers`     | Show worker pool status                      |
| `/branch`      | Manage conversation branches                 |
| `/clear`       | Clear conversation history                   |
| `/stats`       | Show context/token statistics                |
| `/config`      | Show current configuration                   |
| `/exit`        | Exit the session                             |

## Multi-Worker Parallel Execution

Cadre can execute complex tasks using multiple AI workers in parallel, dramatically speeding up multi-faceted development work.

### How It Works

When you provide a complex request, Cadre:
1. **Analyzes** your request using LLM-based task decomposition
2. **Plans** subtasks that can run in parallel
3. **Spawns** multiple worker agents (up to 4 by default)
4. **Executes** independent tasks concurrently
5. **Aggregates** results and presents them to you

### Auto-Detection

Cadre automatically detects when a task might benefit from parallel execution and prompts you:

```
You: Refactor the authentication module, update all tests, and fix linting errors
💡 This task might benefit from parallel execution. Use multi-worker mode? (y/n):
```

Keywords that trigger auto-detection:
- "and also", "and then", "multiple", "several"
- "all files", "update all", "fix all", "refactor"
- Long requests (>100 chars) with multiple items

### Manual Parallel Execution

Use the `/parallel` command to explicitly use multi-worker mode:

```
/parallel Refactor authentication module, update tests, and fix linting
```

### Example Output

```
🧠 Analyzing request and planning tasks...
✓ Created plan with 3 subtasks
  Main goal: Refactor authentication and update tests

📋 Task Plan:
  Group 1 (2 tasks in parallel):
    • task-1: Refactor authentication module [medium]
    • task-2: Update test files [low]
  Group 2 (1 tasks in parallel):
    • task-3: Run linter and fix errors [low] [depends on: task-1, task-2]

⚡ Executing parallel group 1/2
  Tasks: 2
  → worker-1: Starting task-1
    "Refactor authentication module"
  → worker-2: Starting task-2
    "Update test files"
  ✓ worker-1: Completed task-1 in 45.2s, 12 tool calls
  ✓ worker-2: Completed task-2 in 38.1s, 8 tool calls
  ✓ Group complete: 2 succeeded, 0 failed

⚡ Executing parallel group 2/2
  Tasks: 1
  → worker-1: Starting task-3
    "Run linter and fix errors"
  ✓ worker-1: Completed task-3 in 15.3s, 5 tool calls
  ✓ Group complete: 1 succeeded, 0 failed

✓ Completed in 60.5s: 3 succeeded, 0 failed
```

### Worker Status

Check the status of your worker pool:

```
/workers
```

Output:
```
👷 Worker Pool Status:

  Total Workers:     2
  Idle:              2
  Busy:              0
  Error:             0
  Stopped:           0
  Tasks Completed:   3
  Total Errors:      0
```

### Permission Handling

Workers prompt for permissions as needed. When a worker needs permission:

```
⚠ Permission required
  Project: cadre
  Path:    /home/user/cadre
  Action:  write file: src/auth.ts
  Requester: worker-1

Allow write operations for worker-1 in cadre?
  ▸ Yes, just this once
    Yes, always for this project (remember)
    No, deny
```

**Key Features:**
- **Queued Prompts**: Only one permission dialog at a time (no conflicts)
- **Shared Permissions**: Once granted, all workers benefit
- **Worker Attribution**: You always know which worker is asking

### Configuration

Configure the worker pool (in `.env` or via environment):

```env
# Maximum concurrent workers (default: 4)
MAX_WORKERS=4

# Worker timeout in milliseconds (default: none)
WORKER_TIMEOUT_MS=300000
```

### Best Use Cases

Multi-worker execution excels at:
- **Multi-file refactoring**: Update multiple modules simultaneously
- **Batch operations**: Fix linting errors across many files
- **Parallel testing**: Update tests while modifying code
- **Documentation**: Generate docs for multiple components
- **Code review**: Analyze multiple files in parallel

### Single Worker vs Multi-Worker

| Aspect          | Single Worker              | Multi-Worker                    |
| --------------- | -------------------------- | ------------------------------- |
| Simple tasks    | ✅ Faster (no overhead)    | ⚠️ Slower (planning overhead)   |
| Complex tasks   | ⏳ Sequential execution    | ⚡ Parallel execution           |
| Dependencies    | ✅ Natural flow            | ✅ Handled via groups           |
| Permissions     | 📝 One prompt              | 📝 One prompt per worker type   |
| Resource usage  | 💚 Lower                   | 💛 Higher (multiple API calls)  |

## Input History & Navigation

Cadre provides full terminal-like command history navigation for efficient reuse of previous commands:

### Arrow Key Navigation

- **Up Arrow** (`↑`) - Navigate backward through previous commands
- **Down Arrow** (`↓`) - Navigate forward through history or return to current input
- History wraps at boundaries for seamless navigation

### Reverse Search (Ctrl+R)

Press `Ctrl+R` to enter reverse-i-search mode:

```
(reverse-i-search)`npm': npm install [1/3]
```

- **Type** to filter commands matching your query
- **Up/Down** arrows to navigate through matches
- **Enter** to select and use the matched command
- **ESC** to cancel and return to normal input

### History Persistence

- History is automatically saved to `~/.cadre/history`
- Persists across sessions
- Maximum 1000 entries (oldest automatically removed)
- Empty commands and consecutive duplicates are ignored
- Loads in <50ms even with 1000 entries

## CLI Commands

```bash
# Start interactive session
cadre

# Run with prompt
cadre "your prompt here"

# One-shot mode (no follow-up)
cadre -p "your prompt here"

# Configure
cadre config --key <api-key> --model <model-name> --url <api-url>
cadre config --show

# Manage permissions
cadre permissions list
cadre permissions clear
cadre permissions revoke /path/to/project

# Detect language
cadre detect

# Manage project index
cadre index build          # Build index for fast search
cadre index update         # Update index incrementally
cadre index stats          # Show index statistics
cadre index list           # List all indexed projects
cadre index clear          # Clear all indexes

# Reset configuration
cadre reset
```

## Project Indexing

Cadre includes a powerful on-prem project indexing system (similar to Cursor IDE) that makes searching large codebases fast and efficient. The index is stored locally in `~/.cadre/indexes/` and contains:

- **File metadata** - paths, sizes, modification times, content hashes
- **Symbol extraction** - functions, classes, interfaces, types, variables, constants
- **Import/export tracking** - dependency relationships
- **Language detection** - automatic language identification

### Building an Index

Build a project index before starting work for best performance:

```bash
cadre index build
```

This will scan your project and create an index containing:

- All source files (excluding node_modules, .git, etc.)
- All code symbols with their locations and types
- Import/export relationships

### Using the Index

Once indexed, the AI can use fast search tools:

```
> search for the loadConfig function

Found 1 symbol:
src/config.ts:48 - function loadConfig (exported)
  export function loadConfig(): Config {
```

The index enables much faster operations:

- `search_symbols` - Find functions/classes instantly (vs. grep)
- `find_files` - Locate files by name quickly (vs. glob)
- `find_importers` - See what imports a module
- `get_file_symbols` - View all symbols in a file

### Keeping the Index Updated

Update the index incrementally after making changes:

```bash
cadre index update
```

This only re-indexes changed files, making it very fast.

### Index Storage

Indexes are stored per-project in `~/.cadre/indexes/` using a hash of the project path. This means:

- Each project has its own index
- Indexes persist across sessions
- Safe for multiple projects
- Fully on-premises (no cloud)

## Git Workflow Integration

Cadre seamlessly integrates with your Git workflow, automatically creating branches and pull requests/merge requests on both GitHub and GitLab.

### Automatic Branch Creation

When working on a new task, Cadre can automatically create feature branches with a consistent naming pattern (similar to Claude Code):

```
cadre/<feature-name>-<random-hash>
```

Example: `cadre/add-login-feature-a1b2c`

The AI agent will:

- Sanitize feature names (lowercase, hyphens for spaces)
- Add a random 5-character hash for uniqueness
- Create and checkout the new branch automatically

### Pull Request / Merge Request Creation

Cadre can create PRs (GitHub) or MRs (GitLab) directly from the CLI using official CLI tools:

- **GitHub**: Uses `gh` CLI
- **GitLab**: Uses `glab` CLI

#### Prerequisites

Install the appropriate CLI tool for your platform:

**GitHub CLI (`gh`)**:

```bash
# macOS
brew install gh

# Linux (Debian/Ubuntu)
sudo apt install gh

# Windows (winget)
winget install --id GitHub.cli
```

**GitLab CLI (`glab`)**:

```bash
# macOS
brew install glab

# Linux (Debian/Ubuntu)
sudo apt install glab

# Windows (scoop)
scoop install glab
```

Then authenticate:

```bash
gh auth login   # For GitHub
glab auth login # For GitLab
```

#### Automatic PR Description Generation

When creating a PR/MR, Cadre generates comprehensive descriptions that include:

- **High-level Summary** - Explains WHAT problem is being solved, HOW it was implemented, and WHY this approach was chosen
- **What Changed** - Lists all commits since the branch diverged
- **Technical Details** - File change statistics and key files modified
- **Testing Checklist** - Pre-populated checklist items
- **Template Integration** - Uses your project's PR/MR template if available

**Key Feature:** The AI is instructed to always provide meaningful context when creating PRs, not just list commits. It must explain the rationale and approach.

Example generated PR description:

```markdown
## Summary

This PR adds automatic branch creation and PR/MR support to streamline Git workflows in Cadre.

**What:** Implements automatic branch creation with the naming pattern `cadre/<feature>-<hash>` (similar to Claude Code) and adds PR/MR creation capabilities for both GitHub and GitLab.

**How:** Uses the official `gh` and `glab` CLI tools for PR/MR creation, with automatic repository type detection and smart base branch identification. Branch names are sanitized and include a random 5-character hash for uniqueness.

**Why:** This reduces manual branch management overhead and provides a consistent workflow across different Git platforms. The automated PR creation ensures developers can quickly open pull requests with comprehensive descriptions without leaving the terminal.

## What Changed

- feat: add automatic branch creation and PR/MR support
- feat: implement PR description generation
- docs: update README with Git workflow documentation
- test: add comprehensive test coverage

## Technical Details

**Files changed:** 8 | **Lines added:** 750 | **Lines deleted:** 12

### Key Files Modified

- `src/tools/pr.ts` (+256/-0)
- `src/tools/repo-utils.ts` (+155/-0)
- `src/tools/cli-utils.ts` (+154/-0)
- `src/agent/tools.ts` (+95/-12)

## Testing

- [ ] Tests pass locally
- [ ] Code follows project style guidelines
- [ ] Changes have been manually tested

---

_This PR was created by Cadre AI_
```

### Available Git Tools

The AI agent has access to these Git workflow tools:

| Tool                    | Description                                             |
| ----------------------- | ------------------------------------------------------- |
| `create_auto_branch`    | Create branch with pattern: `cadre/<feature>-<hash>`    |
| `check_pr_requirements` | Check if GitHub/GitLab CLI is installed & authenticated |
| `create_pull_request`   | Create PR/MR with auto-generated description            |
| `git_status`            | Get repository status                                   |
| `git_branch`            | List, create, switch, or delete branches                |
| `git_commit`            | Create commits with conventional format                 |
| `git_sync`              | Fetch, pull, or push changes                            |
| `git_log`               | View commit history                                     |
| `git_diff`              | View diffs                                              |

### Example Workflow

```bash
# Start working on a feature
cadre "Implement user authentication"

# Cadre will:
# 1. Create branch: cadre/implement-user-authentication-x7k9p
# 2. Make the necessary changes
# 3. Commit with descriptive messages
# 4. Create a PR with auto-generated description

# The AI handles the entire workflow automatically!
```

## Tools

Cadre has access to the following tools:

### File Operations

| Tool               | Description                                |
| ------------------ | ------------------------------------------ |
| `read_file`        | Read file contents with line numbers       |
| `write_file`       | Write content to a file                    |
| `edit_file`        | Make surgical edits via string replacement |
| `list_files`       | List directory contents                    |
| `create_directory` | Create directories                         |

### Search Operations

| Tool             | Description                             |
| ---------------- | --------------------------------------- |
| `glob`           | Find files by pattern (e.g., `**/*.ts`) |
| `grep`           | Search file contents with regex         |
| `directory_tree` | Show directory structure                |

### Index Operations (Fast Search)

| Tool               | Description                                       |
| ------------------ | ------------------------------------------------- |
| `build_index`      | Build project index for fast search               |
| `update_index`     | Update index incrementally (only changed files)   |
| `search_symbols`   | Search for functions, classes, etc. (much faster) |
| `find_files`       | Find files by name (faster than glob)             |
| `get_file_symbols` | Get all symbols in a file                         |
| `find_importers`   | Find files importing a specific module            |
| `index_stats`      | Show index statistics                             |

### Shell Operations

| Tool          | Description            |
| ------------- | ---------------------- |
| `run_command` | Execute shell commands |

## Permission System

When Cadre needs to run commands or write files, it asks for permission:

```
⚠ Permission required
  Project: my-project
  Path:    /Users/me/projects/my-project
  Action:  run command: npm install

? Allow bash operations in my-project?
  ❯ Yes, just this once
    Yes, always for this project (remember)
    No, deny
```

Permissions are stored in `~/.cadre/permissions.json` and remembered per git project.

## Context Management

Cadre automatically manages context to stay within token limits:

- **Token Counting** - Estimates tokens in conversation
- **Automatic Compression** - Summarizes old messages when context is ~80% full
- **Tool Result Truncation** - Large outputs are automatically truncated

View statistics with `/stats` command.

## Requirements

- Node.js 20+
- npm
- An API key for your chosen model provider

## Project Structure

```
cadre/
├── src/
│   ├── index.ts          # CLI entry point
│   ├── agent/            # Agent loop and tools
│   ├── context/          # Context management
│   ├── permissions/      # Permission system
│   ├── index-system/     # Project indexing for fast search
│   ├── input/            # Image and multi-line input
│   ├── tools/            # Tool implementations
│   └── ui/               # Interactive UI
├── scripts/              # Install scripts
└── .env.example          # Example configuration
```

## License

MIT
