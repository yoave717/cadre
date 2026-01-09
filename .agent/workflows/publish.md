---
description: how to publish the cadre package to npm
---

This workflow guides you through the process of publishing the `cadre` package to the NPM registry.

## Prerequisites

- You must have an NPM account.
- You must be logged into the NPM CLI (`npm login`).
- You must have the necessary permissions to publish the package.
- Ensure your working directory is clean (`git status`).

## Steps

### 1. Preparation

Run the build and linting process to ensure the project is in a good state.

```bash
npm run build && npm run lint
```

> [!NOTE]
> If linting fails, you should fix the errors before publishing. However, if they are only stylistic, you may choose to proceed.

### 2. Versioning

Bump the version of the package. Choose appropriate semver (patch, minor, major).

```bash
npm version patch
```

### 3. Verification (Dry Run)

Perform a dry run to see what files will be included in the published package.

```bash
npm publish --dry-run
```

Check the list of files to ensure only `dist`, `README.md`, and `LICENSE` (and `package.json`) are included.

### 4. Publication

Publish the package to the NPM registry.

```bash
npm publish --access public
```

### 5. Git Synchronization

Push the new version tag and changes to the remote repository.

```bash
git push && git push --tags
```

---

## Troubleshooting

- **Forbidden/403 Error**: Ensure you have permissions and are logged in (`npm whoami`).
- **Version Conflict**: Ensure the version in `package.json` is higher than the currently published version.
