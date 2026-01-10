---
description: how to sync your local branch with remote
---

This workflow guides you through syncing your local branch with the remote repository.

## Steps

### 1. Check Current Status

View the current state of your working directory.

// turbo

```bash
git status
```

### 2. Stash Local Changes (if needed)

If you have uncommitted changes, stash them temporarily.

```bash
git stash
```

### 3. Fetch Latest Changes

Fetch the latest changes from all remote branches.

// turbo

```bash
git fetch origin
```

### 4. Pull Changes

Pull and merge changes from the remote branch into your current branch.

```bash
git pull origin $(git branch --show-current)
```

Or simply:

```bash
git pull
```

### 5. Restore Stashed Changes (if stashed)

If you stashed changes in step 2, restore them now.

```bash
git stash pop
```

---

## Push Local Changes

### Push to Current Branch

```bash
git push origin $(git branch --show-current)
```

Or simply:

```bash
git push
```

### Force Push (Use with Caution)

> [!WARNING]
> Only use force push when you're certain it won't affect other team members.

```bash
git push --force-with-lease
```

---

## Sync with Main Branch

### Update Main and Merge into Current Branch

```bash
git checkout main && git pull && git checkout - && git merge main
```

### Rebase Current Branch onto Main

```bash
git fetch origin main && git rebase origin/main
```

---

## Troubleshooting

- **Merge conflicts**: Resolve conflicts manually, then `git add` and `git commit`
- **Diverged branches**: Use `git pull --rebase` or merge the remote changes
- **Detached HEAD**: Create a new branch from current position with `git checkout -b new-branch-name`
