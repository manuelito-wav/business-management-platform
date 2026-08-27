# Business Management and POS Platform

A modular, configurable business management system focused initially on medium and high-volume kiosks and similar retail businesses.

The platform combines POS operations, inventory, cash management, promotions, reports, configurable permissions, optional modules, offline-capable workflows, and controlled AI-assisted configuration.

## Product vision
One technical platform, many business-specific configurations and optional modules.

The initial reference business is a medium/large kiosk with multiple employees, one or more registers, high transaction volume, barcode and non-barcode products, unit and weighted products, and rapid cashier workflows.

## Core capabilities
### POS
Two clear workspaces:
- Left: current sale, products, quantities, totals, promotions.
- Right: fast search, categories, quick products, optional visual shortcuts.

Supports barcode scanning, search by name/SKU/barcode, categories, quick products, multiple sale tabs, weighted products, automatic promotions, offers, and split payments.

Payment is initiated with `Charge/Cobrar` and handled in a focused overlay while the sale remains visible behind it.

Initial payment methods: cash, QR, card, and bank transfer, all enabled by default. Businesses can configure which are enabled afterward.

### Products and pricing
Products support categories, identifiers, optional images, unit sale by default, optional weighted sale, GR/KG, cost, sale price, profit, and Margin %.

`profit = salePrice - costPrice`

`marginPercent = ((salePrice - costPrice) / costPrice) * 100`

Examples:
- Cost $50, sale $100 → profit $50 → Margin % 100.
- Cost $50, sale $75 → profit $25 → Margin % 50.

### Inventory
Inventory uses an auditable movement ledger with receiving, adjustments, negative-stock warnings, minimum-stock alerts, theft, damage, and expiration losses.

Expiration tracking is optional and disabled by default. Alerts never automatically remove stock.

### Registers and cash
Registers belong to the business, not permanently to a user.

Authorized users can select registers, open sessions, record opening funds, deposits, withdrawals, supplier payments, expenses, close registers, compare expected/counting amounts, and record discrepancies.

### Promotions
Promotions may involve multiple products and quantities. They can support 2x1, fixed-price bundles, percentage discounts, and combinations such as Fernet + Coca-Cola + ice.

Promotions exclude each other by default unless explicitly combinable. The system chooses the best permitted result for the customer deterministically.

### Sales history and refunds
Completed facts are not silently edited away. Corrections use cancellation, reversal, refund, adjustment, and compensating effects.

Refunds may support workflows without an associated original sale according to policy and permissions.

### Current accounts
Optional current accounts may be enabled for customers, employees, or internal staff.

### Dashboard and reports
Dashboard: current-day sales, payment totals, urgent alerts, stock alerts, register status, and discrepancies.

Reports: period, employee, category, product performance, profitability, inventory/cash discrepancies, comparisons, day-of-week analysis, and average ticket duration.

### Offline-capable operation
The application is a PWA. It does not replicate the entire server database. It stores scoped operational snapshots, local drafts, finalized-operation outbox data, and synchronization metadata.

Finalized operations must be durable and idempotently synchronized.

### AI-assisted configuration
AI can explain, propose configuration changes, toggle approved modules, request controlled changes, and collect structured feature requests.

It cannot execute arbitrary SQL, modify source code, bypass authorization, or gain unrestricted API access.

## Intended technology
- Next.js + React + strict TypeScript
- NestJS REST API
- PostgreSQL
- Prisma with reviewed SQL where appropriate
- pnpm workspaces + Turborepo
- Tailwind CSS + Radix/shadcn-compatible components
- TanStack Query
- Zustand for focused POS state
- Zod
- Workbox + Dexie
- Redis + BullMQ when background jobs require them
- S3-compatible storage when files/images/PDFs require it
- Vitest, Testcontainers, Playwright, OpenAPI
- structured logging, error tracking, OpenTelemetry during hardening

## Repository shape
```text
apps/
  web/
  api/
packages/
  domain/
  contracts/
  ui/
  config/
docs/
```

## Development stages
1. Foundation.
2. Identity, tenancy, authorization, configuration.
3. Catalog, pricing, registers, local POS data.
4. Inventory.
5. Core POS and payments.
6. Promotions, dashboard, reports.
7. Offline synchronization.
8. Production hardening.
9. Advanced optional modules.
10. Controlled AI.

See `ROADMAP.md` for the detailed sequence.

## Mandatory documents
Before implementation, read:
1. `SPECS.md`
2. `README.md`
3. `CODESTYLE.md`
4. `ROADMAP.md`
5. `ARCHITECTURE.md`
6. `DECISIONS.md`
7. `AGENT.md`
8. `AUDIT.md`
