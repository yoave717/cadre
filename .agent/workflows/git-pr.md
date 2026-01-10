---
description: how to prepare and create a pull request
---

This workflow guides you through preparing your branch and creating a pull request.

## Prerequisites

- You have a feature branch with committed changes
- You have push access to the repository
- GitHub CLI (`gh`) is installed (optional, for CLI PR creation)

## Steps

### 1. Update Your Branch

Ensure your branch is up to date with the main branch.

```bash
git checkout main && git pull && git checkout - && git merge main
```

### 2. Run Tests and Linting

Verify that all tests pass and code meets linting standards.

```bash
npm run build && npm run lint && npm test
```

> [!IMPORTANT]
> Fix any failing tests or linting errors before creating the PR.

### 3. Review Your Changes

Review all commits that will be included in the PR.

```bash
git log origin/main..HEAD --oneline
```

View the full diff against main:

```bash
git diff origin/main
```

### 4. Push Your Branch

Push your branch to the remote repository.

```bash
git push -u origin $(git branch --show-current)
```

### 5. Create Pull Request

#### Option A: Using GitHub CLI (Recommended)

```bash
gh pr create --title "Your PR Title" --body "Description of changes"
```

Interactive mode (will prompt for title and body):

```bash
gh pr create
```

#### Option B: Using Web Interface

Navigate to your repository on GitHub and click "New Pull Request" or follow the link shown after pushing.

---

## Pull Request Best Practices

### Title Format

Use conventional commit format for PR titles:

```
type(scope): description
```

**Examples:**

- `feat(auth): add OAuth2 authentication`
- `fix(api): resolve timeout issue in user endpoint`
- `docs(readme): update installation instructions`

### Description Template

```markdown
## What Changed

Brief description of the changes

## Why

Explanation of why this change is needed

## How to Test

Steps to test the changes

## Checklist

- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No linting errors
- [ ] All tests pass
```

---

## PR Management Commands

### List Your PRs

// turbo

```bash
gh pr list --author "@me"
```

### View PR Status

```bash
gh pr status
```

### View PR Checks

```bash
gh pr checks
```

### Update PR

After making additional commits, simply push again:

```bash
git push
```

---

## Troubleshooting

- **Conflicts with main**: Pull latest main and resolve conflicts before creating PR
- **Failed checks**: View logs with `gh pr checks` and fix issues
- **PR not showing**: Ensure you pushed to the correct remote repository
