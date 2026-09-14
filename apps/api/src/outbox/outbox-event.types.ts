export interface RecordOutboxEventInput {
  businessId: string;
  eventType: string;
  targetType: string;
  targetId: string;
  payload: Record<string, unknown>;
  correlationId: string;
}
