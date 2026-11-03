# Shared Home Bill Splitter

A shared-household expense tracker built around a Hono API on Cloudflare Workers, Cloudflare D1, and a React frontend using TanStack Router. The implementation guide is in [`shared_home_bill_splitter_documentation.md`](shared_home_bill_splitter_documentation.md).

## Features

- Create homes and add members.
- Create bills and split totals into whole-cent shares.
- Allocate remainder cents deterministically by member insertion order.
- Record share payments with idempotency keys and conditional updates to avoid double payments.
- Retrieve bills and outstanding member balances.
- Validate input and enforce financial and referential integrity constraints in the API and database.

## Technology Stack

- **API:** Hono on Cloudflare Workers
- **Database:** Cloudflare D1 / SQLite
- **Frontend:** React with TanStack Router
- **Language:** TypeScript

## Implementation Guide

See [`shared_home_bill_splitter_documentation.md`](shared_home_bill_splitter_documentation.md) for the database schema, API handlers, frontend component, validation behavior, and response examples.

## Decisions

1. **Deterministic remainder allocation via an auto-incrementing sequence**
   - Members use a `seq INTEGER PRIMARY KEY AUTOINCREMENT` column. When a bill total does not divide evenly, extra cents go to the first members ordered by `seq ASC`.
   - This avoids relying on timestamps that may collide and makes allocation order deterministic.

2. **Conditional updates for payment concurrency and idempotency**
   - Payments use `UPDATE bill_shares SET paid_at = ?, idempotency_key = ? WHERE id = ? AND paid_at IS NULL`.
   - Only an unpaid share can be updated. Repeating the same idempotency key returns the existing payment; a different key for an already-paid share returns a conflict.

3. **Database-level integrity constraints**
   - Positive-amount checks, foreign keys with cascading deletes, and unique idempotency keys enforce core data invariants at the database level as well as in application logic.

## AI Policy Disclosure

- **Tools used:** Claude / Gemini for initial scaffolding and test-case pattern validation.
- **Where used:** Structuring remainder allocation and the atomic payment update query.
- **Verification:** The supplied implementation guide states that queries, constraints, and handlers were manually checked against `pnpm test`, `pnpm check`, and `pnpm typecheck`.
