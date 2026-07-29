"use strict";

/**
 * Forbid `import { type X }` for NestJS injectable classes referenced
 * from a file decorated with `@Controller()` (or `@Injectable()`).
 *
 * Glob (per design section 3.4 + ADR 0008): all .ts / .tsx / .js / .mjs / .cjs
 * files in the workspace (via the plugin's recommended config).
 *
 * Background: under `isolatedModules: true` in `tsconfig.base.json`,
 * `import type` and `import { type X }` are erased at compile time.
 * NestJS's reflective DI reads `reflect-metadata` from each
 * controller's constructor; if the constructor parameter's class
 * identity has been erased, the DI container sees `undefined` at the
 * positional slot and throws `Nest can't resolve dependencies of the
 * XxxController (?, Object, Object, Object)` — NestJS's own error
 * message literally says "This commonly occurs when using 'import
 * type' instead of 'import' for injectable classes".
 *
 * Predicate (all three conditions must hold to fire):
 *   1. The file contains a top-level `ClassDeclaration` whose
 *      `@Controller()` decorator references the imported name
 *      indirectly (file-local resolution, conservative tie-breaker).
 *   2. The class has a `MethodDefinition(kind=constructor)` whose
 *      parameter type annotations reference the imported binding's
 *      local name. We walk the `TSTypeReference` tree; if the
 *      `typeName` is an `Identifier` whose name matches the binding,
 *      the symbol is in scope.
 *   3. The `ImportSpecifier` (or `ImportDeclaration` as a whole) carries
 *      `importKind: 'type'` — the AST node kind ESLint records when
 *      the source uses either `import type { X }` or
 *      `import { type X }`.
 *
 * Conservative tie-breaker: if the imported symbol cannot be
 * resolved to a same-file reference (e.g. it lives in another file
 * resolved through tsconfig paths / `@features/*` aliases), SKIP —
 * never over-report. False NEGATIVES are accepted; false POSITIVES
 * would erode trust in the rule (slice-1 design §3.4 spirit). The
 * `_ServiceAnchor` static field is the runtime defensive guard; this
 * rule is the lint-time defensive guard. Together they form the
 * ADR 0008 decision.
 *
 * Decorator detection: this rule uses the *literal* decorator-name
 * pattern (`@Controller`, `@Injectable`). It does NOT inspect the
 * decorator's argument list (e.g. `@Controller('auth')`). That's
 * sufficient: any file carrying `@Controller` is a controller, full
 * stop.
 *
 * ESTree subset: the project uses `@typescript-eslint/parser`
 * (configured in eslint.config.mjs lines 14 + 44-52), so node types
 * like `ClassDeclaration`, `MethodDefinition`, `FunctionExpression`,
 * `Identifier`, `TSTypeReference` are all present.
 */

const CONSTRUCTOR_DECORATORS = new Set(["Controller", "Injectable"]);

/**
 * Collect every local-class-anchor: a class in the file whose
 * constructor references an imported binding by name. We return a
 * map { [importedLocalName]: constructorClassName } so the rule can
 * attribute the diagnostic to the right class.
 */
function collectLocalControllerConstructors(program) {
  const anchors = new Map(); // importedLocalName → controllerClassName
  const classNodes = [];

  // Walk Program.body to find top-level ClassDeclarations.
  // ESTree puts top-level declarations in `body`; nested class decls
  // are out of scope (this rule only fires on top-level controllers).
  // We unwrap ExportNamedDeclaration / ExportDefaultDeclaration wrappers
  // so an `export class FooController` is treated identically to
  // `class FooController`.
  for (const stmt of program.body || []) {
    let cls = null;
    if (stmt.type === "ClassDeclaration") {
      cls = stmt;
    } else if (
      stmt.type === "ExportNamedDeclaration" ||
      stmt.type === "ExportDefaultDeclaration"
    ) {
      if (stmt.declaration && stmt.declaration.type === "ClassDeclaration") {
        cls = stmt.declaration;
      }
    }
    if (!cls) continue;
    if (!cls.decorators || cls.decorators.length === 0) continue;
    // Coarse decorator check: any of stmt.decorators.expression.callee.name
    // is in CONSTRUCTOR_DECORATORS.
    const hasDecorator = cls.decorators.some((d) => {
      const expr = d.expression;
      if (!expr) return false;
      if (expr.type === "Identifier") {
        return CONSTRUCTOR_DECORATORS.has(expr.name);
      }
      // Decoration like @Controller('auth') — the callee is an
      // Identifier wrapping the args list.
      if (
        expr.type === "CallExpression" &&
        expr.callee &&
        expr.callee.type === "Identifier"
      ) {
        return CONSTRUCTOR_DECORATORS.has(expr.callee.name);
      }
      return false;
    });
    if (!hasDecorator) continue;
    classNodes.push(cls);
  }

  for (const cls of classNodes) {
    const clsName = cls.id && cls.id.name;
    if (!clsName) continue;
    for (const member of cls.body.body || []) {
      if (member.type !== "MethodDefinition") continue;
      if (member.kind !== "constructor") continue;
      if (member.value.type !== "FunctionExpression") continue;
      for (const param of member.value.params || []) {
        // TS-ESTree emits parameter types as `.typeAnnotation` on
        // an Identifier node, OR as a top-level TSTypeAnnotation
        // node (TS 4.7+). We accept both.
        collectReferencedNames(param, anchors, clsName);
      }
    }
  }

  return anchors;
}

/**
 * Recursively walk a node and record every Identifier whose name
 * appears as a type reference (i.e. used in type position). We
 * don't try to distinguish "type" from "value" usage — any
 * reference inside a constructor param is good enough signal for
 * "this symbol is consumed by the controller".
 */
function collectReferencedNames(node, anchors, clsName) {
  if (!node || typeof node !== "object") return;
  // Record the Identifier even if it also has a typeAnnotation (e.g.
  // an Identifier-shaped constructor parameter like `auth: AuthService`).
  // We recurse into its `typeAnnotation` after recording so the
  // referenced type name is also captured.
  if (node.type === "Identifier" && node.name) {
    anchors.set(node.name, clsName);
    // Fall through to recurse into children — Identifier nodes can
    // carry `typeAnnotation` (e.g. param names + field declarations).
    // Without the fall-through the type name in `: AuthService` is
    // never captured.
  }
  // Recurse over the well-known child keys; do NOT recurse into
  // every property (cost). The keys below cover the TS-ESTree
  // shapes that nest type references.
  for (const key of [
    "typeAnnotation",
    "typeParameters",
    "elementType",
    "typeName",
    "returnType",
    "typeArguments",
    "params",
    "elements",
    "members",
    "body",
    "expression",
    "declaration",
    "init",
    "argument",
    "arguments",
    "callee",
    // TSParameterProperty wraps a regular parameter in `.parameter`
    // (the type annotation lives on `.parameter.typeAnnotation`, not
    // directly on the TSParameterProperty itself).
    "parameter",
  ]) {
    const child = node[key];
    if (Array.isArray(child)) {
      for (const c of child) collectReferencedNames(c, anchors, clsName);
    } else if (child && typeof child === "object") {
      collectReferencedNames(child, anchors, clsName);
    }
  }
}

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid `import { type X }` for NestJS injectable classes (decorated with @Injectable or referenced as a @Controller constructor parameter). Under isolatedModules: true, type imports are erased at compile time and NestJS reflective DI cannot resolve the class.",
      category: "Architectural boundaries",
      recommended: false,
    },
    schema: [],
    messages: {
      forbiddenImportType:
        "Use a value import (drop `type`) for `{{name}}` in '{{file}}' because it is referenced from the constructor of @{{decorator}}-decorated class `{{className}}`. NestJS reflective DI cannot resolve type-erased classes under `isolatedModules: true`. See ADR 0008.",
    },
  },

  create(context) {
    const filename = context.filename || context.getFilename();

    // Two-pass strategy:
    //   pass 1 (Program enter): collect { localName → className } for
    //   every constructor parameter type annotation in every
    //   @Controller / @Injectable class in this file.
    //   pass 2 (ImportDeclaration): for every `import { type X }`
    //   specifier, check if X is in the anchors map; if yes, report.
    //
    // The Program-enter collection makes the rule cheap on Import
    // visits: each ImportDeclaration is O(specifiers).

    const anchorsByLocalName = new Map();
    let topDecorator = "Controller"; // best-effort, used for the diagnostic only

    return {
      Program(node) {
        const collected = collectLocalControllerConstructors(node);
        for (const [k, v] of collected) anchorsByLocalName.set(k, v);
        // (Diagnostic decoration name is controller-agnostic; we just
        // emit "Controller" because @Injectable classes are rare.)
        topDecorator = "Controller";
      },
      ImportDeclaration(node) {
        // Fast bail: only consider `import { type X }` or
        // `import type { X }`. Either shows up in the AST as
        // `node.importKind === 'type'` OR per-specifier
        // `importKind === 'type'`.
        if (!node.specifiers || node.specifiers.length === 0) return;
        for (const spec of node.specifiers) {
          if (spec.type !== "ImportSpecifier") continue;
          const isTypeImport =
            node.importKind === "type" || spec.importKind === "type";
          if (!isTypeImport) continue;
          const localName = spec.local && spec.local.name;
          if (!localName) continue;
          const className = anchorsByLocalName.get(localName);
          if (!className) continue; // conservative skip — not a constructor param
          context.report({
            node: spec,
            messageId: "forbiddenImportType",
            data: {
              name: localName,
              file: filename,
              decorator: topDecorator,
              className,
            },
          });
        }
      },
    };
  },
};