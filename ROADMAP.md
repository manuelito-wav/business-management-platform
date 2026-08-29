# Implementation Roadmap

## Delivery principles

- Build a **modular monolith**: one deployable NestJS API, one worker process
  from the same codebase when background jobs are needed, and one Next.js PWA.
  Keep domain modules internally isolated; do not introduce microservices or an
  event broker as a distributed architecture in the MVP.
- Treat money, quantities, timestamps, identifiers, and state transitions as
  domain concerns, not UI details. Use integer minor monetary units (D-005),
  integer-gram quantity precision for weighted products (D-008), UTC instants
  plus business timezone (D-035/D-036), and UUIDv7 identifiers generated
  before an offline operation is queued (D-033).
- A completed sale, payment, inventory movement, cash movement, closure, and
  audit record are append-only business facts. Corrections use explicit
  cancelling, reversal, refund, or adjustment records; they do not mutate away
  history.
- Design online commands as idempotent from day one. Every finalized client
  operation carries an operation ID, business ID, device ID, local occurred-at
  timestamp, schema version, and idempotency key. This is necessary even before
  the full offline UI ships.
- Prefer module-local application services and explicit database transactions
  over generic repositories, a universal rules engine, or event sourcing for
  every entity. Persist a transactional outbox only for facts that must later
  be synchronized, notified, audited, or processed asynchronously.
- Each checkpoint below is intended to be a small, independently reviewable
  commit. Do not combine unrelated checkpoints.

## Delivery stages

- **Technical Foundation (Phases 0-2):** establish the executable monolith,
  financial and tenant invariants, authorization, catalog/register foundations,
  and a deliberately small local POS-data foundation. This stage proves that
  later POS work will not be structurally tied to always-online reads; it does
  not include offline finalization or synchronization.
- **Core Operational MVP (Phases 3-5):** deliver the reliable online operational
  core: inventory and cash ledgers, POS sales and payment settlement, basic
  promotions, sales history controls, dashboard, and core reports. This is the
  appropriate MVP for an initial controlled pilot, subject to the hardening
  required for its operating environment.
- **Extended Operational Features (Phase 6):** add the complete offline-first
  operational workflow: durable outbox, idempotent synchronization, retry,
  conflict handling, and recovery. It extends the MVP rather than redefining
  the earlier online vertical slice.
- **Commercial / Production Readiness (Phase 7):** make the selected delivery
  stage deployable and supportable with observability, recovery, security,
  staging, pilot validation, and legal review. A commercial offline-capable
  release includes both Phase 6 and this phase.
- **Advanced Features (Phases 8-9):** add optional business modules,
  integrations, provider capabilities, and controlled AI only when their
  prerequisites and commercial value justify them.

## Recommended baseline technology

- **Workspace:** pnpm workspaces with Turborepo; `apps/web`, `apps/api`, and
  focused packages such as `domain`, `contracts`, `ui`, and `config`. Share
  pure calculation types, validation schemas, and API DTOs--not NestJS or
  browser infrastructure.
- **Web:** Next.js + React + strict TypeScript; Tailwind CSS and Radix UI (or
  shadcn/ui built on it) for an accessible compact UI; React Hook Form + Zod;
  TanStack Query for server state; Zustand only for ephemeral POS tab state.
- **API:** NestJS REST API, PostgreSQL, and Prisma with reviewed SQL migrations.
  Use PostgreSQL row-level tenant predicates in every query through module
  services; do not rely on Prisma middleware as the only isolation control.
- **Prisma usage:** use Prisma for standard application persistence, but do not
  force it into inefficient or unnecessarily complex queries. Performance-
  sensitive inventory queries, financial/reporting aggregation, and advanced
  SQL may use reviewed, parameterized SQL through the same PostgreSQL access
  boundary. Do not introduce a second ORM.
- **Offline:** native PWA service worker using Workbox, IndexedDB through
  Dexie, and a versioned local schema. Store cached operational reference data,
  active session context, finalized-operation outbox, and recovery artifacts;
  do not attempt to mirror the whole server database.
- **Jobs and storage:** introduce Redis + BullMQ through `@nestjs/bullmq` when
  the first retryable/background feature is delivered (for example PDFs,
  document issuance, email, or schedules); introduce S3-compatible object
  storage when images, PDFs, or recovery exports are enabled. Jobs must be
  idempotent and never be required to settle a sale.
- **Quality and operations:** ESLint, Prettier, Husky/lint-staged, Vitest,
  Testcontainers PostgreSQL/Redis, Playwright, OpenAPI generated from NestJS,
  Sentry (or equivalent error tracking), structured JSON logs, and
  OpenTelemetry server instrumentation. Pin versions and review upgrade policy
  at project bootstrap.

### Incremental infrastructure adoption

- **Required to start meaningful development:** the pnpm workspace, Next.js,
  NestJS, PostgreSQL, Prisma/migrations, strict quality gates, and a minimal
  test runner. A local PostgreSQL container is sufficient initially.
- **Introduce with the corresponding need:** Dexie with the local POS-data
  foundation; object storage with optional images or document/recovery files;
  Redis/BullMQ with the first background/retry workflow; Testcontainers when
  database/Redis integration coverage is added; Playwright when the first
  critical vertical POS flow exists; and Sentry/OpenTelemetry/production
  monitoring during production hardening.
- This sequencing reduces day-one setup without weakening the selected
  production architecture or its release requirements.

## Phase 0 -- Decisions, invariants, and executable foundation

**Depends on:** nothing.  
**Outcome:** the team can start safely without later rewriting money, tenancy,
or synchronization boundaries.

- Create the workspace, local PostgreSQL development service, environment
  templates, and development/staging/production configuration conventions.
  Add Redis and S3-compatible services only with the feature milestones that
  need them.
  - Commit: `chore: bootstrap pnpm workspace and local database` -- done (ec2f6f2)
- Add strict TypeScript, linting, formatting, commit checks, CI for lint/type
  check/unit tests, and a CODESTYLE.md compatible with the specification.
  - Commit: `chore: add quality gates and code style` -- done (222223b)
- Confirm the already-approved product-pricing and foundational invariants
  before building on them: `profit = salePrice - costPrice`, `marginPercent =
  ((salePrice - costPrice) / costPrice) * 100` (D-006/D-007), the zero-cost
  Margin % behavior (D-032), the UUIDv7 identifier policy (D-033), the
  integer-minor-unit money and rounding policy (D-005), weighted-quantity
  precision in integer grams (D-008), the business timezone policy (D-035),
  time semantics for `occurredAt`/`recordedAt`/`syncedAt` (D-036), and the
  deletion/state policy (D-037). In this product, **Margin %** deliberately
  means profit relative to cost (often called markup elsewhere); do not add a
  second percentage field. Tax/fiscal values remain out of MVP scope and
  pending (see DECISIONS.md "Pending decisions"). Do not begin pricing UI
  until this confirmation is complete.
  - Commit: `docs: define financial and time invariants` -- confirmed, already
    recorded in DECISIONS.md D-005/D-006/D-007/D-008/D-032/D-033/D-035/D-036/
    D-037 (22ebadd)
- Define module boundaries, dependency direction, REST error envelope,
  pagination/filter conventions, OpenAPI publication, and a versioned command
  envelope for finalized operations. Define which operations produce audit and
  synchronization events.
  - Commit: `docs: define modular monolith contracts` -- done (4cffd25)
- Produce an initial data model and migration policy: every tenant-owned table
  has `business_id`; immutable operational facts reference actor, register/
  session where applicable, and correlation/operation IDs; audit/outbox tables
  are separately indexed and never read on the POS hot path. Configurable/
  operational entities use explicit state fields (for example active/
  inactive) rather than physical deletion, per D-037.
  - Commit: `docs: define tenant and operational data model` -- done (72ab4e4)
- Establish a test-data factory and deterministic clock/ID abstractions for
  domain tests. Seed a kiosk business only for local development.
  - Commit: `test: add deterministic domain test support` -- clock/ID
    abstractions and the shared test harness done (9b72a70); seeding a kiosk
    business relocated to Phase 1's memberships/roles checkpoint below, since
    it needs the Business/User/Membership models that checkpoint introduces

## Phase 1 -- Identity, tenancy, authorization, and configuration core

**Depends on:** Phase 0.  
**Outcome:** an authenticated user can select an explicitly authorized business;
all subsequent modules have safe tenancy and permission primitives.

- Implement users, credentials, password hashing, login by username/email,
  refresh/session rotation, password-reset tokens, logout, and secure session
  storage. Route password-reset delivery through an abstract delivery
  boundary (a port/interface) rather than a concrete provider, so email, SMS,
  or another channel can be selected later without changing core auth logic.
  Keep POS PIN/biometrics as future authentication adapters.
  - Commit: `feat: add password authentication and sessions` -- done (fc49c1e)
- Implement businesses, memberships, active-business selection, predefined
  seed roles, custom roles, granular permission catalog using the
  `<module>.<action>` identifier pattern (D-038), and role assignment per
  membership. A role name grants nothing by itself. Seed a kiosk business for
  local development only (never staging/production), per Phase 0.
  - Commit: `feat: add multi-business memberships and roles`
- Add guards and service-level authorization that validate authentication,
  active business, membership, permission, and resource business ownership for
  every protected command/query. Make missing business scope a failure.
  - Commit: `feat: enforce backend tenant authorization`
- Provide session/device listing and authorized remote session termination.
  - Commit: `feat: add session device management`
- Implement a typed per-business configuration/module registry with safe
  defaults: payment methods, feature flags, policies, timezone (default
  `America/Argentina/Buenos_Aires` per D-035), and later module settings. It
  is configuration, not arbitrary code execution.
  - Commit: `feat: add business configuration registry`
- Add an audit writer for security, permission, configuration, and later
  financial actions, with actor, target reference, minimal before/after
  metadata, correlation ID, and indexes. Add a read API gated by permission.
  - Commit: `feat: add foundational audit logging`

## Phase 2 -- Catalog, pricing, and operational register foundation

**Depends on:** Phase 1.  
**Outcome:** authorized staff can configure the data and register context needed
for a sale; no financial sale is settled yet.

- Implement categories, products, identifiers/barcodes/SKUs, optional images
  stored in object storage when image support is enabled, searchable catalog
  endpoints, and per-business uniqueness rules. Index normalised
  barcode/SKU/external identifiers.
  - Commit: `feat: add product catalog and categories`
- Implement unit and weighted sale modes with GR/KG initial units, integer
  grams as the internal authoritative precision (D-008), and explicit
  quantity validation/conversion rules. Do not encode floating-point values in
  the API or database.
  - Commit: `feat: add weighted product support`
- Implement a pure product-pricing service exposing the four synchronized
  values: Cost, Sale Price, Profit, and Margin %. Use the approved cost-based
  Margin % formula (for example, cost $50 / sale $100 means profit $50 and
  Margin % 100; cost $50 / sale $75 means profit $25 and Margin % 50). Support
  manual sale-price, target-profit, and target-Margin-% editing modes:
  changing sale price recalculates profit/Margin %; changing profit recalculates
  sale price/Margin %; changing Margin % recalculates sale price/profit; and
  changing cost preserves sale price while recalculating profit/Margin %. Store
  the selected input mode and resolved values; never automatically increase the
  customer sale price merely because cost changes.
  - Commit: `feat: add deterministic product pricing`
- Add optional price-list data model and selection boundary, but keep the
  feature disabled and out of the initial POS flow until enabled per business.
  - Commit: `feat: add optional price list foundation`
- Implement registers, authorized register selection, operational sessions,
  configurable opening/closing policy, and status. Do not permanently assign a
  register to a user.
  - Commit: `feat: add register operational sessions`
- Introduce the minimal Dexie-backed local POS-data foundation: versioned
  read-only snapshots of the active business's products, categories, relevant
  prices, and POS configuration, refreshed during normal online use. Validate
  scoped cache refresh and schema migration now; do not add a durable outbox,
  offline finalization, retries, or synchronization conflict handling here.
  - Commit: `feat: add local POS reference cache`
- Build the responsive application shell/dashboard entry and product management
  screens. Keep the POS workspace visually separate from the general navigation.
  - Commit: `feat: add operational navigation and catalog screens`

## Phase 3 -- Inventory ledger before sale settlement

**Depends on:** Phase 2.  
**Outcome:** inventory has an auditable source of truth that sales can consume.

- Create an immutable inventory-movement ledger with typed reasons, product,
  quantity, optional source operation, actor, and business scope. Maintain a
  transactional current-stock projection for fast reads; reconcile it from the
  ledger in tests/admin tooling.
  - Commit: `feat: add inventory movement ledger`
- Add receiving/purchase, manual adjustment, and dedicated loss commands;
  configure loss reasons including theft, damage, expiration, and other. Each
  produces inventory and audit facts in one database transaction.
  - Commit: `feat: add stock adjustments and losses`
- Allow negative stock by design and surface it as an operational warning, never
  as an implicit sale failure. Add low-stock/minimum-stock projections.
  - Commit: `feat: support negative stock and alerts`
- Add expiration tracking disabled by default, enabled per business, with
  product/batch expiration data, configurable near-expiration windows, and
  informational-only near-expiration/expiration alerts. An alert must never
  remove or reduce stock, mark stock as lost, or create an inventory adjustment.
  The workflow is alert → authorized physical verification → user decision;
  later actions may leave stock available, record a loss, return it to a
  supplier, or follow another configured business action. Keep this isolated
  from the non-expiration inventory path.
  - Commit: `feat: add optional expiration tracking`
- Verify stock projection repair/rebuild and tenant isolation with integration
  tests before any sale can create movements, including that expiration alerts
  alone never create a movement or change stock.
  - Commit: `test: verify inventory ledger projections`

## Phase 4 -- Core POS, payments, and cash settlement (online MVP slice)

**Depends on:** Phase 3 and an open authorized register session.  
**Outcome:** a cashier completes accurate online sales quickly; this is the
first end-to-end operational slice.

- Implement the compact POS interaction model: the left section is the current
  sale (products, quantities, prices, total, applied promotions, and visible
  promotion savings); the right section is discovery (keyboard-first fast
  name/SKU/barcode search, categories, and configurable quick access). The
  full catalog remains searchable. Visual tiles/cards and images are optional
  shortcuts, never a catalog requirement. Use a prominent `Charge` / `Cobrar`
  action that opens a focused payment modal/overlay while the sale remains
  visible behind it; payment methods are not permanently the primary layout.
  - Commit: `feat: add POS product discovery and cart`
- Implement business-specific **Quick Products / Rápidos** configuration for
  selectively surfaced shortcuts such as frequently sold products, cigarettes,
  ice, beverages, current offers, and other local needs. Allow optional images
  for shortcuts while keeping configuration, categories, and catalog search
  independent from product images.
  - Commit: `feat: add configurable quick products`
- Implement multiple independent in-progress sale tabs in client state, with
  lightweight strategic local draft recovery using the Phase 2 store. Never
  write an inventory or financial fact for a scanned item in an unfinished tab.
  - Commit: `feat: add multi-tab POS drafts`
- Implement an immutable sale aggregate with line snapshots (name, unit,
  quantity, cost/price at sale time), totals, first-item timestamp, status, and
  explicit transitions. Define abandonment rules so inactive tabs do not skew
  ticket-duration reporting.
  - Commit: `feat: add sale aggregate and state transitions`
- Implement cash/QR/card/transfer payment methods, all enabled by default per
  D-012 and configurable per business thereafter, with split payments.
  Validate that payment allocation satisfies the total under explicit rounding
  and overpayment/change rules; QR/transfer are employee-verified initially.
  - Commit: `feat: add split payment settlement`
- Implement cash deposit, withdrawal, supplier payment, expense, and opening
  fund as auditable cash ledger entries, including the sale-settlement and
  refund-reversal movement types defined in SPECS.md §11.4; include allowed
  zero amounts, reason, actor, register, automatic time, and optional notes.
  - Commit: `feat: add register cash movements`
- Implement one transactional `complete sale` command that idempotently writes
  sale, payments, sale inventory movements, cash effect for cash payments,
  audit record, and outbox event. Return the same result on an operation-ID
  retry. No print, PDF, or provider call may sit in this transaction.
  - Commit: `feat: settle sales with stock and cash effects`
- Implement expected-versus-counted register close, discrepancy recording,
  policy-driven conflict warning/authorized override, notification trigger, and
  re-establishment requirement for affected users. Until the formal
  notification module lands (Phase 8), deliver the notification trigger as a
  direct in-app signal rather than a persisted notification record.
  - Commit: `feat: add register closing and discrepancy handling`
- Add acceptance coverage for the register-conflict scenario: when Employee A
  has an active Register 2 session and Employee B attempts to close Register 2,
  detect the active association; show an authorized user a clear conflict
  warning/identity; permit continuation only by policy; audit the action;
  notify Employee A; and require Employee A to establish an appropriate
  register session before future operations. Employee A's unfinished sale tabs
  must remain recoverable through the draft model, not be silently lost.
  - Commit: `test: cover register conflict and draft recovery`
- Add permission-scoped sales history and a critical Playwright journey: login,
  select register, scan/search, weighted item, split charge, and completed
  receipt view.
  - Commit: `test: cover core POS settlement workflow`

## Phase 5 -- MVP business rules and operational visibility

**Depends on:** Phase 4.  
**Outcome:** completes the Core Operational MVP with required promotions,
history controls, dashboard/reporting, and auditability without importing
future complexity.

- Implement a pure, versioned promotion evaluator with initial templates for
  multi-product/multi-quantity bundle fixed price and percentage discount,
  date ranges, exclusion-by-default, and an explicit combinability flag.
  - Commit: `feat: add basic promotion rules`
- Define deterministic conflict resolution: evaluate the same cart snapshot,
  choose the customer-best eligible allowed result, use a documented stable
  tie-breaker, and record applied promotion snapshots on the sale. Expose an
  Offers quick-access source without making it a separate settlement path.
  - Commit: `feat: add deterministic promotion selection`
- Add profitability warnings and business policy for zero/negative-profit
  promotions/discounts (allow-with-warning, permission-restricted, prohibited).
  Treat a manually applied discount as its own permission-gated, audited sale
  action subject to the same profitability policy as automatic promotions --
  never a silent price edit. Warn authorised users when catalog cost/price
  changes affect active promotion profitability; do not silently disable a
  promotion.
  - Commit: `feat: add promotion profitability controls`
- Implement cancellation, configurable recent-sale action, refunds with and
  without original sale, permission/policy-aware reasons, and replacement/
  loss outcomes. Model their reversal/compensating payment, cash, and inventory
  effects explicitly; never delete or edit the original completion.
  - Commit: `feat: add audited cancellations and refunds`
- Add customers and customer purchase linking. When the per-business current-
  accounts feature is enabled, provide the basic append-only account ledger
  (account / account_holder / account_movement model, D-039) for configured
  customer, employee, and/or internal-staff accounts: current balance, debt
  entries, payment entries, and basic movement history. Make
  new-customer credit authorization itself configurable per business
  (disabled, managers only, employees with permission, or another simple
  policy) and permission-gated. Keep the module fully disabled for businesses
  that do not use it; defer credit limits, aging, due dates, advanced
  reconciliation, and advanced financial reporting.
  - Commit: `feat: add basic configurable current accounts`
- Implement the **Dashboard** as immediate operational information: current-day
  sales/totals, payment-method summary, urgent and low-stock alerts, register
  discrepancies/status, and other high-priority indicators. It should support
  fast operational decisions, not replace historical reporting. Until the
  formal notification module lands (Phase 8), surface these alerts as direct
  in-app indicators rather than persisted notification records.
  - Commit: `feat: add operational dashboard`
- Implement **Reports** as historical and configurable analysis: sales by date
  range, employee and category; product performance; profitability; inventory
  and cash discrepancies; and period comparisons. Use indexed SQL
  aggregates/materialized read models where justified; reports must derive from
  immutable facts, not UI totals.
  - Commit: `feat: add core historical reports`
- Add reusable date/day-of-week/month/range and comparison filtering for reports
  (for example highest-sales Saturdays, August Saturday averages, the highest
  month in the last year, and this-month versus previous-month), plus ticket
  time excluding abandoned/inactive drafts by the approved rule.
  - Commit: `feat: add report time analysis and comparisons`
- Run an MVP acceptance pass for every minimum requirement and permission
  boundary; fix data/financial/audit defects before visual expansion.
  - Commit: `test: verify MVP business workflows`

## Phase 6 -- Extended offline-first delivery and event synchronization

**Depends on:** Phases 1-5. The command envelope and idempotency work from
Phase 0/4 are mandatory prerequisites.  
**Outcome:** temporary connectivity loss does not lose finalized POS operations
or require a parallel rewrite of sales, stock, or cash logic.

- Add the PWA manifest, service worker, update strategy, offline shell, and a
  visible connection/sync status. Cache only versioned application assets and
  explicitly selected operational reference data.
  - Commit: `feat: add PWA shell and connectivity status`
- Extend the early Dexie schema with active business/register context, local
  drafts, durable outbox, sync cursor, and recovery-artifact metadata. Retain
  the existing catalog/categories/prices/configuration snapshots and make
  migrations/recovery on incompatible client schemas explicit.
  - Commit: `feat: add local operational data store`
- Implement authenticated scoped bootstrap/pull APIs with data version/cursor
  semantics. Do not download unrelated businesses or unneeded historical data.
  Define catalog/configuration freshness and what the POS does when a required
  snapshot is missing or stale.
  - Commit: `feat: add scoped POS data synchronization`
- Route finalized offline sale, payment, inventory/cash movement, and close
  commands through an ordered durable outbox. Persist the whole finalized
  operation atomically in IndexedDB before showing success; drafts remain
  lower-durability by design.
  - Commit: `feat: queue finalized offline operations`
- Implement server sync ingestion with operation IDs, schema validation,
  business/membership/permission/reference revalidation, structural and
  mathematical integrity validation against the pricing/promotion snapshots
  already captured on the operation, idempotent result storage, and a
  transactional outbox. A historical sale is never invalidated merely because
  catalog prices or promotions changed after it was finalized offline. Sync
  retry is at-least-once transport with exactly-once *business effect*
  through idempotency--never promise exactly-once delivery.
  - Commit: `feat: add idempotent event sync ingestion`
- Implement pull/push ordering, retry/backoff, partial-failure display,
  quarantine/actionable reconciliation for rejected configuration conflicts
  and for material sale inconsistencies the operation's own snapshot cannot
  justify, and duplicate-safe financial/inventory processing. Completed
  financial facts are never overwritten; stock remains ledger-derived;
  configuration conflicts use explicit version/policy handling rather than
  blanket last-write-wins.
  - Commit: `feat: add sync conflict and recovery handling`
- Generate an encrypted or access-controlled exportable recovery artifact for
  unsynchronized critical register-closing operations; record deletion only
  after confirmed server acknowledgement and a documented retention interval.
  - Commit: `feat: add offline closing recovery exports`
- Execute browser/device test scenarios: cold offline startup with cached data,
  duplicate retry, reconnect after a completed sale, close while offline,
  stale configuration, server rejection, interrupted sync, and two devices
  selling the same negative-stock product.
  - Commit: `test: cover offline synchronization recovery scenarios`

## Phase 7 -- Commercial / production readiness and operational deployment

**Depends on:** Phase 6 for an offline-capable commercial release; Phases 0-5
for a controlled online Core Operational MVP pilot.  
**Outcome:** a deployable, observable product with a controlled pilot path.

- Add structured logs with request/correlation/business/module/version fields,
  redaction, server error tracking, health/readiness checks, uptime monitoring,
  and bounded server metrics. Keep telemetry separate from tenant business data.
  - Commit: `feat: add production observability foundations`
- Add minimal aggregated opt-in/consent-aware telemetry for feature use, error
  category, performance, and application version; explicitly exclude customer
  names, individual sales, products, and identifiable financial values.
  - Commit: `feat: add privacy-conscious product telemetry`
- Add rate limits, security headers, dependency scanning, secrets management,
  database backup/restore drills, object-storage lifecycle rules, and migration
  rollback/forward policy. Verify tenant access with adversarial tests.
  - Commit: `chore: harden production security and recovery`
- Build managed staging deployment, preview migration workflow, production
  release checklist, feature-flag rollout/rollback plan, and pilot operating
  handbook for outage and reconciliation procedures.
  - Commit: `docs: add staging and pilot release runbooks`
- Conduct cashier usability/performance tests with barcode scanners, concurrent
  register workflows, and real catalog sizes. Fix measured POS latency and
  correctness issues before broad release.
  - Commit: `test: validate high-volume POS pilot scenarios`
- Obtain qualified Argentine legal review for terms, privacy policy, deployment
  data handling, and any fiscal claims before commercial release; do not claim
  fiscal compliance absent that work and applicable integration.
  - Commit: `docs: add commercial compliance review checklist`

## Phase 8 -- Post-MVP modules, delivered selectively

**Depends on:** the relevant core facts and Phase 7 hardening. These modules
are deliberately outside the MVP and must be independently justified.

- Extend the basic current-account ledger with advanced customer/employee
  credit policies, limits, due dates, aging views, advanced reconciliation,
  advanced financial reporting, and reconciliation tests.
  - Commit: `feat: add advanced current account controls`
- Add additional price-list activation and policy-driven price selection only
  when a business needs it; preserve a price snapshot on every sale line.
  - Commit: `feat: enable configurable price lists`
- Expand promotions with new explicitly versioned rule types, scheduling, and
  combinability only after property-based and regression tests prove existing
  decisions remain deterministic.
  - Commit: `feat: add advanced promotion rules`
- Add notifications (low stock, discrepancy, pending sync/document) through a
  module-local notification outbox and user preferences. Delivery failure must
  not change the source operation.
  - Commit: `feat: add operational notifications`
- Add PDF receipt generation, manual/automatic document policy, reprint, and
  non-blocking print retry. Model fiscal-document issuance separately from a
  sale and enqueue retryable offline-pending documents.
  - Commit: `feat: add receipt document workflow`
- Add payment-provider and fiscal-provider adapters behind narrow ports only
  after selecting a concrete provider/country. Keep manual verification and
  core settlement provider-agnostic.
  - Commit: `feat: add payment provider adapter boundary`
- Add scheduled reports through BullMQ after report queries and delivery
  destinations are defined; make schedules tenant scoped and jobs idempotent.
  - Commit: `feat: add scheduled report delivery`
- Add advanced analytics/read models only when core report performance warrants
  them; introduce a warehouse or separate analytical store only with measured
  need, not pre-emptively.
  - Commit: `feat: add advanced analytics projections`

## Phase 9 -- Controlled AI and provider capabilities

**Depends on:** mature permissions, audit, module configuration, observability,
and an approved security review.  
**Outcome:** AI assists without becoming a privileged control plane.

- Define a finite, typed allowlist of AI tools for explanation, configuration,
  module toggles, permission requests, and structured feature requests. No tool
  exposes SQL, arbitrary API access, or source-code modification.
  - Commit: `feat: add controlled AI action contracts`
- Implement the AI chat as a request proposer: backend resolves identity,
  business, permission, target, policy, and confirmation requirement before
  executing an existing application command. Record request, confirmation,
  outcome, and correlation ID in audit logs.
  - Commit: `feat: add audited AI configuration requests`
- Implement feature-request collection as structured provider work items, not
  automatic production changes. Add only the minimal provider-administration
  views needed to triage businesses, incidents, module availability, and
  requests.
  - Commit: `feat: add provider request triage foundation`
- Add prompt/tool abuse tests, authorization bypass tests, data-minimization
  review, rate limits, and human escalation paths before enabling AI actions.
  - Commit: `test: secure controlled AI actions`

## Critical automated-test matrix

- **Pure unit/property tests:** monetary rounding; the specified cost-based
  profit/Margin-% formulas and all four pricing edit modes (including cost
  changes preserving sale price); weighted quantities; promotion eligibility,
  tie-breaking and combinability; payment allocation; register expected
  balance; state transitions; permission decisions; and inventory projections.
- **Database integration tests:** transaction atomicity for sale settlement;
  idempotency under retries/concurrency; tenant/resource isolation; sale/refund
  inventory and cash effects; current-account debt/payment balances and movement
  history; immutable audit records; register close conflicts; and audit/outbox
  persistence. Run against PostgreSQL, not only mocks.
- **Synchronization integration tests:** duplicate events, reorder/retry,
  rejected commands, cursor resume, server/client schema versions, offline
  close recovery, and configuration conflicts. Prove no duplicate money or
  stock movement can result.
- **End-to-end tests:** permitted and denied login/business/register flows;
  high-speed POS sale with scanner/search/weight/promotion/split payment;
  cancel/refund; cash close; dashboard permissions; and offline/reconnect
  recovery. Use Playwright with controlled network loss.
- **Non-functional checks:** migration compatibility, backup restore, query
  plans/indexes for POS catalog and reporting, load tests for concurrent sales,
  accessibility/keyboard POS operation, and security/dependency scans.

## Highest-risk areas and required safeguards

| Risk | Safeguard and release gate |
| --- | --- |
| Duplicate or lost offline financial operations | Durable client outbox, idempotency keys, server result ledger, transactional settlement, reconnect/retry tests. |
| Money/quantity rounding defects | Written formulas/precision ADR, integer/fixed decimal policy, pure tests and review of every conversion. |
| Tenant or permission data leak | Mandatory business scope, service-level authorization, adversarial integration/E2E tests, audit trails. |
| Promotion conflicts or unprofitable sales | Pure deterministic evaluator, stable tie-breaker, policy checks, exhaustive/property-based tests. |
| Inventory/cash drift | Append-only ledgers, atomic compensating facts, projection reconciliation and closing discrepancy records. |
| Offline cache staleness | Scoped snapshots with versions, freshness UX, explicit configuration conflict policy, recovery artifacts. |
| POS latency under load | Indexed search, minimal settlement transaction, no synchronous PDF/provider work, measured cashier pilot. |
| Audit/telemetry privacy exposure | Redaction, minimal metadata, access controls, separate retention policies, legal review before production. |

## Dependency and scope review

- No sale settles before inventory and cash ledgers exist; no offline sale ships
  before online settlement is idempotent; no provider/fiscal integration blocks
  sale completion; and no AI action bypasses the same permissioned application
  commands used by the UI.
- Audit, tenant isolation, UUIDs, timestamps, outbox shape, and financial
  invariants are intentionally early because retrofitting them would threaten
  correctness and offline synchronization.
- The Core Operational MVP consists of the online operational core in Phases
  0-5, including the early local POS-data foundation but not full offline sync.
  Phase 6 is the extended offline-first capability, and Phase 7 is the
  commercial/production readiness gate for the selected release. Price lists,
  current-account credit, advanced promotions, documents/integrations, AI, and
  provider administration remain modular advanced work rather than reasons to
  delay the operational core.
