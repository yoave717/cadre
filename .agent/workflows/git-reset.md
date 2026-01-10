---
description: how to undo changes and reset git state
---

This workflow guides you through various ways to undo changes in git.

> [!CAUTION]
> Some of these operations can result in permanent data loss. Read carefully before executing.

## Undo Uncommitted Changes

### 1. Discard Changes in Working Directory

Discard all changes in a specific file:

```bash
git checkout -- filename
```

Or using the newer syntax:

```bash
git restore filename
```

### 2. Discard All Uncommitted Changes

> [!WARNING]
> This will permanently delete all uncommitted changes.

```bash
git restore .
```

### 3. Unstage Files

Remove file from staging area but keep changes:

```bash
git restore --staged filename
```

Or for all staged files:

```bash
git restore --staged .
```

---

## Undo Commits

### 1. Undo Last Commit (Keep Changes)

Undo the last commit but keep changes in working directory:

```bash
git reset --soft HEAD~1
```

### 2. Undo Last Commit (Unstage Changes)

Undo the last commit and unstage changes:

```bash
git reset HEAD~1
```

Or explicitly:

```bash
git reset --mixed HEAD~1
```

### 3. Undo Last Commit (Discard Changes)

> [!CAUTION]
> This will permanently delete the commit and all changes.

```bash
git reset --hard HEAD~1
```

### 4. Undo Multiple Commits

Replace `n` with the number of commits to undo:

```bash
git reset --soft HEAD~n
```

---

## Reset to Specific Commit

### 1. View Commit History

// turbo

```bash
git log --oneline -10
```

### 2. Reset to Specific Commit

Using commit hash (keep changes):

```bash
git reset --soft commit-hash
```

Hard reset (discard changes):

```bash
git reset --hard commit-hash
```

---

## Undo Pushed Commits

### 1. Revert Commits (Safe for Shared Branches)

Create a new commit that undoes a previous commit:

```bash
git revert commit-hash
```

Revert the last commit:

```bash
git revert HEAD
```

### 2. Force Push Reset (Only for Personal Branches)

> [!CAUTION]
> Never force push to shared branches like main.

```bash
git reset --hard commit-hash
git push --force-with-lease
```

---

## Recover Lost Commits

### View Reflog

See all recent HEAD movements:
// turbo

```bash
git reflog
```

### Restore from Reflog

```bash
git reset --hard HEAD@{n}
```

Where `n` is the reflog index.

---

## Common Scenarios

### Undo `git add`

```bash
git restore --staged .
```

### Undo `git commit --amend`

```bash
git reset --soft HEAD@{1}
```

### Completely Reset to Remote Branch

```bash
git fetch origin
git reset --hard origin/branch-name
```

### Clean Untracked Files

> [!WARNING]
> This permanently deletes untracked files.

Preview what will be deleted:

```bash
git clean -n
```

Delete untracked files:

```bash
git clean -f
```

Delete untracked files and directories:

```bash
git clean -fd
```

---

## Troubleshooting

- **Accidentally deleted commits**: Use `git reflog` to find and restore them
- **Reset went wrong**: Use `git reflog` to go back to previous state
- **Conflicts after reset**: Manually resolve conflicts or reset to a different point
