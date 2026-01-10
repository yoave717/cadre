# Command and Path Completion in Cadre

Cadre CLI now includes intelligent command and path completion to make your workflow faster and more efficient.

## Features

### 1. Tab Completion

Press `Tab` to cycle through available completions based on your current input.

#### Command Completion

When typing slash commands, press `Tab` to see or cycle through matching commands:

```bash
You: /he<TAB>
# Completes to: /help

You: /h<TAB>
# Cycles through: /help → /history
```

Available commands:
- `/help` - Show available commands
- `/clear` - Clear conversation history
- `/reset` - Reset session
- `/save` - Save conversation to file
- `/load` - Load conversation from file
- `/list` - List saved conversations
- `/exit` or `/quit` - Exit Cadre
- `/history` or `/log` - Show conversation history
- `/branches` - List available branches
- `/checkout` - Switch to a different branch
- `/new` or `/branch` - Create a new branch
- `/parallel` - Toggle parallel execution mode
- `/multiline` - Enter multi-line mode
- `/normal` - Return to normal mode
- `/context` - Show current context

#### Branch Name Completion

When using `/checkout`, press `Tab` to complete branch names:

```bash
You: /checkout ma<TAB>
# Completes to: /checkout main

You: /checkout feature/<TAB>
# Shows all branches starting with "feature/"
```

#### File Path Completion

Commands like `/save` and `/load` support file path completion:

```bash
You: /save conver<TAB>
# Completes to: /save conversation

You: /load src/<TAB>
# Shows files in the src/ directory
```

Path completion features:
- Completes file and directory names
- Works with relative and absolute paths
- Supports `~` for home directory
- Adds trailing `/` for directories
- Case-sensitive on Unix, case-insensitive on Windows
- Limited to 50 completions for performance

### 2. Inline Suggestions

As you type commands, Cadre shows grayed-out suggestions for command completion.

```bash
You: /he
     lp  # ← grayed out suggestion
```

#### Accepting Suggestions

Press the **Right Arrow** key (→) when at the end of your input to accept the suggestion:

```bash
You: /he<Right Arrow>
# Becomes: /help
```

### 3. Smart Context Awareness

The completion system understands what you're typing:

- **Empty input**: Shows all available commands
- **Command prefix** (e.g., `/h`): Shows matching commands
- **Command with arguments**: Provides context-appropriate completions
  - `/checkout <branch>` → Branch names
  - `/save <path>` → File paths
  - `/load <path>` → File paths

### 4. Case-Insensitive Matching

Command completion is case-insensitive:

```bash
You: /HE<TAB>  # Works!
# Completes to: /help
```

Branch and file completion respects the case sensitivity of your file system.

## Implementation Details

### Architecture

The completion system consists of three main components:

1. **`completion.ts`** - Core completion logic
   - `getCompletions()` - Returns array of possible completions
   - `getInlineSuggestion()` - Returns inline suggestion for current input
   - `getCommandSuggestions()` - Returns top command suggestions

2. **`line-editor.ts`** - Terminal input handling
   - Handles Tab key for cycling completions
   - Handles Right Arrow for accepting suggestions
   - Renders inline suggestions in gray

3. **`interactive.ts`** - Integration with Cadre CLI
   - Provides branch names for completion
   - Configures completion callbacks

### Performance Optimizations

- **Async Completion**: File system operations are asynchronous
- **Completion Limiting**: Maximum 50 file/path completions
- **Cached Branch Names**: Branch names are cached and refreshed per prompt
- **Lazy Evaluation**: Completions computed only when Tab is pressed

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Tab` | Cycle through completions |
| `→` (Right Arrow) | Accept inline suggestion (when at end of line) |
| `←` (Left Arrow) | Move cursor left (normal behavior) |
| `↑` (Up Arrow) | Previous history item |
| `↓` (Down Arrow) | Next history item |
| `Ctrl+R` | Reverse history search |
| `Ctrl+A` | Move to start of line |
| `Ctrl+E` | Move to end of line |
| `Ctrl+U` | Clear entire line |
| `Ctrl+K` | Clear from cursor to end |
| `Ctrl+C` | Cancel/Exit |

## Examples

### Example 1: Command Discovery

```bash
You: /<TAB>
# Shows: /help /clear /reset /save /load /list /exit /quit /history /log /branches /checkout /new /branch /parallel /multiline /normal /context

You: /h<TAB>
# Shows: /help /history

You: /hi<TAB>
# Completes to: /history
```

### Example 2: Branch Checkout

```bash
You: /branches
# Lists available branches:
# - main
# - develop
# - feature/new-ui
# - hotfix/critical-bug

You: /checkout f<TAB>
# Completes to: /checkout feature/new-ui
```

### Example 3: File Path Completion

```bash
You: /save <TAB>
# Shows: conversation.json conversations/ src/ docs/ README.md package.json

You: /save con<TAB>
# Cycles: conversation.json → conversations/

You: /save conversations/<TAB>
# Shows files in conversations/ directory
```

### Example 4: Inline Suggestions

```bash
You: /sa
     ve  # ← Press → to accept
     
You: /save<Right Arrow>
# Accepted! Now shows: /save 

You: /save my<TAB>
# Completes to file starting with "my"
```

## Extending Completion

To add new commands with completion support:

1. **Add command to SLASH_COMMANDS** in `src/input/completion.ts`:
```typescript
const SLASH_COMMANDS = [
  // ... existing commands
  '/mynewcommand',
] as const;
```

2. **Add to PATH_COMMANDS if it needs file completion**:
```typescript
const PATH_COMMANDS = ['/save', '/load', '/mynewcommand'] as const;
```

3. **Or add custom completion logic** in `getCompletions()` function:
```typescript
if (text.startsWith('/mynewcommand ')) {
  return await getMyCustomCompletions(text);
}
```

## Troubleshooting

### Completions Not Showing

1. **Check if in TTY mode**: Completion only works in interactive terminals
2. **Verify file permissions**: Path completion needs read access to directories
3. **Check branch context**: Branch completion requires valid Git repository

### Slow Completions

1. **Large directories**: Completion limited to 50 items
2. **Network paths**: May be slow, use relative paths when possible
3. **Async operations**: File system operations are async, slight delay is normal

### Completion Not Cycling

1. **Press Tab again**: First Tab shows first completion, subsequent Tabs cycle
2. **Modify input**: Changing input resets completion cycle
3. **Check terminal**: Some terminals may intercept Tab key

## Future Enhancements

Planned improvements:
- Fuzzy matching for file paths
- Git-aware path completion (ignore .gitignore files)
- Command history-based suggestions
- Smart suggestions based on current context
- Completion for command arguments beyond paths
- Completion descriptions/hints

## API Reference

### `getCompletions(text: string, cachedBranchNames?: string[]): Promise<string[]>`

Returns array of possible completions for the given input text.

**Parameters:**
- `text` - Current input text
- `cachedBranchNames` - Optional array of branch names for `/checkout` completion

**Returns:** Promise resolving to array of completion strings

### `getInlineSuggestion(text: string, cachedBranchNames?: string[]): string`

Returns inline suggestion that should be displayed in gray after cursor.

**Parameters:**
- `text` - Current input text
- `cachedBranchNames` - Optional array of branch names

**Returns:** String to display as suggestion (empty if no suggestion)

### `getCommandSuggestions(text: string): string[]`

Returns top 5 command suggestions for partial input.

**Parameters:**
- `text` - Current input text

**Returns:** Array of up to 5 command suggestions

## Testing

Run completion tests:

```bash
npm test -- completion.test.ts
```

Test coverage includes:
- Command completion and filtering
- Branch name completion
- File path completion
- Inline suggestions
- Edge cases and error handling

---

**Note**: This feature requires a TTY-compatible terminal. It may not work in some CI/CD environments or when piping input/output.
