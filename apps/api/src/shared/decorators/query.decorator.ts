import { Query } from "@nestjs/common";
import type { z } from "zod";

import { ZodValidationPipe } from "../pipes/zod-validation.pipe.js";

/**
 * `@QuerySchema(<schema>)` parameter decorator (slice 5 PR #3 — T5.11).
 *
 * Pairs NestJS's `@Query()` parameter decorator with the canonical
 * `ZodValidationPipe` so a controller method declares both in a single
 * annotation:
 *
 *   @Get("/transactions")
 *   list(@QuerySchema(listSchema) query: ListTransactionsQuery) { ... }
 *
 * Implementation mirrors `@BodySchema` (slice 3 batch 6): NestJS
 * natively accepts `@Query(pipeInstance)` to run a pipe during
 * parameter resolution. The schema travels with the route's
 * TypeScript signature so the inferred query type matches the
 * validator.
 *
 * Slice 5 close-out adds this because the controller surface in
 * design §5.3 binds Zod schemas to BOTH body AND query (e.g. the
 * cursor + filters on `GET /transactions`). Path params (`/:id`)
 * stay raw `string` for now — the slice does not need to parse
 * cuid-shaped params because the service layer validates the id
 * via the repository's `findById` (which returns `null` for
 * missing rows; the controller maps that to 404).
 */
export const QuerySchema = <T extends z.ZodTypeAny>(schema: T) =>
  Query(new ZodValidationPipe(schema));
