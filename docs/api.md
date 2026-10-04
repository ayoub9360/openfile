# HTTP API

[Back to README](../README.md) · [Architecture](architecture.md)

This reference is based on the Express routes in `apps/server/src/http/`. This
internal API evolves with the interface; it is not advertised as a stable public
contract. All URLs below are relative to the frontend origin.

## Authentication and errors

Better Auth exposes `/api/auth/*`. The application uses cookie-based sessions,
without a public API key. Business routes require a session. Requests that modify
data also require an allowed `Origin` header. In the browser, same-origin calls
send the session cookie automatically.

The business API limit is 180 requests per minute per user; authentication has its
own limit. Common codes: `401` without a session, `403` for a rejected origin,
`404` for an absent/inaccessible resource, `409` for a processing or revision
conflict, `400` for invalid input, and `429` for an exceeded limit. See the Zod
schemas and error handler for each route's exact contract.

## Documents and workspace

| Method and route                   | Purpose                                                              |
| ---------------------------------- | -------------------------------------------------------------------- |
| `GET /api/health`                  | API and database health, no session required                         |
| `GET /api/workspace`               | Account documents, collections, activities, settings, and connectors |
| `POST /api/documents`              | Multipart: `files` (up to 5), `storage` (`Local` or `Google Drive`)  |
| `PUT /api/documents/:id`           | `{ document, approve }`: metadata and optional approval              |
| `POST /api/documents/approve`      | `{ ids }`, from 1 to 50 IDs                                          |
| `POST /api/documents/:id/favorite` | Toggle favorite                                                      |
| `POST /api/documents/:id/archive`  | Archive without deleting the original                                |
| `POST /api/documents/:id/retry`    | Rerun analysis                                                       |
| `DELETE /api/documents/:id`        | Delete and schedule storage cleanup                                  |
| `GET /api/documents/:id/file`      | Authenticated original file                                          |
| `GET /api/documents/:id/preview`   | Authenticated WebP preview                                           |
| `POST /api/collections`            | Create or replace a collection by its `id`                           |
| `PUT /api/settings`                | Profile and naming settings                                          |

Import returns `{ state, documentIds, errors }`. Analysis continues in the worker;
track `processing` in the workspace (`queued`, `processing`, `ready`, `failed`).
Document status is `pending`, `filed`, or `archived`.

To edit a document, provide `name`, `kind`, `issuer`, `date` (YYYY-MM-DD), `storage`,
`folder`, and `tags`, optionally `amount` and `revision`. The revision detects
concurrent edits. Do not request approval during processing. The full schema is
in `apps/server/src/http/app.ts`.

## Integrations

| Method and route                        | Purpose                                            |
| --------------------------------------- | -------------------------------------------------- |
| `GET /api/integrations`                 | AI and connector status, without the API key value |
| `PUT /api/integrations`                 | AI settings, optional key, and destination folders |
| `POST /api/connectors/drive/authorize`  | Google consent URL                                 |
| `GET /api/connectors/drive/callback`    | OAuth callback bound to the initiating session     |
| `POST /api/connectors/:id/test`         | Test a connector                                   |
| `POST /api/connectors/drive/disconnect` | Disconnect Drive                                   |

Never include a real key in an issue, example, or command retained in shell
history. Use the interface for configuration.

## Conversations and streaming

| Method and route                       | Purpose                                                           |
| -------------------------------------- | ----------------------------------------------------------------- |
| `GET /api/conversations`               | The 50 recent conversations                                       |
| `POST /api/conversations`              | `{ scope: "all" \| "Local" \| "Google Drive" }`, returns `201`    |
| `GET /api/conversations/:id`           | Conversation and persisted messages                               |
| `POST /api/conversations/:id/messages` | `{ id, text }`, a new UUID and text of 1 to 8,000 characters      |
| `POST /api/search/answer`              | Legacy endpoint: `{ question, ids? }`, retained for compatibility |

Sending a message returns `application/x-ndjson`, one JSON object per line.
Empty lines keep the connection alive and must be ignored. The event contract is
defined in `packages/core/src/assistant.ts`; the reference consumer is
`apps/web/src/infrastructure/http-assistant.ts`.

The server reloads history; the client does not send its own history as a trusted
source. Concurrent turns and duplicate IDs are rejected. Closing the stream
interrupts the turn; reloading the conversation retrieves its persisted state.
See [Assistant](assistant.md) for tools, limits, and source validation.
