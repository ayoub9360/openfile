# Contributing to Open File

Thank you for contributing. Start with [local installation](docs/installation.md),
[architecture](docs/architecture.md), and the [API](docs/api.md).

## Preparing a change

1. Describe the problem or feature in a repository issue, without private data.
2. Install the Node and pnpm versions declared by the project, then run
   `pnpm install --frozen-lockfile`.
3. Create a branch and keep changes focused on the problem being addressed.
4. Add a relevant check when behavior changes. Use fictional documents, never
   personal data or real keys in tests.
5. Describe the result, commands run, and limitations in the pull request.

## Conventions

Use TypeScript, React, and shared components from `packages/ui`. Respect the
boundaries between domain, application, and infrastructure; keep shared contracts
in `packages/core`. Avoid adding a dependency for a simple task.

Before changing Next.js code, read the
installed version's guides in `apps/web/node_modules/next/dist/docs/`.
This version's conventions may differ from examples found elsewhere.

## Checks

From the project root:

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm --filter @open-file/web test
pnpm --filter @open-file/server test
pnpm test:security
```

Server tests require PostgreSQL with pgvector and a role allowed to create a
database. The script creates an isolated database and temporary storage, then
removes them. Do not point these tests at a production service. Local AI tests use
simulated models and do not call OpenAI.

GitHub Actions (`.github/workflows/ci.yml`) runs these checks on pushes and pull
requests, plus a production dependency audit, browser tests against the production
build, and both Docker builds. It uses `.nvmrc` and `packageManager`, an ephemeral
pgvector database, and no external provider credentials. Failed-run diagnostics
are retained for seven days. This workflow does not deploy the application.

### Local dependency patch

`patches/braces@3.0.3.patch` limits parser and recursive walker depth to 128,
including caller-supplied ASTs, to address
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
No upstream fixed release was available when the patch was added. pnpm applies
it on installation; `pnpm test:security` exercises the copy actually used by
Next/ESLint, normal patterns, deeply nested input, and ASTs. Remove the patch
only with a verified upstream fix and passing regression tests. A full audit
still flags upstream version 3.0.3 because it cannot validate local patches;
no advisory is suppressed in the audit configuration.

The `shadcn` generator is no longer an application dependency. Its CSS is vendored
in `packages/ui/src/styles/shadcn.css` with its MIT license, preserving component
variants without installing the CLI and its transitive dependencies.

For browser tests, start the API, worker, and database:

Set `SIGNUP_TOKEN` in the test process to the disposable server's invitation code
so the registration test can create its account. CI supplies a test-only value.

```bash
pnpm --filter @open-file/web exec playwright install --with-deps chromium
pnpm --filter @open-file/web test:e2e
# For an application that is already running:
E2E_BASE_URL=http://localhost:3000 pnpm --filter @open-file/web test:e2e
```

Check `apps/web/playwright.config.ts` for automatic frontend startup.
Tests create dedicated accounts. `node scripts/test-worker.mjs` checks job
recovery, but **temporarily stops the worker and restarts the API**: reserve this
command for a local stack available for this test.

For documentation and examples:

```bash
node scripts/generate-demo.mjs
pnpm exec prettier --check README.md CONTRIBUTING.md 'docs/*.md' 'examples/*.md' scripts/generate-demo.mjs
```

Only run global formatting when that scope is intentional. Screenshots must come
from the application and use fictional examples; disclose any simulated mode.
Do not claim a connector or provider was tested if it was not used.

## License

Contributions are submitted under the project's [MIT License](LICENSE).
Only submit code, text, and media you are authorized to distribute. Dependency
licenses remain applicable.
