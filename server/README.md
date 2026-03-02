# YAOS server

Cloudflare Worker server for the YAOS Obsidian plugin. It relays Yjs CRDT updates through a Durable Object and stores attachments plus snapshots in R2.

## Architecture

- One vault maps to one Durable Object-backed sync room.
- Yjs sync runs through `y-partyserver`.
- Durable Object storage persists the live CRDT snapshot.
- Attachments are uploaded through the Worker and stored in R2.
- Snapshots are gzipped CRDT archives stored in R2.
- Auth is a shared bearer token (`SYNC_TOKEN`).

## Local development

```bash
cd server
bun install
bun run dev -- --var SYNC_TOKEN:dev-sync-token
```

The local Worker will be served by Wrangler. Use its printed local URL as the plugin's **Server host**.

## Deploy to Cloudflare

```bash
cd server
bun install
bunx wrangler secret put SYNC_TOKEN -c ../wrangler.toml
bun run deploy
```

The repo-root `../wrangler.toml` defines:

- the Worker entrypoint (`server/src/index.ts`)
- the `VaultSyncServer` Durable Object binding
- the `YAOS_BUCKET` R2 bucket binding

Update `bucket_name` in the repo-root `wrangler.toml` before the first deploy if you do not want to use the default `yaos` bucket name.

## Endpoints

### WebSocket sync

- `wss://<host>/vault/sync/<vaultId>?token=<SYNC_TOKEN>`

### Blob APIs

- `POST /vault/<vaultId>/blobs/exists`
- `PUT /vault/<vaultId>/blobs/<sha256>`
- `GET /vault/<vaultId>/blobs/<sha256>`

### Snapshot APIs

- `POST /vault/<vaultId>/snapshots/maybe`
- `POST /vault/<vaultId>/snapshots`
- `GET /vault/<vaultId>/snapshots`
- `GET /vault/<vaultId>/snapshots/<snapshotId>`

### Debug

- `GET /vault/<vaultId>/debug/recent`

All HTTP endpoints require `Authorization: Bearer <SYNC_TOKEN>`.

## Operational safeguards

- Blob uploads are capped at 10 MB by default.
- Blob existence checks use bounded concurrency.
- Snapshot creation is daily-idempotent through the `/snapshots/maybe` route.
- Snapshot archives are stored compressed to keep R2 usage modest.

## Deploy button note

The canonical infrastructure config lives at the repo root in `wrangler.toml`, and the Deploy to Cloudflare button should point at the repo root. If you eventually want the cleanest possible one-click self-hosting UX, splitting the Worker into its own repo is still a reasonable future simplification.
