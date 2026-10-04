# Security audit — Open File

Date: October 4, 2026. Scope: local sources, lockfile dependencies, Docker
configuration, existing tests, and a few HTTP requests against the local stack.
No application fixes, commits, pushes, or deployments were performed as part
of this audit.

**Assessment: do not expose this configuration directly to the Internet before
addressing SEC-01 through SEC-04.** Source publication can be prepared, but it
does not validate the security of a hosted instance. An authentication weakness
was reproduced; resource exhaustion risks were identified in the code without
launching a destructive attack.

## Priority findings

### SEC-01 — High: bypass of sign-in rate limiting

**Status: reproduced on the local stack through the frontend, without an existing account.**

References: `apps/server/src/infrastructure/auth.ts:15`,
`apps/server/src/http/app.ts:43`, `apps/web/next.config.ts:5`.

Better Auth uses `X-Forwarded-For` by default to identify the client. Next.js
preserves this header when it is already supplied. The application configuration
does not define a trust boundary for this address. Express's `trust proxy: false`
does not fix this behavior: Better Auth reads the headers itself.

Evidence: five consecutive POST requests to `/api/auth/sign-in/email`, using the
same random fictional email address and password, against `http://127.0.0.1:3000`:

| Supplied header                                          | Responses          |
| -------------------------------------------------------- | ------------------ |
| `X-Forwarded-For: 198.51.100.211`, four times            | 401, 401, 401, 429 |
| `X-Forwarded-For: 198.51.100.212`, immediately afterward | 401                |

Changing the header is enough to obtain a new rate-limit bucket. This facilitates
password guessing and automated account creation. No real password was tested,
and no account was created by this reproduction.

**Remediation:** require an ingress proxy that overwrites client identity headers;
make the Next.js port inaccessible except through that proxy; explicitly configure
the trusted header or trusted proxies in Better Auth. Add a complementary limit
per targeted account, with a policy that avoids facilitating deliberate user
lockouts. Retest by varying the header: the fifth attempt must remain limited.
See the [Better Auth documentation](https://better-auth.com/docs/concepts/rate-limit).

### SEC-02 — High: open registration and resources without quotas

**Status: confirmed in code; resource exhaustion was not induced.**

References: `apps/server/src/infrastructure/auth.ts:14`,
`apps/server/src/http/app.ts:68`, `apps/server/src/http/app.ts:80`,
`apps/server/src/application/documents.ts:35`, `compose.yaml`.

Registration immediately grants access to local imports, with no configured
invitation or email verification requirement. Multer holds up to five 20 MiB
files in memory per request. The limit of 180 requests/minute/user is neither
a storage quota nor a concurrent processing limit. There is no cumulative quota
for bytes, documents, or jobs; no container memory/CPU limits are declared.
Conversations are also created without a quota, and their messages are loaded
in full from the database.

A user can consume shared disk space, memory, or processing queue capacity;
creating more accounts increases this risk. The assistant's per-turn limits do
not limit the number of concurrent conversations.

**Remediation:** for a personal instance, close registration after initialization
or use invitations. For an open instance, reserve quotas atomically before import,
limit concurrent imports and processing per user and globally, limit request
bodies at the proxy, and set Docker resource limits. Plan conversation
pagination/retention and purging of completed jobs. Verify that an account reaching
its limits does not affect another account.

### SEC-03 — High: decoding untrusted files without sufficient isolation

**Status: mechanism confirmed; no decompression bomb was executed.**

References: `apps/server/src/infrastructure/preview-renderer.ts:15`,
`apps/server/src/infrastructure/preview-renderer.ts:34`,
`apps/server/src/application/previews.ts:34`,
`apps/server/src/infrastructure/intelligence.ts:22`.

Previews decode original images with `loadImage` before resizing. The 20 MiB
compressed-size limit does not bound the number of decoded pixels. PDFs are
processed without an explicit page/object/time/memory budget; truncation to
160,000 characters occurs after text extraction. Previews run in the API process
and share a global serial queue. A render that never finishes blocks subsequent
renders; the limit of 64 pending jobs does not limit the cost of one job. The
analysis worker is separate, but processes jobs one at a time without an overall
extraction timeout.

**Remediation:** limit accepted dimensions/pixels and complexity; run parsers in
an isolated process with memory/CPU limits and effective termination when the
timeout is exceeded. A simple `Promise.race` does not stop native decoding.
Test with bounded fixtures and verify preview recovery after a timeout. This
finding does not establish remote code execution.

### SEC-04 — High if remotely exposed: HTTP and a public port by default

**Status: configuration confirmed; local HTTP service reachable.**

References: `compose.yaml:30`, `compose.yaml:70`,
`apps/server/src/config.ts:11`, `apps/server/src/infrastructure/auth.ts:17`.

Compose publishes the frontend on all interfaces on port 3000 and uses an HTTP
URL by default. Cookies become `Secure` only if `APP_URL` starts with `https:`.
Exposure on an unprotected network leaves passwords, sessions, documents, and
entered keys open to interception. Encryption of secrets in the database does
not protect this transport.

**Remediation:** terminate TLS at a proxy, set the canonical HTTPS URL and exact
origins, redirect HTTP, then enable HSTS on HTTPS. Bind the application port to
localhost or a private network accessible only to the proxy. Verify externally
that port 3000 does not offer direct access. A Tailscale network provides a
different form of protection; future public exposure and its firewall were not inspected.

### SEC-05 — Medium: browser protections missing from HTML pages

**Status: confirmed by GET `/` against the local stack.**

References: `apps/web/next.config.ts`, `apps/server/src/http/app.ts:44`.

The HTML response contains none of `Content-Security-Policy`, `X-Frame-Options`,
`X-Content-Type-Options`, or `Referrer-Policy`. Helmet protects the backend, not
pages served by Next.js; its CSP is also disabled. Missing anti-framing protection
allows clickjacking scenarios depending on browser context and cookies. Missing
CSP reduces defenses against a potential XSS; no XSS was demonstrated.

**Remediation:** set headers in Next.js or the proxy, including
`frame-ancestors 'none'` and a CSP suited to Next.js scripts, PDF previews, and the
theme. Deploy complex directives in report-only mode first, then verify user
flows. Do not blindly apply a CSP that breaks the interface.

### SEC-06 — Medium: application PostgreSQL role is a superuser

**Status: verified with a read-only query using the application connection.**

References: `compose.yaml:9`, `compose.yaml:27`,
`apps/server/src/main.ts:5`, `apps/server/src/migrate.ts`.

The role in use has `rolsuper=true`, `rolcreatedb=true`, and `rolcreaterole=true`.
The application reuses PostgreSQL's initialization role for queries and migrations.
A compromised API/worker or a future SQL injection would therefore have a much
wider impact on the database and its container. No SQL injection was found in
the examined paths.

**Remediation:** separate initialization/migration from the runtime role; remove
SUPERUSER, CREATEDB, and CREATEROLE from the latter and grant only the required
table/sequence permissions. Adapt migrations and tests that create an isolated
database rather than retaining excessive privileges in production.

### SEC-07 — Medium, privacy: incomplete deletion of derived content

**Status: confirmed by reviewing deletion and conversation code paths.**

References: `apps/server/src/application/documents.ts:170`,
`apps/server/src/application/assistant.ts`,
`apps/server/src/infrastructure/conversations.ts:28`.

Deleting a document removes its references and chunks and schedules file cleanup,
but does not purge excerpts/citations and answers already persisted in
conversations. Loading a conversation still returns them to its owner. Excluding
older sources from the model's context does not delete that data. Document content
and metadata are stored in plaintext in PostgreSQL; only sensitive settings are
encrypted by the application.

This does not demonstrate cross-account access, but it is a risk if "delete" is
understood to mean erasing all associated content.

**Remediation:** document this retention precisely, allow conversation deletion,
and define a policy for derived content and backups. Test that deletion with
purging also removes persisted excerpts. Protect volumes and backups according
to document sensitivity.

## Dependencies

Lockfile audit with **pnpm 12.8.1**, the prescribed version: two advisories,
**one high and one low severity**, with no critical issues reported by this registry.

| Dependency       | Advisory and observed scope                                                                                                                                                          | Action                                                                                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `braces@3.0.3`   | High: stack exhaustion through nested patterns. Dependency chains pass through `shadcn`, `fast-glob`, `micromatch`, and ESLint tooling. No HTTP path to this parser was established. | Review upstream replacement/fix options and actual exposure; isolate tooling from the runtime image. The advisory listed no published fix as of the audit date. |
| `esbuild@0.27.7` | Low: file reading through the development server on Windows; transitive dependency of `tsup`. This scenario does not match the examined Linux production server.                     | Update the build toolchain to a compatible fixed version, then rebuild/test.                                                                                    |

Sources: [braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
and [esbuild advisory](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr).
Final images currently inherit all build dependencies (`Dockerfile:13`,
`Dockerfile:23`). A dependency classified as "production" by the audit is not
necessarily called by a route, and its presence in the image does not demonstrate
remote exploitability.

The first attempt using system pnpm 9.15.9 failed to read the multi-document
lockfile. This does not establish corruption: the audit successfully reads the
same file with pnpm 12.8.1. No lockfile was modified.

## Secrets and publication preparation

- Local scan of 192 candidate files for publication: private-key signatures,
  common provider tokens, and exact copies of nonempty secrets from `.env`.
  No matches detected; sensitive values were not displayed. This targeted search
  does not guarantee the absence of unusual secrets.
- `.env` has `0600` permissions. `.env`, `.data/`, and builds are ignored by Git;
  `.dockerignore` also excludes environment files and local data. Do not publish
  a raw archive of the working directory.
- The Git repository, initially absent, was initialized during the audit by
  another activity; it had no commits at the last check. No earlier history or
  remote repository was therefore audited. Files added concurrently are not
  covered by the initial scan and were not modified here.
- A personal Tailscale address remains in the README, examples, and default allowed
  origins. Remove this author-specific configuration from distributed defaults.
  It is not a secret key.
- Add a private reporting channel (`SECURITY.md`) and CI for tests, secret scanning,
  and dependency auditing before subsequent publications.

## Verified protections and tests performed

- **23/23 server tests passed**, through the project's script, which creates and
  then removes an isolated PostgreSQL database and a temporary directory.
- **15/15 frontend tests passed**.
- Tests cover, among other things: API access without a session rejected;
  unauthorized origins rejected; file/preview isolation, including after caching;
  local paths; encrypted secrets; per-user search and conversations; Markdown
  rendering with arbitrary HTML/links/images neutralized; agent budgets.
- Review of parameterized SQL queries and user filters, OAuth with user/session-bound
  state, PKCE and expiry, AES-256-GCM with user AAD, file permissions, and fixed
  network destinations in adapters.
- Non-destructive HTTP checks on the local instance: health status 200, anonymous
  workspace 401, page/API headers, and SEC-01 reproduction.
- Read-only inspection of PostgreSQL privileges; dependency audit using a remote registry.

Main commands:

```sh
pnpm --filter @open-file/server test
pnpm --filter @open-file/web test
npm exec --yes --package=pnpm@12.8.1 -- pnpm audit --json
npm exec --yes --package=pnpm@12.8.1 -- pnpm audit --prod --json
```

## Limitations and validation before public exposure

Tests ran with the host's Node **22.12.0**, below the declared minimum version:
they pass, but should be rerun in the supported environment. The already-running
Docker stack was used for HTTP observations; it was not rebuilt, and complete
image/source equivalence is not certified.

No destructive load testing, parser fuzzing, system-image CVE scanning, fresh
build, browser E2E testing, or real Google/OpenAI testing was performed. No local
client bundle under `.next/static` was available for scanning: the absence of
secrets in distributed bundles still needs verification. Public TLS, DNS,
firewall, production proxy, backups, remote repository settings, and history
outside this directory remain out of scope.

Before public exposure: fix SEC-01; require TLS and a trusted network entry point;
close or control registration; add quotas and parser isolation; reduce SQL
privileges; apply frontend headers; clarify retention; rerun checks against a
rebuilt stack with supported versions. Retain regression evidence in CI. This
point-in-time audit does not certify the absence of all vulnerabilities.
