# Cadre

Cadre is a Claude Code-like AI Coding Assistant CLI that provides an intelligent, terminal-based coding experience. It connects to OpenAI-compatible APIs (OpenAI, vLLM, Together, Qwen, etc.) to bring powerful AI assistance directly to your terminal.

## Features

- **Interactive Agent Loop** - Natural conversation with your codebase
- **Streaming Responses** - Real-time token streaming
- **Full Tool Suite** - Read, write, edit files, run commands, glob, grep
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

# Reset configuration
cadre reset
```

## Tools

Cadre has access to the following tools:

| Tool               | Description                                |
| ------------------ | ------------------------------------------ |
| `read_file`        | Read file contents with line numbers       |
| `write_file`       | Write content to a file                    |
| `edit_file`        | Make surgical edits via string replacement |
| `list_files`       | List directory contents                    |
| `create_directory` | Create directories                         |
| `glob`             | Find files by pattern (e.g., `**/*.ts`)    |
| `grep`             | Search file contents with regex            |
| `directory_tree`   | Show directory structure                   |
| `run_command`      | Execute shell commands                     |

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
│   ├── input/            # Image and multi-line input
│   ├── tools/            # Tool implementations
│   └── ui/               # Interactive UI
├── scripts/              # Install scripts
└── .env.example          # Example configuration
```

## License

MIT
