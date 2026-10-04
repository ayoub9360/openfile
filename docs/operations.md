# Operations and troubleshooting

[Back to README](../README.md) · [Installation](installation.md)

## Deploying to a server

The provided stack targets a personal instance on a server with persistent
storage. Deploy the services from the [installation guide](installation.md),
then place the frontend behind an HTTPS reverse proxy. The worker is a continuous
process; static-only hosting is not sufficient.

1. Set `APP_URL=https://documents.example.com` and exact origins in
   `TRUSTED_ORIGINS`; also update the Google callback if used.
2. Terminate TLS at the reverse proxy, forwarding to the frontend on port 3000.
3. Allow requests of at least 105 MiB for multiple-file imports; allow assistant
   responses to run for more than two minutes and disable response buffering to
   preserve NDJSON streaming.
4. Restrict direct access to port 3000. Compose already binds the frontend to
   `127.0.0.1:3000:3000`. If the proxy itself runs in
   Docker, use a shared network and the frontend service name.
5. Keep the database and backend off the Internet. The default published
   PostgreSQL port is restricted to localhost and can be removed for an all-Docker stack.
6. Share `SIGNUP_TOKEN` privately only with invited users, or leave it empty to
   disable registration. Rotate a shared invitation code after use.

An example host reverse-proxy configuration is provided in [examples/Caddyfile](../examples/Caddyfile).
Authentication throttling deliberately uses the backend socket peer, ignoring
forwarded client IP headers. Behind the frontend, users share the authentication
rate-limit bucket. This conservative default is intended for personal instances.

With an HTTPS `APP_URL`, Better Auth uses `Secure` cookies. Check sign-in, an import,
and a streaming response through the proxy. The application was not validated
here with a public reverse proxy or a real domain name.

## Backing up

Back up these items together:

- PostgreSQL: accounts, references, metadata, extracted text, conversations, and encrypted secrets;
- the `files` volume: local originals;
- `.env`, especially `ENCRYPTION_KEY` and `BETTER_AUTH_SECRET`, in a separate vault;
- Google Drive originals through a strategy appropriate for the Google account.

A database-only backup does not include originals. Losing `ENCRYPTION_KEY` makes
stored AI keys and Google tokens unreadable. Backups contain private data: encrypt
them and test restoration.

Example of a consistent backup with a brief pause in writes, run from the project
root in a Bash shell. `backups/` is excluded from Git and the Docker build:

```bash
umask 077
mkdir -p backups
backup_stamp=$(date -u +%Y%m%dT%H%M%SZ)
docker compose stop frontend worker backend
# Ensure services restart even if a later command fails.
trap 'docker compose up -d backend worker frontend' EXIT

docker compose exec -T database sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "backups/database-$backup_stamp.dump"
docker compose run --rm --no-deps -T backend tar -C /data/files -czf - . > "backups/files-$backup_stamp.tar.gz"

# Also copy .env to your secure backup vault.
docker compose up -d backend worker frontend
trap - EXIT
```

Check exit codes and file sizes before treating a backup as valid. To automate
this example, use a Bash script with `set -euo pipefail` and appropriate error handling.

## Restoring

First restore **to an isolated instance with fresh volumes**:

1. Restore the original PostgreSQL settings and secrets from the vault.
2. Start only the database with `docker compose up -d database`.
3. Import the dump into the empty database:

   ```bash
   docker compose exec -T database sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --exit-on-error' < backups/database-DATE.dump
   ```

4. Restore files into the fresh volume:

   ```bash
   docker compose run --rm --no-deps -T backend tar -C /data/files -xzf - < backups/files-DATE.tar.gz
   ```

5. Start the backend, worker, and frontend. Check sign-in, previews, downloads,
   search, and Drive access if used.

These commands must not target an active instance that already contains data.
Changing the PostgreSQL password or `COMPOSE_PROJECT_NAME` does not automatically
migrate volumes.

## Updating

Back up before updating, review schema changes, then rebuild:

```bash
docker compose up --build -d
docker compose ps
curl --fail http://localhost:3000/api/health
```

The one-shot `migrate` service applies migrations before the backend starts. An older image is not necessarily
compatible with a migrated database: rollback may require restoring both the
database and files.

## Diagnosing issues

```bash
docker compose ps
docker compose logs --tail=100 backend worker frontend
curl --fail http://localhost:3000/api/health
```

Do not publish raw logs without checking for personal content or secrets. The
health endpoint checks the database, but not whether Drive, AI, or actual worker
processing is functioning correctly.

| Symptom                                  | What to check                                                        |
| ---------------------------------------- | -------------------------------------------------------------------- |
| Import stuck in analysis                 | Worker running, logs, storage access, AI key and quota               |
| `Origin not allowed` or sign-in rejected | Browser origin, `APP_URL`, `TRUSTED_ORIGINS`, service restart        |
| OpenAI rejection                         | Key, model permissions, quota; save settings, then retry             |
| Empty semantic search                    | Approved file, AI enabled, reanalysis after embedding changes        |
| Scanned PDF has no text in manual mode   | Enable AI and rerun analysis                                         |
| Google callback rejected                 | Exact URI, remote HTTPS origin, OAuth client, and test users         |
| Drive file inaccessible                  | Reconnect the same Google account and check that the original exists |
| Local write denied                       | Same volume for API and worker, UID 1000 permissions                 |
| Decryption error after migration         | Restore the previous `ENCRYPTION_KEY`; do not generate a new key     |
| No documents after a Compose change      | Check the project name and selected volumes                          |

The PostgreSQL queue uses leases; an interrupted job can be recovered after five
minutes, with up to three automatic attempts depending on the error. The retry
button lets you resume after correcting the issue. A conversation interrupted by
a server shutdown may need three minutes before recovery.
