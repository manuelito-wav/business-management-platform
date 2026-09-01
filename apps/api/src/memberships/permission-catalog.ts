export interface PermissionDefinition {
  code: string;
  module: string;
  action: string;
  description: string;
}

/**
 * Seed set of the `<module>.<action>` permission catalog (D-038). This is
 * not the final exhaustive catalog -- DECISIONS.md "Pending decisions"
 * tracks the full per-module catalog as a separate, still-open item that
 * blocks the future authorization-guards enforcement checkpoint, not this
 * one. New codes are added here as each module is implemented.
 */
export const PERMISSION_CATALOG: readonly PermissionDefinition[] = [
  { code: "sales.create", module: "sales", action: "create", description: "Create a sale." },
  { code: "sales.cancel", module: "sales", action: "cancel", description: "Cancel a sale." },
  {
    code: "sales.discount",
    module: "sales",
    action: "discount",
    description: "Apply a discount to a sale.",
  },
  { code: "sales.refund", module: "sales", action: "refund", description: "Issue a refund." },
  {
    code: "inventory.adjust",
    module: "inventory",
    action: "adjust",
    description: "Perform an inventory adjustment.",
  },
  {
    code: "inventory.record_loss",
    module: "inventory",
    action: "record_loss",
    description: "Register an inventory loss.",
  },
  {
    code: "register.close",
    module: "register",
    action: "close",
    description: "Close a cash register.",
  },
  {
    code: "register.override_close_conflict",
    module: "register",
    action: "override_close_conflict",
    description: "Force-close another user's active register despite a conflict.",
  },
  {
    code: "reports.view",
    module: "reports",
    action: "view",
    description: "View business reports.",
  },
  {
    code: "configuration.manage",
    module: "configuration",
    action: "manage",
    description: "Modify business configuration.",
  },
  {
    code: "users.manage",
    module: "users",
    action: "manage",
    description: "Add, remove, or change the role of business members.",
  },
  {
    code: "roles.manage",
    module: "roles",
    action: "manage",
    description: "Create and manage custom roles.",
  },
];

export interface PredefinedRoleDefinition {
  name: string;
  permissionCodes: readonly string[];
}

/**
 * Predefined ("system") roles seeded automatically for every new business
 * (SPECS.md 3.1). A role name grants nothing by itself -- these are just
 * an initial set of RolePermission rows; authorization always evaluates
 * the permission set, never the role name (D-038). Owner intentionally
 * gets the entire current catalog rather than being special-cased in
 * code, per SPECS.md 3.1: "must still be permission-driven rather than
 * relying only on a hard-coded role name."
 */
export const PREDEFINED_ROLES: readonly PredefinedRoleDefinition[] = [
  { name: "Owner", permissionCodes: PERMISSION_CATALOG.map((permission) => permission.code) },
  {
    name: "Administrator",
    permissionCodes: [
      "configuration.manage",
      "users.manage",
      "roles.manage",
      "reports.view",
      "register.override_close_conflict",
    ],
  },
  {
    name: "Manager",
    permissionCodes: [
      "inventory.adjust",
      "inventory.record_loss",
      "register.close",
      "reports.view",
      "sales.cancel",
      "sales.discount",
      "sales.refund",
    ],
  },
  { name: "Employee", permissionCodes: ["sales.create"] },
];
