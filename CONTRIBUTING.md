# Contributing to Cadre

## General Workflow

1.  Fork the repository.
2.  Create a feature branch.
3.  Commit your changes.
4.  Push to the branch.
5.  Create a Pull Request.

## Rules for Agents & Developers

To maintain the quality and reliability of the Cadre codebase, the following rules **must** be followed by all contributors, including AI agents:

### 1. Mandatory Testing

- **New Features**: Every new feature or function MUST be accompanied by a corresponding unit test or end-to-end test.
- **Bug Fixes**: Every bug fix MUST include a regression test that fails without the fix and passes with it.
- **Refactoring**: Ensure all existing tests pass. If the refactoring changes behavior, update tests accordingly.
- **No Untested Code**: Do not submit code that acts "blindly". Verify your changes.

### 2. Code Style

- Follow the existing linting and formatting rules (ESLint + Prettier).
- Run `npm run lint` and `npm run format` before committing.

### 3. Commit Messages

- Use clear and descriptive commit messages.
