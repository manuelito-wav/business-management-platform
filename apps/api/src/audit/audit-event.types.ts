export interface RecordAuditEventInput {
  businessId: string;
  actorUserId: string;
  /** Stable `<module>.<action>` code, mirroring D-038's permission naming, e.g. "membership.created". */
  action: string;
  targetType: string;
  targetId: string;
  /** Minimal, changed fields only (SPECS.md 23.2) -- never a full row snapshot. */
  before?: object;
  after?: object;
  correlationId: string;
}

export interface AuditEventSummary {
  id: string;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  beforeData: unknown;
  afterData: unknown;
  correlationId: string;
  createdAt: Date;
}

export interface AuditEventPage {
  data: AuditEventSummary[];
  pagination: { nextCursor: string | null };
}
