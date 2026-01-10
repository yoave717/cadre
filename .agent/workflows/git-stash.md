---
description: how to use git stash to save and restore changes
---

This workflow guides you through using `git stash` to temporarily save and restore uncommitted changes.

## When to Use Stash

- Switching branches with uncommitted changes
- Pulling changes without committing current work
- Quickly testing something clean without losing work
- Saving work in progress before troubleshooting

## Steps

### 1. Check Current Status

View what changes you have that can be stashed.

// turbo

```bash
git status
```

### 2. Stash Changes

Save your uncommitted changes (both staged and unstaged).

```bash
git stash
```

With a descriptive message:

```bash
git stash push -m "WIP: feature description"
```

### 3. View Stashed Changes

List all stashes.

// turbo

```bash
git stash list
```

### 4. Apply Stashed Changes

#### Apply Most Recent Stash

Apply the stash and keep it in the stash list:

```bash
git stash apply
```

Apply and remove from stash list:

```bash
git stash pop
```

#### Apply Specific Stash

```bash
git stash apply stash@{n}
```

Where `n` is the stash index from `git stash list`.

---

## Advanced Stashing

### Stash Only Unstaged Changes

```bash
git stash push --keep-index
```

### Stash Untracked Files

```bash
git stash push -u
```

### Stash Everything (Including Ignored Files)

```bash
git stash push -a
```

### Create a Branch from Stash

Apply a stash to a new branch:

```bash
git stash branch new-branch-name stash@{n}
```

---

## Stash Management

### View Stash Contents

Show what's in a specific stash:

```bash
git stash show -p stash@{n}
```

Show summary:
// turbo

```bash
git stash show
```

### Delete Stashes

Drop a specific stash:

```bash
git stash drop stash@{n}
```

Clear all stashes:

```bash
git stash clear
```

---

## Troubleshooting

- **Merge conflicts after applying**: Resolve conflicts manually, then `git add` the files
- **Lost stash**: Stashes are kept for 90 days even after being dropped; use `git fsck` to recover
- **Stash not applying**: Check if you're on the right branch or if there are conflicts
