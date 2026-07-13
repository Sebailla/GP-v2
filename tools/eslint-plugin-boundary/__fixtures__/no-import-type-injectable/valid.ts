/**
 * VALID fixture for `no-import-type-injectable`.
 *
 * This file contains a @Controller-decorated class that:
 *   (a) imports services as RUNTIME values (no `type` keyword) — the
 *       correct pattern enforced by the rule, AND
 *   (b) imports a DTO via `import type { X }` for use as a
 *       parameter type annotation only — also allowed because the
 *       DTO is NOT used as a constructor parameter.
 *
 * The rule's predicate requires `(spec.importKind === 'type')` AND
 * the imported name appears in a constructor parameter type. Both
 * conditions fail here: (a) imports have no `type`; (b) the DTO is
 * used in a method body parameter type, NOT a constructor.
 */

import { AuthService, SessionService } from "@features/auth";
import type { CreateUserInput } from "@features/auth/shared/schemas";

@Controller("/example")
export class ExampleController {
  constructor(
    private readonly auth: AuthService,
    private readonly session: SessionService,
  ) {}

  @Post("/users")
  async create(@Body() body: CreateUserInput): Promise<void> {
    // `CreateUserInput` is a type-only reference in the method body,
    // not a constructor param. Even though the import uses
    // `import type`, this file MUST NOT trigger the rule.
    return this.auth.register(body.email, body.password, body.name);
  }
}