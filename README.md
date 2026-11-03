# Shared Home Bill Splitter

A small household-expense application built with Hono, Cloudflare Workers and D1, React, and TanStack Router. It supports homes, members, bill splitting, payment tracking, and outstanding balances.

## Repository contents

- `api/` — Hono API worker and D1 schema migration.
- `web/` — React + TanStack Router frontend and Vite development server.
- `shared_home_bill_splitter_documentation.md` — detailed implementation notes and API reference.

## Requirements

- Node.js 20 or newer
- pnpm 9 or newer

## Run locally

```sh
pnpm install
pnpm --dir api exec wrangler d1 migrations apply shared-home-bill-splitter --local
pnpm dev
```

Open the Vite URL printed in the terminal (normally `http://localhost:5173`). The frontend proxies `/api` requests to the local Worker on port `8787`. Create a home, keep its ID to share access with housemates, add members, and create bills. Payments are simulated as ledger updates; no money is transferred.

For local API health check, visit `http://localhost:8787/api/health`.

## Scripts

- `pnpm dev` — run the local API and frontend concurrently.
- `pnpm build` — build the frontend for production.
- `pnpm typecheck` — type-check API and frontend.

## Deployment note

Before deploying the Worker, create a Cloudflare D1 database and replace the placeholder `database_id` in `api/wrangler.toml` with its actual ID. Apply migrations remotely and configure a production frontend/API hosting arrangement. The checked-in D1 ID is only a local-development placeholder.

## Design decisions

- Member insertion order uses an auto-incrementing `seq`, ensuring stable remainder-cent allocation.
- Payments conditionally update only unpaid shares and use unique idempotency keys to guard against duplicate payment requests.
- SQLite checks and foreign keys enforce positive amounts and referential integrity.

## AI policy disclosure

The implementation guide documents the AI tools and verification approach used for the initial design. This repository's current runtime and test status should be verified locally with the commands above before submission.
