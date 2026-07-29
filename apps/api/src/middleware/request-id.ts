import type { Request, Response, NextFunction } from "express";
import { nanoid } from "nanoid";

const REQUEST_ID_HEADER = "x-request-id";

/**
 * Assigns an inbound `x-request-id` to `req.id` and echoes it on the
 * response. If the inbound header is missing or shorter than 8 chars,
 * a new `nanoid(21)` is generated. The value is used by
 * `requestLoggerMiddleware` to correlate the per-request log line with
 * downstream service logs.
 */
export function requestIdMiddleware(
  req: Request & { id?: string },
  res: Response,
  next: NextFunction,
): void {
  const inbound = req.header(REQUEST_ID_HEADER);
  if (typeof inbound === "string" && inbound.length >= 8 && inbound.length <= 128) {
    req.id = inbound;
  } else {
    req.id = nanoid(21);
  }
  res.setHeader(REQUEST_ID_HEADER, req.id);
  next();
}
