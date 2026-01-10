# Cadre

Cadre is a Claude Code-like AI Coding Assistant CLI that provides an intelligent, terminal-based coding experience. It connects to OpenAI-compatible APIs (OpenAI, vLLM, Together, Qwen, etc.) to bring powerful AI assistance directly to your terminal.

## Features

- **Interactive Agent Loop** - Natural conversation with your codebase
- **Streaming Responses** - Real-time token streaming
- **Full Tool Suite** - Read, write, edit files, run commands, glob, grep
- **Project Indexing** - Fast symbol and file search with on-prem indexing (like Cursor IDE)
- **Context Compression** - Automatic summarization for long conversations
- **Permission System** - Per-project permissions with "remember" option
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

| Command   | Description                   |
| --------- | ----------------------------- |
| `/help`   | Show available commands       |
| `/branch` | Manage conversation branches  |
| `/clear`  | Clear conversation history    |
| `/stats`  | Show context/token statistics |
| `/config` | Show current configuration    |
| `/exit`   | Exit the session              |

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

- History is automatically saved to `~/.ai/history`
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
| Tool              | Description                                       |
| ----------------- | ------------------------------------------------- |
| `build_index`     | Build project index for fast search               |
| `update_index`    | Update index incrementally (only changed files)   |
| `search_symbols`  | Search for functions, classes, etc. (much faster) |
| `find_files`      | Find files by name (faster than glob)             |
| `get_file_symbols`| Get all symbols in a file                         |
| `find_importers`  | Find files importing a specific module            |
| `index_stats`     | Show index statistics                             |

### Shell Operations
| Tool          | Description              |
| ------------- | ------------------------ |
| `run_command` | Execute shell commands   |

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
