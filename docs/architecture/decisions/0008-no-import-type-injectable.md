# ADR 0008 — Forbid `import { type X }` for NestJS injectable classes in @Controller files

- **Status**: Accepted
- **Date**: 2026-07-13
- **Deciders**: Sebastián Illa (sole maintainer) + `sdd-verify` sub-agent
- **Context**: Slice `fix-api-nestjs-di` of `gastos-personales-reference`

## Context and problem statement

Slice 7 PR-2 (commit `3db761f`, "remove unused imports + auto-formatter anchor") rewrote
`import { AuthService, … }` to `import { type AuthService, … }` AND deleted the runtime
anchor `private static readonly _ServiceAnchor = [AuthService, …]` in
`apps/api/src/modules/auth/auth.controller.ts`. Under `isolatedModules: true`
(`tsconfig.base.json` line 10) the `import type` form is fully erased at compile time,
so NestJS's reflective DI sees `undefined` for the constructor parameter at index `[0]`
and throws `Nest can't resolve dependencies of the AuthController (?, Object, Object, Object)`
— NestJS's own error literally says "This commonly occurs when using 'import type' instead
of 'import' for injectable classes". Slice-8 verify (`develop@ea7732f`) recorded this
under follow-up F1 of ADR 0007 as Gate 3 / pre-existing slice-7 debt.

The same `import { type X }` pattern was latent in
`apps/api/src/modules/transactions/transactions.controller.ts` (lines 23, 25, 27) for
`CategoryService`, `ThresholdService`, `TransactionService`. No e2e test exercised
`TransactionsModule`, so the bug class had been silently shipping since slice 5.

## Decision

We adopt the following rule for ALL NestJS controllers in this monorepo:

> Class services that are referenced from a file decorated with `@Controller()`
> MUST be imported using a value import (NOT `import { type X }`). The controller
> MUST additionally declare a `private static readonly _ServiceAnchor` field
> referencing all such services as a runtime anchor to defend against future
> `import type` regressions.

This rule is enforced by three independent guards:

1. The new ESLint rule `@gpr/boundary/no-import-type-injectable` (added by this change)
   in `tools/eslint-plugin-boundary/rules/`.
2. The `_ServiceAnchor` static field convention (stylistic but enforced by review).
3. CI: `pnpm lint:fixtures` exercises the rule's fixtures; `pnpm turbo run lint` applies
   the rule globally via `boundary.configs.recommended`.

## Anti-example (DO NOT do this)

```typescript
// auth.controller.ts — BROKEN; will fail at NestJS bootstrap with
//   "Nest can't resolve dependencies of the AuthController (?, Object, Object, Object)".
import { type AuthService, type SessionService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly session: SessionService,
  ) {}
  // No `_ServiceAnchor` runtime anchor — the two `type` imports are erased
  // at compile time and the controller's constructor parameters resolve to
  // `undefined` at runtime.
}
```

## Correct pattern

```typescript
// auth.controller.ts — FIXED; NestJS reflective DI resolves the
//   constructor parameters at runtime.
import { AuthService, SessionService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly session: SessionService,
  ) {}

  /**
   * Runtime anchor — LAST field, defensive against future `import type`
   * regressions. Enforced by `@gpr/boundary/no-import-type-injectable`.
   */
  private static readonly _ServiceAnchor: ReadonlyArray<unknown> = [
    AuthService,
    SessionService,
  ] as const;
}
```

## Consequences

**Positive**:

- All 21 currently-failing auth e2e tests pass (`auth.e2e-spec.ts` 14 + `jwt-auth-guard.e2e-spec.ts` 4 + `session-expiry.e2e-spec.ts` 3).
- The latent transactions DI bug is closed (verified by the new `transactions.e2e-spec.ts`).
- The ESLint rule blocks future regressions automatically in CI.

**Negative**:

- Every NestJS controller in the codebase must follow the rule. The fix does NOT
  retroactively audit controllers beyond `AuthController` and `TransactionsController`;
  the ESLint rule will surface any other violations on the next `pnpm lint:fixtures`
  run. Per spec §4 non-goal #15, no other controller receives a `_ServiceAnchor` in
  this slice — the rule covers them at lint time only.
- The rule's predicate is conservative (file-local resolution only); see ADR body.

## References

- Proposal: `openspec/changes/fix-api-nestjs-di/proposal.md` (Engram `#2287`)
- Spec: `openspec/changes/fix-api-nestjs-di/spec.md` (Engram `#2289`; R1-R12)
- Design: `openspec/changes/fix-api-nestjs-di/design.md` §2 File 4 (rule body)
- Tasks: `openspec/changes/fix-api-nestjs-di/tasks.md`
- Regression source: commit `3db761f` (slice-7 PR-2, "remove unused imports + auto-formatter anchor")
- Smoking gun: NestJS error — "This commonly occurs when using 'import type' instead of 'import' for injectable classes"
- `tsconfig.base.json` line 10: `"isolatedModules": true` — the compile-time predicate that erases `import type`
- Follow-up F1 of ADR 0007 (`docs/architecture/decisions/0007-slice-8-doc-loc-exception.md`)
- Mirror (Spanish): `Documents-es/docs/architecture/decisions/0008-no-import-type-injectable.md`