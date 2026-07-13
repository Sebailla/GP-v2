/**
 * INVALID fixture for `no-import-type-injectable`.
 *
 * This file is a @Controller-decorated class that imports an
 * injectable service with `import { type AuthService }` and uses
 * AuthService as a constructor parameter type. Under
 * `isolatedModules: true` the `type` keyword erases the runtime
 * import; NestJS DI sees `undefined` and throws at bootstrap.
 *
 * The rule MUST fire here, reporting at least one diagnostic. The
 * runner's `pnpm lint:fixtures` enforces this contract: this
 * fixture is expected to report `errorCount >= 1`. Until T5 lands
 * the full rule body, the stub rule reports 0 errors and the runner
 * FAILS — that failure mode IS the RED state of the TDD cycle for
 * the rule wiring.
 */

import { type AuthService } from "@features/auth";

@Controller("/auth")
export class BadController {
  constructor(private readonly auth: AuthService) {}

  @Get("/me")
  async me(): Promise<{ ok: boolean }> {
    return { ok: Boolean(this.auth) };
  }
}