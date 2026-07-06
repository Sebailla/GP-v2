import { BadRequestException, Injectable } from "@nestjs/common";
import type { ArgumentMetadata, PipeTransform } from "@nestjs/common";
import type { z } from "zod";

/**
 * Generic Zod validation pipe (design §6.1).
 *
 * Usage: \`@UsePipes(new ZodValidationPipe(<schema>))\` on a controller
 * method or param, OR paired with the \`@BodySchema(<schema>)\` decorator
 * in \`apps/api/src/shared/decorators/body.decorator.ts\` for inline
 * declaration.
 *
 * Behavior:
 *  - Calls \`schema.safeParse(value)\`.
 *  - On \`success: true\` → returns \`result.data\` (the parsed output).
 *  - On \`success: false\` → throws \`BadRequestException\` with the
 *    shape \`{ error: "VALIDATION_FAILED", issues: result.error.issues }\`.
 *
 * The error shape is intentional: the issue list lets the client surface
 * field-level detail (e.g. \`auth.forgotPassword.email: "Invalid email"\`)
 * without exposing the server's internal Zod paths.
 *
 * This pipe is intentionally side-effect-free — no logging, no
 * mutation of the input. Errors thrown from here propagate to
 * NestJS's default exception filter (which we keep; slice 3 does
 * NOT ship a global exception filter — that lands in slice 5+).
 */
@Injectable()
export class ZodValidationPipe<T extends z.ZodTypeAny>
  implements PipeTransform<unknown, z.infer<T>>
{
  constructor(private readonly schema: T) {}

  transform(value: unknown, _metadata: ArgumentMetadata): z.infer<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        error: "VALIDATION_FAILED",
        issues: result.error.issues,
      });
    }
    return result.data;
  }
}
