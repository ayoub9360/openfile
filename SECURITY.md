# Security

## Reporting a vulnerability

Do not publish secrets, private documents, or sensitive exploitation procedures
in a public issue. Once the repository is published on GitHub, use
**Security → Report a vulnerability** if private reporting is enabled.
Otherwise, ask the maintainer for a private channel without describing the
vulnerability publicly. No dedicated security contact or guaranteed remediation
timeframe has been defined yet.

Include the affected version, prerequisites, impact, and a minimal reproduction
using fictional data. Only the current development version is maintained; no
support policy for older versions has been announced.

## Data and limitations

- Sessions and workspaces are isolated by account. Registration is open.
- AI keys and Google tokens are encrypted in the database using AES-256-GCM and a
  server key. Document text, conversations, and files are not encrypted by this
  mechanism; protect disks and backups separately.
- When enabled, AI sends the necessary content to OpenAI. Drive receives originals
  when selected as the destination. These services have their own terms.
- Assistant tools are read-only, but answers can be incorrect. Documents are
  untrusted input, including for the model.
- The application does not yet offer password recovery by email or account
  deletion in the interface.

## Before publishing the repository

Exclude `.env`, `.data/`, volumes, backups, exports, and screenshots of personal
sessions. `.gitignore` does not remove files that are already tracked: also check
Git history if a repository exists. Rotate exposed secrets, even after removing
the file. Only include screenshots using fictional data in the documentation.

The working directory examined for this documentation did not contain `.git`:
remote repository history and any secrets it might contain could not be audited.

To expose the application, follow [Operations](docs/operations.md): HTTPS, upstream
access control, backups, and port restrictions. This documentation is not a
complete security audit.
