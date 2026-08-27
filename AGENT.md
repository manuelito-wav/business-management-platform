# AGENT.md

## Mission
You are the implementation agent. Complete the project safely, incrementally, and with production-quality reasoning.

Do not rewrite the entire repository in one uncontrolled change.

## Mandatory reading order
Before modifying code, read:
1. `SPECS.md`
2. `README.md`
3. `CODESTYLE.md`
4. `ARCHITECTURE.md`
5. `DECISIONS.md`
6. `ROADMAP.md`
7. `AUDIT.md`

## Workflow
For each work session:
1. Inspect repository status and current branch.
2. Read the next incomplete roadmap checkpoint.
3. Identify relevant architecture and decisions.
4. Inspect existing implementation.
5. Implement one coherent checkpoint unless a directly required prerequisite is missing.
6. Add/update tests.
7. Format.
8. Lint.
9. Type check.
10. Run relevant tests.
11. Review the diff.
12. Self-audit using `AUDIT.md`.
13. Fix real findings.
14. Commit using Conventional Commits.

## Scope discipline
Do not:
- rewrite working code unnecessarily,
- redesign completed modules without evidence,
- introduce microservices,
- introduce a distributed event broker,
- introduce a second ORM,
- add speculative infrastructure,
- create arbitrary generic abstractions,
- silently change approved domain rules.

If specifications conflict, stop, identify the conflict, propose the smallest resolution, and do not silently invent a new rule.

## Priorities
1. Tenant isolation.
2. Authorization.
3. Money/quantity correctness.
4. Transaction atomicity.
5. Append-only history.
6. Idempotency.
7. Inventory/cash consistency.
8. Synchronization correctness.
9. Performance.
10. UI polish.

## Roadmap rule
A checkpoint is complete only when implementation, relevant tests, and quality checks support the claim. Do not mark items complete merely because code exists.

Update `ROADMAP.md` minimally; do not rewrite it cosmetically.

## Testing
- Financial calculations → deterministic unit tests.
- Transactions/idempotency → PostgreSQL integration tests.
- Permissions → integration/E2E coverage.
- Critical POS workflows → Playwright.
- Offline sync → controlled duplicate/retry/network-loss scenarios.

## Commit rule
One significant checkpoint per Conventional Commit.

Before commit:
```text
format
lint
typecheck
relevant tests
diff review
targeted self-audit
```

Never commit secrets.

## Self-audit questions
- Does this violate `DECISIONS.md`?
- Does this cross module boundaries incorrectly?
- Can another tenant access this data?
- Can frontend bypass authorization?
- Can retries duplicate money or stock?
- Is completed history being mutated?
- Are rounding and precision deterministic?
- Can failure leave a partial transaction?
- Does offline behavior report success before durable persistence?
- Did this introduce unnecessary complexity?
- Are tests checking behavior?

## When blocked
Do not invent provider, legal, credential, or product facts. Isolate the dependency and implement only safe surrounding boundaries where useful.

## Definition of good work
Good work means the next roadmap checkpoint is genuinely complete, reviewable, tested, consistent with invariants, and committed as a coherent change.
