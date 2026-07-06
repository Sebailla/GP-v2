import { Body } from "@nestjs/common";
import type { z } from "zod";

import { ZodValidationPipe } from "../pipes/zod-validation.pipe.js";

/**
 * `@BodySchema(<schema>)` parameter decorator (design §6.1).
 *
 * Pairs NestJS's `@Body()` parameter decorator with the canonical
 * `ZodValidationPipe` so a controller method declares both in a
 * single annotation:
 *
 *   @Post("/auth/login")
 *   login(@BodySchema(loginSchema) body: LoginInput) { ... }
 *
 * Implementation: NestJS natively accepts `@Body(pipeInstance)` to
 * run a pipe during parameter resolution. The schema travels with
 * the route's TypeScript signature so the inferred body type matches
 * the validator.
 */
export const BodySchema = <T extends z.ZodTypeAny>(schema: T) =>
  Body(new ZodValidationPipe(schema));
