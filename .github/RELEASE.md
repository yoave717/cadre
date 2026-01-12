# Release Process for Cadre

This document describes how to release new versions of Cadre.

## Prerequisites

Before releasing, ensure:

1. All changes are committed and pushed to `main`
2. Tests pass: `npm test`
3. Linter passes: `npm run lint`
4. Build succeeds: `npm run build`
5. You have push access to the repository
6. NPM_TOKEN secret is configured in GitHub (for npm publishing)

## Release Methods

### Method 1: Manual Release (Recommended)

Use the GitHub Actions workflow to release a new version:

1. Go to **Actions** → **Release** workflow
2. Click **Run workflow**
3. Enter the version number in semantic versioning format (e.g., `1.0.1`, `1.1.0`, `2.0.0`)
4. Click **Run workflow**

The workflow will:
- Run tests and linting
- Build the project
- Update `package.json` version
- Create a git commit with version bump
- Create a git tag
- Push changes to main
- Publish to npm
- Create a GitHub release

### Method 2: Tag-Based Release

If you prefer to manage versioning manually:

1. Update the version in `package.json` manually
2. Commit the change: `git commit -m "chore(release): bump version to X.Y.Z"`
3. Create and push a tag: `git tag -a vX.Y.Z -m "Release version X.Y.Z" && git push origin vX.Y.Z`
4. The `release-on-tag` workflow will automatically:
   - Run tests and build
   - Publish to npm
   - Create a GitHub release with auto-generated release notes

## Versioning

Follow [Semantic Versioning](https://semver.org/):

- **MAJOR** (X.0.0): Breaking changes
- **MINOR** (0.X.0): New features (backward compatible)
- **PATCH** (0.0.X): Bug fixes (backward compatible)

Examples:
- `1.0.0` → `1.0.1` (patch fix)
- `1.0.0` → `1.1.0` (new feature)
- `1.0.0` → `2.0.0` (breaking change)

## What Happens During Release

1. **Tests & Quality Checks**
   - All unit and integration tests run
   - ESLint checks pass
   - TypeScript compilation succeeds

2. **Version Update**
   - `package.json` version is updated
   - `package-lock.json` is regenerated

3. **Git Operations**
   - Changes committed with message: `chore(release): bump version to X.Y.Z`
   - Tag created: `vX.Y.Z`
   - Both pushed to origin

4. **Publication**
   - Package published to npm registry
   - GitHub release created with release notes
   - Release becomes available at https://www.npmjs.com/package/cadre

## Troubleshooting

### NPM_TOKEN not configured

If npm publishing fails, ensure:
1. NPM_TOKEN secret is set in GitHub repository settings
2. Token has publish permissions
3. Token is valid and not expired

### Release workflow fails

Check the workflow logs in GitHub Actions:
1. Go to **Actions** → **Release** workflow
2. Click on the failed run
3. Review the logs for specific error messages

### Manual recovery

If something goes wrong:

1. **Revert the tag**: `git tag -d vX.Y.Z && git push origin :refs/tags/vX.Y.Z`
2. **Revert commits**: `git reset --hard <previous-commit>`
3. **Try again** after fixing the issue

## CI/CD Integration

Both workflows include:
- ✅ Automated testing
- ✅ Linting and formatting checks
- ✅ Build verification
- ✅ npm publication
- ✅ GitHub release creation
- ✅ Automatic release notes generation

## Monitoring a Release

After triggering a release:

1. Check the **Actions** tab for workflow progress
2. View logs for any issues
3. Verify npm package at https://www.npmjs.com/package/@yoavelkayam/cadre
4. Check GitHub releases page for the new release
5. Users can install the new version with: `npm install -g @yoavelkayam/cadre@latest`

## Publishing Manually (Emergency Only)

If the automated workflow fails and you need to publish manually:

```bash
# Ensure you're on main and everything is up to date
git checkout main
git pull origin main

# Build the project
npm run build

# Publish to npm (requires npm login)
npm publish
```

## Questions or Issues?

For questions about the release process, refer to:
- GitHub Actions documentation: https://docs.github.com/en/actions
- npm documentation: https://docs.npmjs.com/
- This repository's CONTRIBUTING.md
