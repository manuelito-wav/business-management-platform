# AUDIT.md

## Purpose
Use this checklist after every significant checkpoint and before considering a roadmap item complete.

Do not rewrite working code merely to satisfy the audit. Audit proportionally and fix real issues.

## Repository
- [ ] Change matches the roadmap checkpoint.
- [ ] No unrelated changes.
- [ ] Existing patterns reused where appropriate.
- [ ] No unnecessary abstraction or infrastructure.

## Architecture
- [ ] Modular-monolith boundaries preserved.
- [ ] Domain remains framework-independent.
- [ ] UI is not the authoritative source of business rules.
- [ ] No unnecessary microservice, broker, or second ORM.

## Tenancy
- [ ] Business scope explicit.
- [ ] Membership validated.
- [ ] Permission validated.
- [ ] Resource ownership validated.
- [ ] All entities in a composite operation share the same business_id, validated in the same transaction.
- [ ] Cross-tenant access is denied.

## Authorization
- [ ] Backend enforcement exists independently of UI.
- [ ] Sensitive actions require explicit permissions.
- [ ] Administrative actions are audited.

## Financial
- [ ] No authoritative floating-point money.
- [ ] Rounding deterministic.
- [ ] Split payments cannot silently under-settle.
- [ ] Retries cannot duplicate payments.
- [ ] Failures cannot leave partial financial facts.

## Pricing
- [ ] `profit = salePrice - costPrice`.
- [ ] `marginPercent = ((salePrice - costPrice) / costPrice) * 100`.
- [ ] Cost-relative Margin % semantics preserved.
- [ ] Sale/profit/Margin/cost edit behavior follows `DECISIONS.md`.
- [ ] Zero-cost behavior is explicit and tested.

## Inventory
- [ ] Movement history append-only.
- [ ] Typed reasons explicit.
- [ ] Negative stock follows policy.
- [ ] Expiration alerts do not mutate stock.
- [ ] Failures cannot leave partial movements.

## Sales and payments
- [ ] Drafts do not create authoritative facts.
- [ ] State transitions explicit.
- [ ] Completed sales are not silently edited away.
- [ ] Cancellation/refund effects explicit.
- [ ] Idempotency works where retries exist.
- [ ] Complete-sale transaction is atomic.
- [ ] Providers/PDFs/printing do not block settlement.

## Registers and cash
- [ ] Registers belong to the business.
- [ ] Operational session rules explicit.
- [ ] Cash movements include actor/time/reason/register.
- [ ] Discrepancies are recorded.
- [ ] Conflicting close does not silently destroy another user's draft.

## Promotions
- [ ] Evaluation deterministic.
- [ ] Same sale snapshot used.
- [ ] Exclusion/combinability explicit.
- [ ] Tie-breaking stable.
- [ ] Applied promotion snapshot retained.
- [ ] Best permitted result selected by default.
- [ ] Profitability policy applied.

## Offline and sync
- [ ] Client is not treated as full database replica.
- [ ] Only scoped required data is cached.
- [ ] Finalized operations durable before success.
- [ ] Draft durability explicitly different.
- [ ] Retries duplicate-safe.
- [ ] Server revalidates tenancy and permissions.
- [ ] Completed financial facts never overwritten.
- [ ] Configuration conflicts follow explicit policy.
- [ ] Recovery deletion follows acknowledgement/retention policy.

## Database
- [ ] Authoritative multi-step operations use transactions.
- [ ] Referential-integrity constraints enforce business_id consistency across tenant-owned foreign keys where technically appropriate.
- [ ] Hot queries have appropriate indexes.
- [ ] No accidental N+1.
- [ ] Migration compatibility considered.
- [ ] Projection source of truth documented.

## API
- [ ] Input validated.
- [ ] Error contract consistent.
- [ ] Secrets/internal errors not exposed.
- [ ] Endpoint authorization correct.

## Frontend
- [ ] POS remains fast and readable.
- [ ] Keyboard workflow preserved.
- [ ] Business rules not duplicated in components.
- [ ] POS layout follows left-sale/right-discovery model.
- [ ] Payment uses focused overlay.
- [ ] Images remain optional shortcuts.
- [ ] Sale tabs remain independent.

## Privacy and security
- [ ] No secrets committed.
- [ ] Sensitive logs redacted.
- [ ] Telemetry separated from tenant business data.
- [ ] No prohibited identifiable analytics data collected.

## Testing and commit
- [ ] Relevant unit tests.
- [ ] Integration tests for transaction/tenancy/idempotency risks.
- [ ] E2E coverage for critical flows where available.
- [ ] Regression test for fixed bugs when practical.
- [ ] Format.
- [ ] Lint.
- [ ] Type check.
- [ ] Relevant tests pass.
- [ ] Diff reviewed.
- [ ] Conventional Commit scope coherent.

## High-risk release gate
Changes involving money, payments, stock, register closing, refunds, tenant isolation, authorization, or offline synchronization require deeper review of the relevant sections.

A feature is not complete merely because the happy path works.
