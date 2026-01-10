---
description: how to commit changes with conventional commits
---

This workflow guides you through creating a well-structured git commit using conventional commit format.

## Prerequisites

- You have staged changes (`git add`)
- Working directory is in a git repository

## Steps

### 1. Check Status

Review what files are staged and ready to commit.

// turbo

```bash
git status
```

### 2. Review Changes

View the diff of staged changes to ensure you're committing what you intended.

```bash
git diff --staged
```

### 3. Commit with Conventional Format

Commit your changes using the conventional commit format: `type(scope): description`

**Common types:**

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Changes that don't affect code meaning (formatting, etc.)
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Changes to build process or auxiliary tools

```bash
git commit -m "type(scope): description"
```

**Example:**

```bash
git commit -m "feat(workflows): add git workflow tools"
```

### 4. Verify Commit

Check that your commit was created successfully.

// turbo

```bash
git log -1 --oneline
```

---

## Multi-line Commits

For commits that need more detail, use:

```bash
git commit
```

This will open your editor. Format as:

```
type(scope): short description

Longer description explaining the change in detail.

- Additional context
- Breaking changes
- Related issues
```
