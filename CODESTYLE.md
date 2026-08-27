# CODESTYLE.md

## Purpose
Mandatory conventions for a production-ready, debuggable, maintainable modular monolith.

If a rule conflicts with `SPECS.md`, `ARCHITECTURE.md`, or an approved decision in `DECISIONS.md`, follow the more specific approved document.

## Language
- All source code, identifiers, types, APIs, database names, technical documentation, logs for developers, and commit messages must be in English.
- User-facing text may be localized; initial UI language may be Spanish.
- Do not mix Spanish and English identifiers.

## TypeScript
- Use strict TypeScript.
- Do not use `any`.
- Avoid unsafe type assertions.
- Prefer explicit domain types when meaning matters.
- Validate external input at boundaries.
- Do not represent authoritative money or weighted quantities with JavaScript floating-point values.
- Prefer guard clauses and small explicit functions.

## Architecture
- Preserve modular-monolith boundaries.
- Domain code must not depend on React, Next.js, NestJS, Prisma, browser APIs, or infrastructure.
- Application services orchestrate use cases.
- UI must not contain authoritative business rules.
- Do not introduce microservices, distributed event brokers, or a second ORM without an approved decision.
- Prefer explicit module-local services and transactions over generic repositories.

## Domain rules
- Treat money, quantities, timestamps, identifiers, tenancy, and state transitions as domain concerns.
- Completed sales, payments, inventory movements, cash movements, closures, refunds, cancellations, and audit facts are append-only.
- Corrections use explicit reversal, adjustment, cancellation, refund, or compensating records.
- Finalized commands must be idempotent where retries are possible.
- Every tenant-owned operation must have explicit business scope.
- Never trust frontend authorization.

## Money and quantities
- Follow `DECISIONS.md` for monetary representation and rounding.
- Centralize rounding rules.
- Quantity precision must be explicit by unit.
- Product pricing:
  - `profit = salePrice - costPrice`
  - `marginPercent = ((salePrice - costPrice) / costPrice) * 100`
- In this project, “Margin %” means profit relative to cost.
- Cost changes must not automatically increase customer sale price.

## Naming
- Use descriptive business-oriented names.
- Avoid vague names such as `data`, `utils`, `helper`, `manager`, `common`, or `misc`.
- Booleans should read as predicates.
- Commands use verbs; events/facts describe completed outcomes.

## Comments
- Do not comment obvious code.
- Comments may explain non-obvious business constraints, compatibility, concurrency, synchronization, performance, or invariants.
- Keep comments concise, technical, and current.

## Formatting and quality
Before every significant commit:
1. Format.
2. Lint.
3. Type check.
4. Run relevant tests.
5. Run relevant E2E coverage for critical UI changes.
6. Review the diff.

Use project-configured ESLint and Prettier.

## Errors and persistence
- Fail explicitly and do not swallow errors.
- Do not expose secrets or sensitive internals.
- Preserve correlation and operation IDs where available.
- Use transactions for multi-fact business operations.
- Avoid N+1 queries.
- Use reviewed parameterized SQL when Prisma is not the best fit.

## Testing
- Test business rules before UI details.
- Financial, inventory, promotion, permission, and synchronization logic require edge cases.
- Transaction, tenancy, and idempotency tests must use PostgreSQL where appropriate.
- Add regression tests for bugs when practical.

## Frontend
- Optimize POS for speed, keyboard use, readability, and predictable interaction.
- Keep business calculations out of components.
- Use TanStack Query for server state.
- Use focused local/Zustand state only for ephemeral POS state.
- Preserve visual separation between general navigation and the POS workspace.

## Offline
- Do not treat browser storage as a full database replica.
- Cache only explicitly required scoped operational data.
- Finalized offline operations must be durably persisted before success is shown.
- Retries must be duplicate-safe.
- Never overwrite completed financial facts during conflict handling.

## Security and privacy
- Never commit secrets.
- Validate external input.
- Apply least privilege.
- Redact sensitive logs and telemetry.
- Do not collect identifiable sales/customer data for product analytics without approved policy and legal review.

## Git
Use Conventional Commits:
- `feat: description`
- `fix: description`
- `docs: description`
- `test: description`
- `refactor: description`
- `chore: description`
- `perf: description`
- `build: description`
- `ci: description`

One significant checkpoint per commit. Format before committing.

## Documentation
Keep `README.md`, `ARCHITECTURE.md`, `DECISIONS.md`, `AGENT.md`, `AUDIT.md`, and `ROADMAP.md` consistent with implementation. Prefer targeted edits over unnecessary rewrites.

## Production-ready definition
Production-ready means explicit domain invariants, deterministic calculations, tenant isolation, backend authorization, transactional consistency, auditable facts, idempotent retries, meaningful tests, observability, documented recovery, and maintainable module boundaries. It does not mean premature infrastructure complexity.
