# SPECS.md

# Business Management, POS and Billing Platform

## 1. Product Overview

### 1.1 Purpose

Build a customizable business management platform focused initially on
medium-to-large, high-volume retail businesses such as kiosks and
convenience stores.

The product must function as a flexible foundation capable of supporting
different businesses with different operational requirements instead of
forcing every customer into the same standardized workflow.

The platform is intended to become both:

1.  A real commercial business management and POS product.
2.  A high-quality portfolio project demonstrating production-oriented
    software architecture.

### 1.2 Product Philosophy

The central product principle is:

> Many business management systems in one platform.

The platform must allow each business to enable, disable, configure, and
extend functionality according to its needs.

The system must avoid two extremes:

-   A rigid system with one fixed workflow for every business.
-   An unrestricted system with excessive configuration that overwhelms
    users.

The default experience should remain simple. Advanced functionality
should be enabled only when useful.

### 1.3 Initial Target Market

The initial reference business is a medium-to-large kiosk or
convenience-style store with:

-   High customer traffic.
-   Multiple employees.
-   One or more cash registers.
-   An owner who may not normally operate the POS.
-   Products such as groceries, beverages, alcohol, cigarettes, frozen
    products, deli products, and weighted products.

The architecture must remain extensible to other business types.

------------------------------------------------------------------------

# 2. Product Goals

## 2.1 Primary Goals

-   Fast daily operation.
-   Low number of interactions required to complete sales.
-   Clear and professional interface.
-   Strong customization capabilities.
-   Multi-business support.
-   Configurable users, roles, and permissions.
-   Reliable stock and cash management.
-   Offline-capable POS operation.
-   Automatic synchronization when connectivity returns.
-   Cloud-backed central data.
-   Strong auditability.
-   Modular architecture.
-   Ability to add client-specific functionality without destabilizing
    the core product.

## 2.2 Non-Goals for the Initial Version

The initial version should not attempt to:

-   Support every country and fiscal system.
-   Build a complete microservice architecture.
-   Build a complex SaaS billing platform.
-   Integrate every payment provider.
-   Support every printer model directly.
-   Build arbitrary third-party integrations.
-   Let an AI directly modify production code or database data without
    controlled backend actions.

------------------------------------------------------------------------

# 3. Users and Business Model

## 3.1 User Types

The system must support predefined roles and custom roles.

Initial conceptual roles:

### Employee

Typical capabilities:

-   Perform sales.
-   Search products.
-   Scan barcodes.
-   View product prices.
-   Access sales associated with authorized registers.
-   Perform authorized cash movements.
-   Use allowed payment methods.
-   Access permitted quick actions.

### Manager / Supervisor

Capabilities depend on assigned permissions and may include:

-   Stock operations.
-   Supplier-related tasks.
-   Cash supervision.
-   Promotions.
-   Accounts receivable/current accounts.
-   Selected reports.
-   Employee supervision.

### Administrator

Capabilities may include:

-   Business configuration.
-   User management.
-   Role management.
-   Permissions.
-   Registers.
-   Operational configuration.
-   Reports.

### Owner

Typically receives broad business visibility but must still be
permission-driven rather than relying only on a hard-coded role name.

## 3.2 Custom Roles

Businesses must be able to create roles such as:

-   Night supervisor.
-   Inventory manager.
-   Purchasing manager.
-   Supplier manager.

Roles are collections of granular permissions.

------------------------------------------------------------------------

# 4. Multi-Business Architecture

## 4.1 Business Isolation

The platform is multi-tenant.

Each business must have isolated access to:

-   Users.
-   Products.
-   Sales.
-   Cash registers.
-   Inventory.
-   Reports.
-   Configuration.
-   Customers.
-   Promotions.
-   Accounts.

Isolation must be enforced by backend architecture and authorization
rules, not only by hiding frontend UI.

## 4.2 Users in Multiple Businesses

A user may belong to multiple businesses.

Permissions may differ by business.

Example:

-   Business A: Administrator.
-   Business B: Employee.
-   Business C: Reports only.

The active business must be explicit in application context.

------------------------------------------------------------------------

# 5. Permissions and Security

## 5.1 Granular Permissions

Permissions should be grouped by domain.

Examples:

### Sales

-   Create sale.
-   Cancel sale.
-   Modify recent sale.
-   Apply discount.
-   Issue refund.
-   View sales history.

### Inventory

-   View inventory.
-   Modify inventory.
-   Register losses.
-   Perform adjustments.

### Finance

-   View costs.
-   View margins.
-   View profitability.
-   Perform cash movements.

### Administration

-   Manage users.
-   Manage roles.
-   Modify business configuration.

## 5.2 Backend Authorization

Frontend visibility is never sufficient for security.

Every sensitive backend operation must validate:

-   Authentication.
-   Active business context.
-   Membership.
-   Required permission.
-   Relevant business rules.

## 5.3 Authentication

Initial authentication must support:

-   Username or email.
-   Password.
-   Secure session management.
-   Refresh/session renewal strategy.
-   Password recovery.

Future-friendly options:

-   Quick PIN unlock for POS.
-   Device biometrics where supported.
-   Additional authentication factors.

## 5.4 Session Management

Users must be able to inspect authorized active sessions/devices.

Authorized users may terminate sessions remotely.

------------------------------------------------------------------------

# 6. POS and Sales Experience

## 6.1 POS Design Philosophy

The POS must prioritize:

1.  Speed.
2.  Readability.
3.  Minimal friction.

The visual reference is a compact, professional POS similar in
operational philosophy to modern commercial systems such as Cucina,
without copying another product.

The main visual direction:

-   White background.
-   Black text.
-   Professional, compact layout.
-   Avoid unnecessary decorative elements.
-   No prominent sidebar inside the primary POS workspace.
-   Dashboard and other main sections remain accessible from the general
    application navigation.

## 6.2 POS Layout

The sales screen must have two clearly differentiated areas.

### Left Section: Current Sale

Contains:

-   Products currently being sold.
-   Quantity controls.
-   Individual prices.
-   Discounts where applicable.
-   Total.
-   Promotions applied.
-   Relevant sale actions.

Promotions should appear in a separate area below or adjacent to the
product list, visually clear but compact.

Example:

`PROMO Coca-Cola 1.5L 2x1 -$1,000`

The promotion result should be visually emphasized.

### Right Section: Product Discovery

Contains:

1.  Quick search.
2.  Category/quick access panel.

The quick search must return matching products while typing.

It should support searching by:

-   Product name.
-   Barcode.
-   SKU.
-   Other configured identifiers.

The category/quick-access area should support selected visual product
groups.

Examples:

-   Offers.
-   Cigarettes.
-   Frozen products.
-   Deli products.
-   Quick products.

Not every product should require an image or visual tile.

The complete catalog remains available through search and list-based
results.

## 6.3 Product Images

Product images are optional.

They are especially useful for:

-   Quick products.
-   Category shortcuts.
-   Frequently sold products.
-   Products without barcodes.

The system should not require images for the full catalog.

## 6.4 Multiple Sale Tabs

The POS must support multiple concurrent sale tabs.

The behavior should resemble browser tabs.

Examples:

-   Customer A is being charged.
-   Customer B's sale remains open.
-   Employee switches between them.
-   Sales can be resumed quickly.

This is not merely a suspended-sale feature. Multiple active sales are a
first-class POS capability.

Each sale tab should maintain its own independent state until completed
or cancelled.

## 6.5 Sale Creation

A sale may be built using:

-   Barcode scanning.
-   Product search.
-   Category selection.
-   Quick products.
-   Weighted products.

## 6.6 Sale Completion

The primary POS action should be:

`Charge`

Opening a compact modal/dialog while keeping the underlying sale
visible.

The payment dialog should support:

-   Cash.
-   QR payment.
-   Card.
-   Transfer.
-   Other configurable methods.

The employee may split payment across multiple methods.

Example:

Total: \$10,000

-   Cash: \$4,000.
-   Card: \$6,000.

The sale can only complete when the required amount is satisfied
according to the payment rules.

------------------------------------------------------------------------

# 7. Products

## 7.1 Product Types

By default, a product is sold by unit.

During product creation, an authorized user may activate weighted
selling.

Examples:

-   Coca-Cola: Unit.
-   Packaged ham: Unit.
-   Deli ham: Weight.

## 7.2 Weighted Products

Weighted products must support configured units such as:

-   GR.
-   KG.

The architecture should allow future measurement units if needed.

## 7.3 Product Data

Recommended core fields:

Required or commonly used:

-   Name.
-   Product identifier.
-   Category.
-   Sale mode.
-   Cost.
-   Sale price.

Optional according to configuration:

-   Barcode.
-   SKU.
-   Image.
-   Minimum stock.
-   Expiration tracking.
-   Supplier relationships.
-   Additional price lists.

## 7.4 Price, Cost, Profit and Margin

The product pricing UI should expose four related values:

-   Cost.
-   Sale price.
-   Profit.
-   Margin.

Example:

-   Cost: \$3,000.
-   Sale: \$4,500.
-   Profit: \$1,500.
-   Margin: 50%.

Editing one value should intelligently update dependent values according
to the selected calculation mode.

Important distinction:

-   Profit is absolute monetary gain.
-   Margin percentage must have a precisely defined mathematical formula
    in implementation.

The specification and tests must clearly define formulas to avoid
ambiguity.

The system must allow:

-   Manual sale price.
-   Target absolute profit.
-   Target percentage margin.

## 7.5 Price Lists

The architecture must support multiple price types when required.

Examples:

-   Employee.
-   Retail.
-   Wholesale.

Price lists must be configurable rather than universally forced.

------------------------------------------------------------------------

# 8. Inventory

## 8.1 Inventory Tracking

Stock must automatically change through inventory movements rather than
relying only on a mutable quantity field.

Typical movements:

-   Sale.
-   Purchase/receiving.
-   Loss.
-   Damage.
-   Expiration.
-   Theft.
-   Manual adjustment.
-   Return where applicable.

A current stock value may be stored or calculated efficiently, but
movements must remain auditable.

## 8.2 Negative Stock

Negative stock is allowed.

Example:

A sale is performed while the expected stock is zero.

Result:

`Stock: -1`

This reflects an operational discrepancy rather than blocking the sale.

## 8.3 Stock Losses

The system must include a dedicated stock loss area.

Loss reasons should include configurable options such as:

-   Theft.
-   Damage.
-   Expiration.
-   Other.

Losses must create auditable inventory movements.

## 8.4 Expiration Tracking

Expiration tracking is:

> Disabled by default.

It can be enabled per business.

Not every product requires expiration tracking.

When enabled, products may support expiration-aware inventory
information.

The system should provide a configurable "near expiration" window.

Expiration alerts are warnings, not automatic proof that physical stock
still exists.

The system should allow employees to verify the physical situation
because inventory discrepancies may otherwise create false positives.

------------------------------------------------------------------------

# 9. Promotions

## 9.1 Promotion Types

Promotions must support:

-   Multiple products.
-   Multiple quantities.
-   Bundles.
-   Fixed prices.
-   Percentage discounts.
-   Other extensible rules.

Example:

`Fernet + Coca-Cola + Ice = $X`

Promotions may involve more than two products.

## 9.2 Promotion Sources

The system must support:

-   Built-in/common promotion templates.
-   User-created custom promotions.

## 9.3 Promotion Scheduling

Promotions may be:

-   Indefinite.
-   Active for a defined date range.
-   Configured according to future scheduling rules.

## 9.4 Automatic Detection

The POS must automatically detect eligible promotions.

If multiple promotions overlap, the system should select the most
beneficial eligible promotion for the customer by default.

## 9.5 Promotion Conflicts

Promotions exclude one another by default unless explicitly configured
to be combinable.

The promotion engine must be deterministic and heavily tested.

## 9.6 Manual Promotion Access

Employees may have an "Offers" category containing currently active
promotions.

If manually selected products later make a better promotion eligible,
the system should:

-   Recalculate eligibility.
-   Apply the better allowed promotion automatically according to
    configured policy.
-   Inform the cashier where relevant.

The exact UX must avoid requiring unnecessary confirmation during fast
sales while still making changes understandable.

## 9.7 Price Changes Affecting Promotions

When a product involved in a promotion changes price or cost, the system
should warn authorized users when profitability changes.

Example warning:

> This change affects the profitability of active promotions.

The user can then review whether the promotion should remain active.

## 9.8 Negative or Zero Profitability

When a promotion or discount results in no positive profit, the system
should provide a warning.

The business may configure whether such sales are:

-   Allowed with warning.
-   Restricted by permission.
-   Prohibited.

------------------------------------------------------------------------

# 10. Payments

## 10.1 Default Payment Methods

Default enabled methods:

-   Cash.
-   QR.
-   Card.
-   Transfer.

Businesses may enable or disable methods.

## 10.2 Split Payments

Multiple payment methods may be combined within a sale.

## 10.3 Payment Verification

Initially, QR and transfer payments are manually verified by the
employee.

Future integrations may support automatic verification.

The architecture must allow payment providers to be added later without
changing core sale logic.

------------------------------------------------------------------------

# 11. Cash Registers

## 11.1 Register Ownership

Cash registers belong to the business, not permanently to a user.

A user operates a selected register during an operational session.

## 11.2 Register Selection

Employees manually select the register they will operate, subject to
authorization.

## 11.3 Multiple Users and Register Conflicts

The system must support business-specific workflows where multiple users
may interact with the same register.

When one user attempts to close a register currently being used by
another:

1.  Show a warning.
2.  Allow authorized continuation according to policy.
3.  Notify the affected user.
4.  Require the affected user to reopen or reestablish the operational
    context before continuing.

The system should not unnecessarily block real-world operation.

## 11.4 Cash Movements

Core movement types:

-   Cash withdrawal.
-   Cash deposit.
-   Supplier payment.
-   Expense.
-   Opening/change fund.
-   Sale settlement (cash-in from a completed cash payment).
-   Refund reversal (cash-out from an approved refund).

## 11.5 Movement Data

A cash movement should include:

-   Amount: required, including \$0 where intentionally permitted.
-   Reason/category.
-   User: automatically assigned from authenticated context.
-   Date/time: automatic.
-   Register: selected from authorized available registers.
-   Notes: optional.

## 11.6 Opening and Closing

Opening and closing behavior should support configurable business
workflows.

A closing record should support:

-   User.
-   Date/time.
-   Shift if applicable.
-   Expected amounts.
-   Actual counted amounts where used.
-   Differences.
-   Observations.

Differences should be recorded rather than silently discarded.

Management can investigate discrepancies later.

------------------------------------------------------------------------

# 12. Sales History, Cancellation, Modification and Refunds

## 12.1 History

Users may access sales according to permission and register/business
scope.

## 12.2 Cancelled or Modified Sales

The system should preserve an audit trail for:

-   Cancellation.
-   Modification.
-   Refund.

The original transaction should not simply disappear.

## 12.3 Recent Sale Actions

A configurable recent-sale action may support undoing or modifying the
previous sale within an appropriate short period and permission scope.

## 12.4 Refunds Without Original Sale

The system should support refunds/returns without requiring a directly
associated original sale.

This supports situations such as:

-   Customer returns hours later.
-   Different employee.
-   Different register.
-   Product was defective or expired.

The business must control refund policy.

A return may result in:

-   Replacement.
-   Refund.
-   Stock loss registration.
-   Other configured operational outcomes.

For same-product replacement, unnecessary duplication should be avoided.
The returned defective/expired item can be handled through the stock
loss process when appropriate.

An undamaged, resellable returned product uses the Return inventory movement
(§8.1), restoring stock to sellable inventory. A defective, expired, or
damaged returned product uses the stock loss process instead, and its stock
is not restored to sellable inventory.

## 12.5 Reasons

Reason requirements must be permission- and business-policy-aware.

Example:

-   Manager may cancel without mandatory detailed reason.
-   Employee may be required to select a reason.

------------------------------------------------------------------------

# 13. Customers and Current Accounts

## 13.1 Customers

Customer records should support:

-   Identification data where needed.
-   Purchase history.
-   Current account.

## 13.2 Current Accounts

Current accounts are optional.

A business may use them for:

-   Customers.
-   Employees.
-   Internal staff.

The feature should be configurable because some businesses do not allow
customer credit at all.

## 13.3 New Customer Credit

Allowing credit to new customers must be configurable.

Businesses may choose:

-   Disabled.
-   Managers only.
-   Employees with permission.
-   Other policies.

------------------------------------------------------------------------

# 14. Reports and Analytics

## 14.1 Principles

Reports must be useful without overwhelming users.

The system should allow dashboards and reports to be configurable.

## 14.2 Core Reports

Examples:

-   Daily sales.
-   Monthly sales.
-   Revenue.
-   Payment method distribution.
-   Product performance.
-   Employee performance.
-   Inventory information.
-   Cash discrepancies.
-   Profitability.

## 14.3 Time Analysis

Reports should support:

-   Specific day.
-   Day of week.
-   Month.
-   Date range.
-   Month-over-month comparison.

Example:

> Average Saturday sales during August.

Example:

> Which month had the highest sales in the last year?

## 14.4 Ticket Time

Track average ticket duration.

The initial measurement concept:

-   First product added to a sale.
-   Payment completion.

Reports may calculate average sale processing time.

The implementation must account for abandoned/inactive tabs and avoid
misleading averages.

## 14.5 Scheduled Reports

Optional scheduled reports should be supported.

Example:

> Send weekly report every Monday.

Delivery channels can be introduced progressively.

------------------------------------------------------------------------

# 15. Dashboard and Navigation

## 15.1 Main Areas

Core application areas include:

-   Dashboard.
-   Sales.
-   Products.
-   Inventory.
-   Customers.
-   Promotions.
-   Cash.
-   Reports.
-   Configuration.

Actual visibility depends on permissions and enabled modules.

## 15.2 Employee Flow

Typical employee flow:

`Login → Select Register → Sell → Perform authorized tasks → Close register/session`

## 15.3 Dashboard

The initial dashboard should provide relevant summary information
without overwhelming users.

Examples:

-   Sales summary.
-   Operational alerts.
-   Quick actions.
-   Relevant register status.

After login, users should generally land on the dashboard.

------------------------------------------------------------------------

# 16. Offline-First Operation

## 16.1 Requirement

The POS must remain operational during temporary internet outages.

A web application can support offline operation through PWA technologies
and local storage.

## 16.2 Local Data

The device should maintain the operational data needed for continued
use.

Examples:

-   Relevant products.
-   Categories.
-   Prices.
-   Active configuration.
-   Current operational state.
-   Pending operations.

The device does not necessarily need a complete copy of every central
database record.

## 16.3 Important Operation Persistence

The system should persist meaningful completed operations rather than
continuously creating expensive backups for every product added during
an in-progress sale.

Important operations include:

-   Completed sale.
-   Stock movement.
-   Cash movement.
-   Supplier payment.
-   Other finalized business operations.

For a sale in progress, persistence may occur at strategically important
points, especially before/around payment, without requiring a full
backup for every scanned item.

Loss of an incomplete sale due to power loss is acceptable compared with
losing completed financial or inventory operations.

## 16.4 Local Backup

If synchronization cannot occur during important events such as register
closing, the application should create a local backup/exportable
recovery artifact when appropriate.

After successful synchronization, temporary recovery artifacts may be
removed automatically according to the implemented reliability policy.

## 16.5 Synchronization

Synchronization must occur automatically when connectivity returns.

------------------------------------------------------------------------

# 17. Synchronization Architecture

## 17.1 Event-Based Synchronization

The system should synchronize operations/events rather than repeatedly
replacing complete entity states.

Example conceptual event:

`SALE_COMPLETED`

With globally unique identifier, business context, timestamps, and
required payload.

## 17.2 UUIDs

Important entities must use globally unique identifiers suitable for
offline creation.

Examples:

-   Sales.
-   Payments.
-   Inventory movements.
-   Products.
-   Events.

## 17.3 Conflict Handling

Conflict strategy depends on entity type.

### Financial Operations

Completed financial operations should not be overwritten by unrelated
state changes.

### Inventory

Stock should be based on movements and reconciliation rules.

### Configuration

Conflicts may require controlled policies rather than universally using
"last write wins".

## 17.4 Local Time

Local operation timestamps may be stored for operational ordering and
audit context.

The server must also record synchronization/receipt time.

Time semantics must be explicit to avoid ambiguity.

------------------------------------------------------------------------

# 18. Receipts and Fiscal Documents

## 18.1 Sales and Documents Are Separate Concepts

A completed sale does not necessarily require immediate document
issuance.

Conceptually:

`Sale → Optional receipt/fiscal document(s)`

## 18.2 Default Behavior

Default:

> Do not automatically issue a document.

The business may configure:

-   No issuance.
-   Manual issuance.
-   Automatic issuance.
-   Future custom policies.

## 18.3 Manual Issuance

Where applicable, authorized users may issue a document later from sales
history.

## 18.4 Offline Document Handling

If electronic document issuance is required but unavailable due to
connectivity:

-   Complete the sale if allowed.
-   Mark document issuance as pending.
-   Retry when connectivity returns.
-   Record success or failure.

## 18.5 Printing

Automatic printing is disabled by default.

Businesses may enable automatic printing.

Printing failure must not block:

-   Payment.
-   Sale completion.
-   Core operational flow.

The user may retry printing.

## 18.6 PDF

The system must support generating printable PDF documents where
relevant.

## 18.7 Reprinting

Reprinting must not create:

-   A new sale.
-   New stock movements.
-   New payments.

------------------------------------------------------------------------

# 19. Customization and Feature Modules

## 19.1 Configurable Features

Businesses may enable or disable features according to their needs.

Examples:

-   Expiration tracking.
-   Current accounts.
-   Payment methods.
-   Price lists.
-   Scheduled reports.

## 19.2 Custom Business Requirements

New requirements may be:

### A. Existing Module Configuration

Example:

Enable a feature already implemented.

### B. New Module

A reusable feature useful for multiple businesses.

### C. Client-Specific Customization

A feature useful primarily for one customer.

The implementation decision should consider:

-   Reusability.
-   Maintenance cost.
-   Complexity.
-   Commercial value.

## 19.3 Modular Product Design

Client-specific requirements must not contaminate unrelated business
workflows.

Optional functionality should be isolated behind clear module boundaries
or feature configuration.

------------------------------------------------------------------------

# 20. AI Assistant

## 20.1 Purpose

Authorized managers or owners may communicate requirements through an AI
chat interface.

The assistant may help:

-   Explain functionality.
-   Modify allowed configuration.
-   Enable/disable modules.
-   Collect requirements for new features.
-   Generate structured requests.

## 20.2 Controlled Actions

The AI must never receive unrestricted database access.

The flow is:

`User → AI → Allowed structured action → Backend validation → Execution`

Example:

User:

> Remove Juan's access to product costs.

AI requests a structured permission operation.

Backend validates:

-   User identity.
-   Business.
-   Permission.
-   Target.
-   Business rules.

Sensitive actions should require confirmation where appropriate.

## 20.3 New Feature Requests

The AI may collect and structure requirements.

If a request cannot be resolved through existing configuration:

`User → AI requirement collection → Structured request → Provider administration`

The system should not automatically modify production source code.

------------------------------------------------------------------------

# 21. Provider Administration

A provider-only administration area may eventually support:

-   Business management.
-   Feature requests.
-   Module availability.
-   Version management.
-   Technical incidents.
-   Product telemetry.

This is not required to become a massive initial back-office system but
should be architecturally anticipated.

------------------------------------------------------------------------

# 22. Telemetry and Product Improvement

## 22.1 Purpose

Collect minimal, aggregated technical and product-usage information to
improve:

-   Features.
-   UX.
-   Performance.
-   Reliability.
-   Frequently requested functionality.

## 22.2 Preferred Data

Examples:

-   Feature usage frequency.
-   Error categories.
-   Performance measurements.
-   Application version.
-   General operational patterns.

## 22.3 Avoid by Default

Do not unnecessarily collect:

-   Customer names.
-   Individual business sales.
-   Specific products.
-   Identifiable financial information.

Telemetry must be separated conceptually from ordinary business data.

------------------------------------------------------------------------

# 23. Audit Logs and Data Retention

## 23.1 Audited Actions

Important actions should be logged.

Examples:

-   Price changes.
-   Stock adjustments.
-   Permission changes.
-   Configuration changes.
-   Sale cancellation.
-   Refunds.
-   Cash movements.
-   AI-executed configuration actions.

## 23.2 Efficient Audit Storage

Audit data must:

-   Be stored separately from core operational tables where appropriate.
-   Be indexed for common queries.
-   Avoid storing unnecessarily large object copies.
-   Support archival.

## 23.3 Long-Term Growth

Large historical audit data should not be loaded during normal POS
operations.

Strategies may include:

-   Separate audit tables.
-   Indexes.
-   Archival.
-   Configurable retention.
-   Historical storage tiers.

Critical records should generally be archived rather than simply deleted
when legal and business requirements permit.

------------------------------------------------------------------------

# 24. Data Deletion

Critical business operations should generally be represented by state
transitions rather than destructive deletion.

Example:

`Sale → Cancelled`

rather than physically deleting the sale.

The system must preserve relevant audit context.

Less critical configuration data may use controlled deletion where
appropriate.

------------------------------------------------------------------------

# 25. Legal and Privacy Requirements

Before commercial production use, the product should have at minimum:

-   Terms and Conditions.
-   Privacy Policy.

These should explain:

-   Service scope.
-   Data handling.
-   Responsibilities.
-   Availability expectations.
-   Customization.
-   Maintenance.
-   Payments where applicable.
-   Telemetry.
-   Privacy practices.

Because the initial market is Argentina, production legal documents and
data handling must be reviewed by qualified legal professionals familiar
with applicable Argentine requirements and the actual deployment model.

The product should not claim legal or fiscal compliance merely because a
technical feature exists.

------------------------------------------------------------------------

# 26. Recommended Technical Architecture

## 26.1 Frontend

Recommended:

-   React.
-   TypeScript.
-   Next.js.

## 26.2 Backend

Recommended:

-   TypeScript.
-   NestJS.

## 26.3 Database

Recommended:

-   PostgreSQL.

## 26.4 Offline Storage

Recommended browser technology:

-   IndexedDB.

## 26.5 Application Delivery

Recommended:

-   Progressive Web Application.

The application should work primarily on PCs for POS operation and
provide responsive access from mobile devices for reports and useful
administrative information.

## 26.6 API

Initial API style:

-   REST.

## 26.7 Architecture

Recommended:

> Modular monolith.

Do not introduce microservices prematurely.

Conceptual modules:

-   authentication
-   businesses
-   users
-   permissions
-   products
-   inventory
-   sales
-   payments
-   cash
-   promotions
-   customers
-   current accounts
-   reports
-   notifications
-   fiscal documents
-   synchronization
-   AI
-   audit

## 26.8 File Storage

Large binary files should not be stored directly in PostgreSQL when
avoidable.

Use object storage for:

-   PDFs.
-   Images.
-   Backups.
-   Other files.

Store references and metadata in the relational database.

------------------------------------------------------------------------

# 27. Background Jobs

Operations that do not need to block the POS should execute
asynchronously.

Examples:

-   PDF generation.
-   Email delivery.
-   Electronic document issuance.
-   Scheduled reports.
-   Retry operations.
-   Some synchronization tasks.

Core sale completion must remain fast.

------------------------------------------------------------------------

# 28. Notifications

The notification architecture should support:

-   Operational notifications.
-   Administrative notifications.
-   Technical notifications.
-   Future recommendations.

Examples:

-   Low stock.
-   Register discrepancy.
-   Pending synchronization.
-   Pending fiscal document.

------------------------------------------------------------------------

# 29. Observability

The production system should support:

-   Structured logs.
-   Error tracking.
-   Basic metrics.
-   Availability monitoring.

Logs must avoid exposing unnecessary sensitive business data.

The system should make it possible to identify:

-   When a failure happened.
-   Which module failed.
-   Which application version was running.

------------------------------------------------------------------------

# 30. Testing Strategy

## 30.1 Unit Tests

Prioritize deterministic business logic such as:

-   Price calculations.
-   Profit calculations.
-   Margin calculations.
-   Promotion eligibility.
-   Promotion conflict resolution.
-   Permission checks.
-   Inventory calculations.

## 30.2 Integration Tests

Test critical module interactions:

-   Sale and stock.
-   Sale and payment.
-   Cash movements.
-   Synchronization.
-   Authorization.

## 30.3 End-to-End Tests

Protect critical workflows such as:

`Login → Select register → Add products → Apply promotion → Charge → Complete sale`

Testing should prioritize correctness of money, stock, synchronization,
and permissions rather than chasing meaningless coverage percentages.

------------------------------------------------------------------------

# 31. Code Quality Requirements

The implementation must follow these principles:

-   Strict TypeScript.
-   Consistent formatting.
-   Automated linting.
-   Reusable abstractions where justified.
-   Clear module boundaries.
-   Minimal unnecessary comments.
-   Technical comments only when they provide value.
-   Production-oriented structure.
-   No unnecessary duplication.
-   Avoid overengineering.
-   Format code before significant commits.

The detailed rules will be formalized in `CODESTYLE.md`.

------------------------------------------------------------------------

# 32. Version Control

Use conventional commits.

Format:

`prefix: description`

Examples:

-   `feat: add multi-tab POS sales`
-   `fix: prevent duplicate offline synchronization`
-   `refactor: simplify promotion calculation`
-   `test: add promotion conflict tests`
-   `docs: update architecture specification`

A commit must be created after each significant checkpoint.

Do not create a single final commit containing unrelated work.

------------------------------------------------------------------------

# 33. Environments

Recommended environments:

-   Development.
-   Staging.
-   Production.

Staging may initially be lightweight but should be anticipated.

------------------------------------------------------------------------

# 34. Deployment Principles

Prefer managed infrastructure during the initial stages.

Do not require manual server administration unless justified.

The deployment architecture should conceptually support:

-   Frontend.
-   Backend.
-   Database.
-   Object storage.
-   Monitoring/observability.

The exact cloud provider is intentionally not fixed in this
specification.

------------------------------------------------------------------------

# 35. Development Priorities

The roadmap should generally prioritize the following sequence.

## Phase 1: Foundation

-   Repository setup.
-   Code standards.
-   Authentication.
-   Businesses.
-   Users.
-   Permissions.

## Phase 2: Core POS

-   Registers.
-   Products.
-   Categories.
-   Pricing.
-   Sales.
-   Multi-tab sales.
-   Payments.

## Phase 3: Inventory

-   Inventory movements.
-   Stock.
-   Negative stock.
-   Losses.
-   Optional expiration tracking.

## Phase 4: Business Features

-   Promotions.
-   Customers.
-   Current accounts.
-   Refunds/cancellations.
-   Cash operations.

## Phase 5: Reports

-   Dashboard.
-   Core reports.
-   Time analysis.
-   Scheduled reports.

## Phase 6: Offline and Synchronization

-   PWA.
-   IndexedDB.
-   Operation queue.
-   Event synchronization.
-   Conflict handling.
-   Recovery behavior.

## Phase 7: Documents and Integrations

-   PDFs.
-   Manual document issuance.
-   Printing.
-   Future fiscal integration boundaries.
-   Payment provider boundaries.

## Phase 8: Platform Features

-   Notifications.
-   Audit.
-   Telemetry.
-   Observability.
-   AI assistant.
-   Provider administration foundations.

The code agent responsible for `ROADMAP.md` may reorganize these phases
into smaller implementation checkpoints based on dependencies.

------------------------------------------------------------------------

# 36. MVP Definition

The MVP should prioritize a reliable, usable POS and business management
core.

The MVP should include, at minimum:

-   Multi-business support.
-   Authentication.
-   Users.
-   Roles and permissions.
-   Products.
-   Categories.
-   Unit and weighted products.
-   Cost and sale pricing.
-   Sales.
-   Multiple active sale tabs.
-   Configurable payment methods.
-   Split payments.
-   Registers.
-   Core cash movements.
-   Inventory movements.
-   Negative stock.
-   Stock losses.
-   Basic promotions.
-   Sales history.
-   Audit foundations.
-   Core reports/dashboard.

Offline functionality should be implemented carefully according to
roadmap dependencies because it affects the architecture of core
operations.

------------------------------------------------------------------------

# 37. Future Priorities

High-priority future capabilities include:

-   Advanced promotions.
-   Full offline synchronization.
-   Automated payment verification.
-   Fiscal integrations.
-   AI configuration assistant.
-   Client feature request workflow.
-   Advanced analytics.
-   Scheduled reporting.
-   Provider administration.
-   Reusable integrations.

------------------------------------------------------------------------

# 38. Final Product Principles

The finished product should be:

-   Fast.
-   Reliable.
-   Professional.
-   Visually clear.
-   Suitable for high-volume daily operation.
-   Flexible without becoming overwhelming.
-   Modular.
-   Offline-capable.
-   Secure.
-   Auditable.
-   Prepared for client-specific customization.

The system must prioritize real business operation over visual novelty.

When tradeoffs arise, prioritize:

1.  Data correctness.
2.  Financial correctness.
3.  Operational speed.
4.  Reliability.
5.  Clarity.
6.  Extensibility.
7.  Visual polish.

A feature should not be added merely because it is technically possible.
It should justify its complexity through business or operational value.

------------------------------------------------------------------------

# 39. Instructions for the Roadmap Agent

Read this entire specification before proposing implementation work.

Create a `ROADMAP.md` containing:

-   Ordered implementation phases.
-   Small, concrete bullet-point checkpoints.
-   Explicit dependencies.
-   Recommended technology selections where this specification
    intentionally leaves library choices open.
-   Testing requirements for critical logic.
-   Checkpoints suitable for independent conventional commits.

Do not remove or reinterpret confirmed business rules without
documenting the conflict.

When requirements are ambiguous:

1.  Prefer data correctness.
2.  Prefer explicit configuration.
3.  Prefer preserving auditability.
4.  Prefer simple implementation over premature abstraction.
5.  Preserve the ability to evolve the product.

The roadmap must be implementation-oriented, not a repetition of this
specification.
