# DECISIONS.md

## D-001 Architecture
Use a modular monolith.

## D-002 Application model
Use a Next.js web application/PWA with a NestJS API.

## D-003 Database
Use PostgreSQL.

## D-004 Persistence
Use Prisma for normal persistence and reviewed parameterized SQL where appropriate.

## D-005 Money
Money is represented authoritatively as integers in the currency's minor unit — never as JavaScript `float`/`number`, and never as an unscaled decimal in application code or the database. For the MVP, operational amounts are handled in ARS (see Pending decisions for broader currency scope). Rounding is centralized in one deterministic function and applied only at defined points: weighted-quantity price calculation, split-payment allocation across methods, promotion/discount distribution across sale lines, and refund amounts. Split payments, promotions, discounts, refunds, and price calculations all use this same precision and rounding policy. This decision does not introduce multi-currency support or a money-formatting library beyond integer minor-unit arithmetic.

## D-006 Margin %
In this project:

`marginPercent = ((salePrice - costPrice) / costPrice) * 100`

This matches the intended meaning: cost $50 and sale $100 means 100% gain relative to cost.

## D-007 Price editing
Synchronize Cost, Sale Price, Profit, and Margin %:
- sale price changes → recalculate profit and Margin %,
- profit changes → recalculate sale price and Margin %,
- Margin % changes → recalculate sale price and profit,
- cost changes → preserve sale price and recalculate profit and Margin %.

## D-008 Units
Products are unit-based by default. Weighted mode must be explicitly enabled. The authoritative internal unit for weighted quantities is the integer gram (`g`); the UI may work with and display grams or kilograms (`kg`), but conversions to the internal unit are explicit and deterministic (e.g., 0.250 kg = 250 g; 1.5 kg = 1500 g). Operational quantities never use floating-point values. The distinction between unit-based and weighted products is preserved throughout the system.

## D-009 Registers
Registers belong to the business. Users manually select authorized registers and establish operational sessions.

## D-010 Sale tabs
Support multiple independent in-progress sale tabs. Unfinished tabs do not create inventory or financial facts.

## D-011 Payment interaction
Payment methods are shown through a focused `Charge/Cobrar` overlay, not permanently as the primary POS layout.

## D-012 Payment methods
Initial configurable methods: cash, QR, card, bank transfer. All enabled by default. QR/transfer are manually verified initially.

## D-013 Promotions
Promotions may include more than two products. They exclude each other by default unless explicitly combinable. The system selects the best permitted deterministic result.

## D-014 Promotion profitability
Warn when discounts/promotions produce zero or negative profit. Business policy may allow, restrict, or prohibit them.

## D-015 Inventory
Inventory history is append-only with typed reasons. Negative stock is allowed and visible as a warning.

## D-016 Expiration
Expiration tracking is optional and disabled by default. Alerts never automatically change stock.

## D-017 Sales history
Completed sales are not silently edited away. Corrections use explicit cancellation, reversal, refund, or adjustment records.

## D-018 Refunds without original sale
Support policy-controlled refund workflows without requiring the original sale in every case. Effects must remain explicit and auditable.

## D-019 Current accounts
Current accounts are optional for customers, employees, and internal staff.

## D-020 Images
Images are optional shortcuts. The full catalog must remain searchable without images.

## D-021 Offline
Use scoped local operational data, not a full database replica. Finalized operations use a durable idempotent outbox.

## D-022 Power loss
Loss of an in-progress sale is acceptable within defined recovery limits. Finalized operations and critical movements require stronger durability.

## D-023 Recovery artifacts
Critical unsynchronized close operations that contain unsynchronized financial operations must produce encrypted recovery exports with verifiable integrity (for example a checksum or signature); access control alone is not a substitute for encryption. Delete only after confirmed synchronization acknowledgement and documented retention handling.

## D-024 Multi-business
Users may access multiple businesses. All data and offline snapshots remain explicitly business-scoped.

## D-025 Personalization
Personalization uses configuration, feature/module enablement, policies, permissions, and reusable optional modules. Truly business-specific features become provider/developer work items.

## D-026 AI
AI uses a finite allowlist of approved actions and cannot execute arbitrary SQL, modify source code, or bypass authorization.

## D-027 Telemetry
Product telemetry must be aggregated, privacy-conscious, and consent-aware. Exclude identifiable customers, individual sales, tenant product data, and identifiable financial values unless explicitly approved after legal review.

## D-028 Fiscal integration
Fiscal/payment providers are modular and do not block core sale settlement. Do not claim fiscal compliance without applicable integration and qualified legal review.

## D-029 Documents
Receipt/document issuance is configurable and must not block sale completion when printing or delivery is unavailable.

## D-030 Commercial release
Commercial offline-capable release requires full synchronization and production hardening.

## D-031 Business bootstrap
The user who creates a new business is atomically assigned that business's Administrator role as part of the same creation operation, independent of the normal permission-granting pathway used afterward.

## D-032 Zero-cost Margin %
When costPrice = 0, Margin % is mathematically undefined:
- The UI must display it as undefined, not as zero or blank.
- Margin%-target editing mode must be disabled while costPrice = 0.
- Sale-price-target and profit-target editing modes remain available.
- Once costPrice becomes greater than zero, Margin % is recalculated using the approved formula (D-006).

## D-033 UUID policy
Use UUIDv7 as the primary identifier policy for client-generatable entities, especially those that may originate offline (sales, payments, inventory movements, events). UUIDv4 may be used only as a fallback where UUIDv7 is unavailable in a given runtime.

## D-034 Offline sale sync validation
A finalized offline sale retains the pricing, cost, and promotion snapshots captured at completion time. Sync ingestion validates structure, mathematical integrity against those snapshots, business, membership, permissions, references, and idempotency. A historical sale is never invalidated merely because catalog prices, promotions, or configuration changed after it was finalized offline. A material inconsistency the snapshot cannot justify is routed into the quarantine/reconciliation flow rather than rejected or silently accepted. Finalized financial operations are never silently overwritten (see D-017).

## D-035 Business timezone
Each business has a `businessTimezone`. For businesses created initially in Argentina, the default is `America/Argentina/Buenos_Aires`. The architecture is not permanently limited to Argentina — `businessTimezone` is a per-business configuration value, not a hard-coded constant. Technical and persistence instants are stored in UTC; timestamps and times shown to users, and used for operational reports, are interpreted using the business's configured timezone. This does not introduce multi-timezone support beyond this single per-business configuration value.

## D-036 Time semantics
Three distinct instants are tracked for an operation: `occurredAt` is when the operation happened on the originating device/operational context; `recordedAt` is when the server durably persisted the operation; `syncedAt` is when an operation that originated locally/offline was confirmed synchronized with the server. All three are persisted in UTC; the business's `businessTimezone` (D-035) is used only for interpretation, display, and reports. `syncedAt` is never used as a substitute for `occurredAt`. An offline operation can show a material gap between `occurredAt` and `recordedAt` — that gap is expected, not an error. This is consistent with the offline/sync design already defined in ROADMAP.md Phase 6 and the D-034 offline sale sync validation policy.

## D-037 Deletion and state policy
Historical and financial facts (sales, payments, inventory movements, cash movements, audit records, and similar) are never deleted or destructively modified; corrections use cancellations, reversals, refunds, adjustments, or other compensating records (see D-017). Configurable/operational entities (for example products, categories, configuration, and promotions) use explicit states — `active`, `inactive`, or another explicit state where relevant — rather than physical deletion, and must not be physically deleted while they have relevant operational or historical references. Historical sales retain sufficient snapshots (see D-034 and the sale aggregate line snapshots) so that later changes to products or prices never alter recorded history. Physical deletion is exceptional and restricted to data with no historical or operational dependency. This project does not adopt a generic soft-delete column for every table; it uses explicit state fields where they are clearer.

## D-038 Permission identifier pattern
Permission identifiers follow `<module>.<action>` (for example `sales.create`, `sales.cancel`, `sales.refund`, `sales.discount`, `inventory.adjust`, `inventory.record_loss`, `register.close`, `register.override_close_conflict`, `reports.view`, `configuration.manage`). Roles never grant permissions implicitly by name — predefined and custom roles assign explicit permissions only (see D-031). Authorization is always evaluated against concrete permissions, never against a role-name check. The full permission catalog grows per module during implementation; this decision fixes the naming convention and a seed set of examples, not the final exhaustive list (see Pending decisions).

## D-039 Current-accounts ledger model
The current-accounts ledger uses a generic model: `account`, `account_holder`, and `account_movement`. An account belongs to a customer, an employee, or internal staff, according to business configuration (see D-019). Movements are immutable facts — for example a charge/debt entry, a payment, an authorized adjustment, or a reversal — never a mutable balance field overwritten without history. A balance projection may exist for efficient reads as long as it stays reconcilable against the movement history. Credit limits, due dates, aging, advanced financial policies, and advanced reconciliation are not implemented yet (see Pending decisions and ROADMAP.md Phase 8). This decision covers only the ledger's data model; the new-customer credit authorization policy (SPECS.md §13.3, ROADMAP.md Phase 5) is unchanged.

## D-040 REST error envelope
All REST error responses use one envelope: `{ "error": { "code", "message", "correlationId", "details" } }`. `code` is a stable, versioned `SCREAMING_SNAKE_CASE` identifier, never the raw HTTP status text; `correlationId` ties the response to server logs and audit records; `details` is an optional array of field-level validation errors (`{ field, message }`). Internal error messages, stack traces, and secrets are never included in a response; unexpected failures return a generic `INTERNAL_ERROR` response, logged server-side under the same correlationId.

## D-041 Pagination and filtering
List endpoints use cursor-based pagination: an opaque `cursor` query parameter and a `limit` (default and max defined per endpoint). Responses return `{ data: T[], pagination: { nextCursor: string | null } }`. Offset/page-number pagination is not used, since audit, sales-history, and reporting tables are expected to grow large (see SPECS.md §23.3). Filters are explicit, typed, per-endpoint query parameters, not a generic filter query language; tenant scope (`business_id`) is always derived from the authenticated context, never accepted as a client-supplied filter.

## D-042 Audit and synchronization event mapping
Every finalized command that changes tenant-owned state produces an audit record (see D-017); read-only queries never do. A command additionally produces a synchronization outbox event only when it can originate offline on a client device and must reach the server later (D-021) — financial and inventory facts: sales, payments, inventory/cash movements, register open/close, cancellations, and refunds. Server-managed configuration (promotions, pricing, permissions, business configuration, AI-executed actions per D-026) is audited but distributed to clients through the scoped pull/bootstrap mechanism (ROADMAP.md Phase 6), not the outbox — the outbox carries client-to-server facts, pull/bootstrap carries server-to-client reference data.

## Pending decisions

The following decisions are required before their dependent work can proceed but have not been approved. Do not resolve them by inference; escalate before the blocking checkpoint is reached.

- **Tax/VAT price basis** (inclusive vs. exclusive of tax). Kept pending until the concrete fiscal scope and applicable legal requirements are defined; the architecture must not prematurely assume a complete fiscal model. Blocks: pricing data entry ahead of any future fiscal integration.
- **Currency scope beyond ARS.** Provisional state, not a blocker: the MVP operates in ARS (D-005); types and contracts must not preclude a future per-business configurable currency; multi-currency is not implemented yet.
- **Full permission catalog per module**, beyond the seed examples in D-038 (the `<module>.<action>` naming pattern is already decided). Blocks: Phase 1 authorization guards.
- **Register-closing conflict/override policy enumeration** (who may force-close another user's active register, and under what conditions). Requires the detailed design of register sessions, permissions, and closing/reconciliation flow. Must be resolved before completing Phase 4 register closing.
- **AI action confirmation classification** (which AI-proposed actions require human confirmation before execution). Kept pending until Phase 9; do not design the full AI confirmation policy now.
