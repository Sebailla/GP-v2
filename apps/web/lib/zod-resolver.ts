import type { FieldValues, Resolver } from "react-hook-form";

/**
 * Zod-3-AND-Zod-4-aware resolver for `react-hook-form` — slice 4 batch 4c.
 *
 * **Why this exists instead of `@hookform/resolvers/zod`:**
 *  - The published `@hookform/resolvers/zod@3.10` package hard-codes the
 *    Zod 3 error shape (`error.errors[]`) and rejects Zod 4 errors
 *    (`error.issues[]`) by rethrowing them as unhandled rejections.
 *    See: `node_modules/@hookform/resolvers/zod/dist/zod.mjs` line 1,
 *    `if (Array.isArray(r?.errors)) return {values:{},errors:...}; throw r;`.
 *  - The auth-slice schemas (`libs/features/auth/shared/schemas/*.ts`)
 *    were authored against Zod 4 by slice 3 batch 7 (the NestJS
 *    controller's `ZodValidationPipe` parses against the same schemas
 *    on the server side and accepts Zod 4's error shape).
 *  - Installing `@hookform/resolvers@^4` is a larger blast radius (new
 *    peer-deps, new API surface). A ~15-line custom resolver that
 *    matches the schema's `safeParseAsync` contract is sufficient and
 *    keeps the dependency graph stable.
 *
 * This resolver is structural — it doesn't import Zod at all. It only
 * requires the schema to expose a `safeParseAsync(values)` method that
 * returns either `{ success: true, data }` or `{ success: false,
 * error: { issues: [...] } }`. Both Zod 3 and Zod 4 match.
 */

/**
 * Structural type for the schema we accept — wide enough to cover Zod
 * 3 and Zod 4 without importing either. Note the `path` accepts
 * `ReadonlyArray<PropertyKey>` to match Zod 4's `$ZodIssue` shape
 * (PropertyKey = string | number | symbol, which Zod 4 uses internally
 * for tuple indices + object keys + symbol keys if any).
 */
export interface SafeParseAsyncSchema<TOutput> {
  safeParseAsync(
    input: unknown,
  ): Promise<
    | { success: true; data: TOutput }
    | {
        success: false;
        error: {
          issues: ReadonlyArray<{
            path: ReadonlyArray<PropertyKey>;
            message: string;
            code?: string;
          }>;
        };
      }
  >;
}

export function zodResolver<TSchema extends SafeParseAsyncSchema<TOutput>, TOutput extends FieldValues>(
  schema: TSchema,
): Resolver<TOutput> {
  return async (values) => {
    const result = await schema.safeParseAsync(values);
    if (result.success) {
      return {
        values: result.data,
        errors: {},
      };
    }

    const errors: Record<
      string,
      { type: string; message: string }
    > = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join(".");
      if (!(path in errors)) {
        errors[path] = {
          type: issue.code ?? "validation",
          message: issue.message,
        };
      }
    }

    return {
      values: {} as TOutput,
      errors: errors as never,
    };
  };
}