import { randomUUID } from "node:crypto";
import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

const CORRELATION_ID_HEADER = "x-correlation-id";

export interface RequestWithCorrelationId extends Request {
  correlationId: string;
}

/**
 * Every response carries a correlation ID (D-040), reused from the
 * caller's own header when present so a request can be traced across
 * services. This is request-tracing metadata, not a persisted entity
 * id, so it does not go through the domain IdGenerator (D-033).
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.header(CORRELATION_ID_HEADER);
    const correlationId = incoming && incoming.length > 0 ? incoming : randomUUID();
    (req as RequestWithCorrelationId).correlationId = correlationId;
    res.setHeader(CORRELATION_ID_HEADER, correlationId);
    next();
  }
}
