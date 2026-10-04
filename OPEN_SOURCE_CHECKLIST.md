# Open File pre-publication checklist

Audit of local files on October 4, 2026. The intended publication is of the source
code; additional requirements for hosting an Internet-facing instance are listed
separately. No publication was performed.

## Follow-up validation

The requested dependency, Tailscale and CI changes were checked with Node
22.23.3 and pnpm 12.8.1. No commit, push or deployment was performed.

- Production audit: no known vulnerabilities reported.
- Dependency regression tests: 3/3 passed; web unit tests: 15/15 passed.
- Workflow: actionlint passed. Build, lint and types passed when executed.
- Both Docker targets built; 9/9 E2E tests passed on those images in a disposable
  stack after updating obsolete selectors and supplying a test invitation.
- Another session is changing the server and Docker concurrently. The latest
  server test run had 18 passes and 5 failures in the new isolated PDF/image
  decoder. The E2E images predate those latest changes; rerun the complete suite
  once that work settles. CI does not skip or suppress these failures.
- Full auditing still reports the patched upstream `braces` version and a low
  severity `esbuild` tooling advisory. Production auditing excludes that tooling.

The remaining original audit observations below are historical; the three
requested correction items have been updated.

## 1. Address before publishing the code

- [ ] **Choose and add an open-source license at the root (`LICENSE`).**
      No license file was found. Align package `license` fields:
      `packages/typescript-config/package.json` still declares `PROPRIETARY`.
      The license choice belongs to the maintainer. `private: true` fields can remain:
      they prevent npm publication, not source code publication.
      [GitHub licensing documentation](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository).
- [ ] **Check rights and attribution for redistributed assets.**
      Inventory licenses for dependencies, components, fonts, and visuals; retain
      required notices. Also review generated logos and files in `output/imagegen/`.
      This check has not been performed.
- [ ] **Review the actual files intended for the first commit and any existing history.**
      The supplied directory has no `.git`: tracked files, branches, and previous
      commits cannot be checked. `.env` and `.data/` exist locally and are excluded by
      `.gitignore` and `.dockerignore`. Perform a full secrets scan of files to publish
      and, if available, the history. Revoke any secret that may already have been exposed.
- [x] **Remove the personal Tailscale address from shared defaults.**
      Sources, examples, scripts and documentation use localhost by default. The
      origin was also removed from the local `.env`, without displaying secrets.
- [x] **Address the `braces` dependency vulnerability.**
      Removed the `shadcn` CLI dependency while preserving its CSS and MIT license
      locally. Production dependency auditing now reports no known vulnerabilities.
      The copy used by Next/ESLint tooling is patched through pnpm to bound parser
      and recursive walker depth. Three regression tests cover normal patterns,
      deeply nested strings and caller-supplied ASTs. Full auditing still flags the
      upstream version because it does not validate local patches; no advisory is
      suppressed. See `CONTRIBUTING.md` for patch maintenance.
- [ ] **Validate installation from a clean copy.**
      Use the intended Node and pnpm versions, `pnpm install --frozen-lockfile`, a newly
      generated environment, and Docker startup with fresh volumes. Check registration,
      import, filing, search, download, and deletion, first without an AI key and then
      with the intended integrations. This installation and a fresh build were not
      performed here.

## 2. Additions for users and contributors

- [x] **Add GitHub Actions CI**: `.github/workflows/ci.yml` covers lint,
      build, types, dependency security tests, production dependency auditing,
      web/server tests with pgvector, production E2E tests and both Docker targets.
      It provisions the restricted database role before starting the application.
      The first hosted GitHub run remains to be verified after publication.
- [ ] **Add `CONTRIBUTING.md`**: setup, commands, conventions, architecture, tests,
      and the contribution process.
- [ ] **Add `SECURITY.md`**: private reporting channel, supported versions, and
      vulnerability handling. Choose a real contact before publication.
- [ ] **Configure hosted repository protection**: reviews and checks before
      merging, dependency monitoring, secret detection, and push protection. Remote
      repository settings have not been inspected.
      [GitHub push protection documentation](https://docs.github.com/en/code-security/how-tos/secure-your-secrets/prevent-future-leaks/enable-push-protection).
- [ ] **Make the README self-contained for a new user**: a clone command once the
      URL is known, Node prerequisites even for Docker startup (`setup.mjs` uses Node),
      a verified minimum Compose version, and troubleshooting. Specify the Node
      versions actually accepted by `engines`, rather than just "Node 22.18+", which
      can suggest that any later version is supported.
- [ ] **Correct the README's functional limitations.** It says permanent document
      deletion is unavailable, although `Documents.delete`, the DELETE route, and a
      test already cover removing references and the index, followed by file cleanup
      through a job. Explain this delay and distinguish document deletion from
      account deletion.
- [ ] **Add a short introduction and screenshots using fictional data**, known
      limitations, and the project's initial status (for example, alpha). An English
      version may help international contributors.
- [ ] **Prepare collaboration and releases**: issue/PR templates,
      `CODE_OF_CONDUCT.md`, an initial changelog, and a release process.
- [ ] **Sort artifacts before publication.** `output/` contains approximately
      7.8 MB of logo variants and prompts and is not ignored. Choose which graphic
      sources to keep; exclude unnecessary experiments from Git and the Docker
      context. Visually review screenshots and demo data.

## 3. Before exposing an instance to the Internet

These items concern hosting the service; they are not all prerequisites for
publishing its code as an experimental version.

- [ ] **Document and test HTTPS and the reverse proxy**: domain, `APP_URL`,
      `TRUSTED_ORIGINS`, cookies, Google callback, streaming, and upload limits. The
      provided Compose file exposes the frontend on all interfaces on port 3000;
      it does not configure TLS.
- [ ] **Check rate limiting behind the proxy.** Tests report that Better Auth
      cannot determine the client IP and uses a shared per-path counter. Verify
      behavior in the actual topology, trusting only controlled proxies and not
      blindly accepting IP headers.
- [ ] **Clarify Better Auth schema warnings.** Tests on a new database emit
      `Database schema mismatch` for initially missing tables and a warning about the
      `rateLimit.lastRequest` type (`int8`). All 23 server tests pass; these messages
      alone do not demonstrate a production failure. Check initialization/migration
      order and rate-limit persistence with the installed version.
- [ ] **Define a registration and quota policy.** Password registration is enabled;
      no global per-user storage quota or invitation mode was identified in the
      inspected code. Imports use memory, up to five 20 MB files per request. Plan
      concurrency, storage, and resource limits appropriate to the intended exposure.
- [ ] **Document data flows and retention**: files, extracted text, embeddings,
      conversations, backups, Drive, and the AI provider. Define account export and
      deletion workflows; the README already notes that password recovery by email
      is unavailable.
- [ ] **Provide and test backup/restore and updates**: database, files, encryption
      key, migrations, and rollback procedure. The README already explains the need
      to back up the key.
- [ ] **Prepare operations**: monitoring the worker and failed jobs, logs without
      sensitive data, disk space, CPU/memory limits, and minimal final images. Current
      images inherit from the stage that installs all dependencies and copies sources
      and non-excluded artifacts.
- [ ] **Test real Google Drive and AI integrations** with fictional documents,
      then consent, quota, key, and network errors. These external integrations were
      not exercised during this audit.

## Checks performed

| Check                                                 | Result                                                                                                                             |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`                                           | Passed: 3 tasks, including 1 from the Turbo cache                                                                                  |
| `pnpm typecheck`                                      | Passed: 4 tasks, including 2 from the Turbo cache                                                                                  |
| `pnpm --filter @open-file/web test`                   | 15 passing tests                                                                                                                   |
| `pnpm --filter @open-file/server test`                | 23 passing tests, isolated temporary database; warnings detailed above                                                             |
| Indicative secrets search                             | No patterns detected in 171 text files examined; excludes private `.env`, data, dependencies, and caches; not a comprehensive scan |
| Production dependency audit                           | 1 high-severity alert, 0 critical, with pnpm 12.8.1                                                                                |
| Existing Docker services                              | Frontend, backend, and database healthy; worker running                                                                            |
| Fresh build, clean installation, E2E, worker recovery | Not executed during this audit                                                                                                     |
| Git history and remote repository settings            | Not verifiable from the supplied directory                                                                                         |

Local lint, type, and test commands used Node 22.12.0 and pnpm 9.15.9, outside the
versions intended by the project. Their results do not replace validation with
the supported toolchain. The audit run with that older pnpm failed to read the
lockfile; it was rerun successfully in the container using Node 22.23.3 and pnpm
12.8.1. The lockfile was not modified.

Useful foundations are already in place: a detailed README, environment example,
random secret generation, Git/Docker exclusions, application containers running
as non-root, sessions, ownership and origin checks, encrypted API keys, and
isolation tests. This audit prepares for publication; it is not a security certification.
