---
description: how to create and manage git branches
---

This workflow guides you through creating, switching, and managing git branches.

## Steps

### 1. Check Current Branch

See which branch you're currently on and list all branches.

// turbo

```bash
git branch -v
```

### 2. Create New Branch

Create a new branch from the current branch. Use descriptive names like `feature/new-feature`, `fix/bug-name`, or `docs/update-readme`.

```bash
git checkout -b branch-name
```

**Naming conventions:**

- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `refactor/` - Code refactoring
- `test/` - Test updates

### 3. Push New Branch to Remote

Push your new branch to the remote repository.

```bash
git push -u origin branch-name
```

---

## Switch Between Branches

### Switch to Existing Branch

```bash
git checkout branch-name
```

### Switch to Main/Master

// turbo

```bash
git checkout main
```

---

## Branch Management

### List All Branches (Including Remote)

// turbo

```bash
git branch -a
```

### Delete Local Branch

```bash
git branch -d branch-name
```

Use `-D` to force delete if the branch hasn't been merged:

```bash
git branch -D branch-name
```

### Delete Remote Branch

```bash
git push origin --delete branch-name
```

### Rename Current Branch

```bash
git branch -m new-branch-name
```

---

## Troubleshooting

- **Uncommitted changes**: Stash your changes before switching branches with `git stash`
- **Branch already exists**: Use `git checkout branch-name` instead of creating a new one
- **Cannot delete branch**: Ensure you're not on the branch you're trying to delete
