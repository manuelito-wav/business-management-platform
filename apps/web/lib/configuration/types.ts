// Deliberately partial -- only the fields the frontend currently reads.
// apps/api's configuration module remains the single source of truth for
// each section's full shape (same convention as lib/pos-cache/types.ts's
// Remote* shapes).
export interface BusinessConfiguration {
  businessTimezone: string;
  registerPolicy: { requireOpeningAmount: boolean };
  quickProducts: { productIds: string[] };
}
