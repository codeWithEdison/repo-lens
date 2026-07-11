# Contributing to RepoLens

Thank you for your interest in contributing. RepoLens is open source under the
[MIT License](LICENSE).

## Before you start

- Read the [README](README.md) for architecture, setup, and methodology.
- Keep the **stateless model**: no database, no auth, no permanent persistence.
- Preserve the existing frontend design unless a change is explicitly discussed.

## Development setup

```bash
git clone https://github.com/codeWithEdison/repo-lens.git
cd repo-lens
cp .env.example .env
npm run install:all
# Redis required — see README
npm run dev:server   # terminal 1
npm run dev:worker   # terminal 2
npm run dev          # terminal 3 (frontend)
```

## Pull requests

1. Fork the repository and create a branch from `main`.
2. Make focused changes with clear commit messages.
3. Run before opening a PR:

   ```bash
   npm run typecheck:all
   npm run test:all
   ```

4. Describe what changed and why in the PR body.
5. Link any related issue if applicable.

## What we welcome

- Analyzer and scoring improvements (with tests)
- Language support and evidence quality
- Security hardening and documentation
- Bug fixes with reproduction steps

## What to avoid

- Adding user accounts, billing, or a permanent database
- Force-pushing or rewriting published history on the default branch
- Committing secrets (`.env`, tokens, API keys)

## Questions

Open a [GitHub issue](https://github.com/codeWithEdison/repo-lens/issues) for bugs,
feature ideas, or questions.
