# ARCHITECTURE.md

## Objective
Build a production-oriented modular monolith for configurable multi-business management and POS operations.

Do not introduce distributed microservices or a distributed event broker for the MVP.

## Topology
```text
Next.js PWA
    │ REST
NestJS Modular Monolith
    ├── PostgreSQL
    ├── Background worker (same codebase when needed)
    └── optional object storage
```

Redis + BullMQ are introduced only when retryable background workflows require them.

## Workspace
```text
apps/
  web/
  api/
packages/
  domain/
  contracts/
  ui/
  config/
```

### web
Next.js UI, PWA shell, POS, admin screens, browser local storage, synchronization client.

### api
NestJS modules, application services, persistence integration, authorization, background-job producers, OpenAPI.

### domain
Pure business concepts and calculations. No React, Next.js, NestJS, Prisma, or browser dependencies.

### contracts
Shared transport and validation contracts where justified.

### ui
Reusable visual components and design primitives. No authoritative business rules.

## Modules
Initial modules:
- identity
- businesses
- memberships
- authorization
- configuration
- audit
- catalog
- pricing
- registers
- inventory
- POS/sales
- payments
- cash
- promotions
- customers
- current accounts
- dashboard
- reports
- synchronization

Future modules may include documents, notifications, providers, advanced analytics, AI, and provider administration.

## Dependency direction
```text
UI / Transport
      ↓
Application Services
      ↓
Domain
      ↓
Infrastructure Adapters
```

The domain must not depend upward.

## Tenancy
Business is the tenant boundary.

Every protected operation must validate:
- authentication,
- active business,
- membership,
- permission,
- resource ownership.

Missing business scope is a failure.

When an operation references multiple entities — for example a sale's products, payments, inventory movements, cash movements, current-account entries, register, and the acting user — every referenced entity must belong to the same business as the operation itself. This is enforced through business-scoped queries, service-level validation, and referential-integrity constraints where technically appropriate; the backend must never trust business or entity IDs supplied by the frontend without revalidating them.

Authorization checks are evaluated against current database state on every request; session tokens must not carry cached permission claims that could outlive a revoked membership or permission. A revoked membership or permission takes effect on the very next request.

## Data model
Operational facts are append-only where history matters:
- completed sale,
- payment,
- inventory movement,
- cash movement,
- register close,
- cancellation,
- refund,
- audit event.

Current state may use repairable projections.

## Financial settlement
A completed sale is settled transactionally and writes required sale, payment, inventory, cash, audit, and outbox facts together. The `POS/sales` module coordinates this settlement as a single use case, but each participating module owns its own facts: `payments` owns payment records, `inventory` owns inventory movements, `cash` owns cash movements, `current accounts` owns account-ledger entries, `audit` owns audit records, and `synchronization` owns outbox events. A module records its own facts through an application-service method that the coordinating use case calls within the shared transaction; no module writes directly into another module's tables.

PDF generation, printing, email, and provider calls must not block settlement.

## Inventory
Use an immutable movement ledger plus current-stock projection. Negative stock is an operational condition, not an implicit sale failure.

Expiration alerts are informational and never automatically change stock.

## POS
```text
┌─────────────────────────────┬──────────────────────────────┐
│ Current sale               │ Search                       │
│ Products / quantities      │ Categories                   │
│ Total / promotions         │ Quick products               │
│                    CHARGE  │ Product shortcuts            │
└─────────────────────────────┴──────────────────────────────┘
```

Payment occurs through a focused overlay. Multiple in-progress sale tabs are client-side drafts and do not create authoritative facts.

## Offline
Dexie/IndexedDB stores scoped reference snapshots, POS configuration, active context, local drafts, finalized-operation outbox data, synchronization metadata, and recovery-artifact metadata.

Finalized operations must be durable before success is shown.

Transport may be at-least-once; business effects must be exactly-once through idempotency.

## Command envelope
Finalized operations carry:
- operation ID,
- idempotency key,
- business ID,
- device ID,
- local occurred-at timestamp,
- schema version.

See D-036 for the full `occurredAt`/`recordedAt`/`syncedAt` semantics.

## Synchronization
Provide scoped bootstrap, pull cursors/versions, ordered push where required, retry/backoff, partial-failure visibility, actionable rejection, and explicit conflict handling.

Sync ingestion validates business, membership, permission, referenced-entity, and idempotency rules, and checks each operation's structural and mathematical integrity against the price, cost, and promotion snapshots already captured on the sale at finalization time. A historical sale is never invalidated merely because catalog prices or promotions changed after it was finalized offline. A material inconsistency the operation's own snapshot cannot justify is routed into the quarantine/reconciliation flow instead of being silently accepted or rejected.

Completed financial facts are never overwritten.

## Outbox
Use a transactional outbox only for facts requiring synchronization, notification, asynchronous processing, or external delivery.

## Testing
Use pure unit/property tests, PostgreSQL integration tests, synchronization integration tests, Playwright E2E tests, and non-functional checks.
