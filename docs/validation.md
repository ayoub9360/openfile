# Documentation validation status

> These are the earlier documentation checks. Subsequent security corrections,
> production-image validation and migration requirements are documented in
> [Security hardening](security-hardening.md).

[Back to README](../README.md)

Checks performed on **October 4, 2026** in the supplied working directory.
The directory did not contain a `.git` repository: no history, remote, or publication
status was checked. No commit, push, or public deployment was performed.

## Checks performed

| Check                                          | Result                                                     |
| ---------------------------------------------- | ---------------------------------------------------------- |
| Review of scripts, routes, and implementations | Documentation checked against current code                 |
| `docker compose ps`                            | Four services running; services with health checks healthy |
| `pnpm exec turbo typecheck lint`               | 7 successful tasks (including 3 cached)                    |
| `pnpm build`                                   | Backend and frontend compiled, 14 pages generated          |
| `pnpm --filter @open-file/server test`         | 23 passing tests, isolated temporary database              |
| `pnpm --filter @open-file/web test`            | 15 passing tests                                           |
| Real import of the six fictional PDFs          | Six AI analyses completed, then documents approved         |
| Assistant with a real provider                 | Warranty answer, document reading and display              |

The pnpm commands ran through Docker with Node **22.23.3** and pnpm **12.8.1**,
with the current code mounted. Host binaries (Node 22.12.0 and pnpm 9.15.9) do not
match the required versions. An initial attempt in a plain Node image failed
because pnpm was missing; the check then succeeded in the project's image.

Server tests pass, but Better Auth emits diagnostics while initializing the
temporary database (initially missing tables, the `rateLimit.lastRequest` type,
and IP detection). This documentation work does not claim to resolve those diagnostics.

## Documentation and examples

- All local link targets in the 11 Markdown files exist.
- Generation of the six PDFs was verified to be reproducible (identical hashes).
- `scripts/setup.mjs` was checked in a temporary directory: secrets generated,
  `0600` permissions, localhost origin, and preservation of an existing file.
- `docker compose config --quiet` succeeds.
- Prettier formatting was checked for the documentation and generator.
- Five screenshots saved: library, AI filing, document details, collections, and assistant.
- Targeted search for private keys, common token formats, and the previous personal
  network address: no matches in the 189 publishable text files examined. This
  pattern-based check is not a comprehensive secrets audit.

## AI observations

The assistant correctly finds **March 12, 2028** in the fictional PDF and displays
its card. Some tool calls in the initial conversations were rejected and then
successfully retried. One answer also produced a textual citation that did not
follow the expected clickable format. The list of consulted sources and access
to the file remain available. These model behaviors need improvement; a successful
screenshot does not guarantee general reliability.

## Not verified during this work

- A complete Docker installation on a fresh machine.
- The full Playwright suite and the disruptive worker recovery test.
- Real Google OAuth and storage of originals on Drive.
- OCR of images or scanned PDFs: the examples contain selectable text.
- Public HTTPS deployment, reverse proxy, and backup restoration.
- A full security audit, all dependency licenses, and Git history.

The relevant instructions are provided to guide these checks, but their presence
in the documentation does not mean they were executed.
