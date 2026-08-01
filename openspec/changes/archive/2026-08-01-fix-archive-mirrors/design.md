# Design — `fix-archive-mirrors`

## 1. Goals ↔ Technical Approach

| Goal | Technical approach |
|---|---|
| G1–G7 | Seven oldest-first PRs, one archive per PR; hand-translate only missing EN artifacts into neutral professional Spanish and preserve the two existing ES files. |
| G8 | `auto-chain`: PR N+1 starts from updated `develop` only after PR N squash-merges. |
| G9 | Run `perl -ne 'print if /\p{Han}/'` against every in-scope ES file; output must be empty. |
| G10 | Final audit compares seven EN/ES directories: 33 EN-equivalent ES files total (29 created + 2 existing partial files, with two archives legitimately having four files). |
| G11 | Per-PR diff contains only `.md` paths in that archive's ES subtree. |
| G12 | Record the three stray `-mirror/` folders in Engram; do not modify them. |

## 2. Per-PR File Inventory

`EN` paths start at `openspec/changes/archive/`; `ES` paths replace that prefix with `Documents-es/openspec/changes/archive/`. LOC is current EN `wc -l` and is the review estimate, not a promised translated line count.

| PR | Archive | File | Action | EN LOC |
|---:|---|---|---|---:|
| 1 | `2026-07-13-fix-api-nestjs-di` | `proposal.md` | Create ES | 211 |
| 1 | same | `spec.md` | Create ES | 455 |
| 1 | same | `design.md` | Create ES | 1,654 |
| 1 | same | `tasks.md` | Create ES | 334 |
| 1 | same | `explore.md` | Create ES | 375 |
| 2 | `2026-07-14-fix-bdd-tsx-node22` | `proposal.md` | Create ES | 198 |
| 2 | same | `spec.md` | Create ES | 428 |
| 2 | same | `design.md` | Create ES | 519 |
| 2 | same | `tasks.md` | Create ES | 288 |
| 2 | same | `explore.md` | Create ES | 305 |
| 3 | `2026-07-14-fix-state-coverage-drift` | `proposal.md` | Create ES | 59 |
| 3 | same | `spec.md` | Create ES | 445 |
| 3 | same | `design.md` | Create ES | 645 |
| 3 | same | `tasks.md` | Create ES | 243 |
| 3 | same | `explore.md` | Create ES | 431 |
| 4 | `2026-07-14-fix-vitest-4-deprecation` | `proposal.md` | Create ES | 95 |
| 4 | same | `spec.md` | Create ES | 150 |
| 4 | same | `design.md` | Create ES | 456 |
| 4 | same | `tasks.md` | Create ES | 261 |
| 5 | `2026-07-14-fix-web-vitest-crash` | `proposal.md` | Create ES | 217 |
| 5 | same | `spec.md` | Create ES | 419 |
| 5 | same | `design.md` | Create ES | 423 |
| 5 | same | `tasks.md` | Create ES | 240 |
| 5 | same | `explore.md` | Create ES | 419 |
| 6 | `2026-07-14-fix-ci-env-propagation` | `proposal.md` | Create ES | 253 |
| 6 | same | `spec.md` | Verify existing ES unchanged | 585 |
| 6 | same | `design.md` | Create ES | 570 |
| 6 | same | `tasks.md` | Create ES | 366 |
| 6 | same | `explore.md` | Create ES | 239 |
| 7 | `2026-07-13-slice-8-closing-bdd-and-docs` | `proposal.md` | Create ES | 136 |
| 7 | same | `spec.md` | Create ES | 735 |
| 7 | same | `design.md` | Verify existing ES unchanged | 658 |
| 7 | same | `tasks.md` | Create ES | 541 |

## 3. Execution Plan

For each PR N (1–7), using its §2 archive:

1. After PR N−1 merges, create `feat/fix-archive-mirrors-pr-N` from current `develop`.
2. Hand-translate only `Create ES` rows directly to their corresponding ES paths; never use automated translation.
3. Confirm the batch has the archive's actual 3/4/5 created files; no `git mv` is needed because files are created at final paths.
4. Verify EN/ES names, preserved partial file where applicable, empty CJK output, `pnpm lint:fixtures`, and archive-only diff.
5. Commit once: `docs(mirrors): <archive> — add ES mirror (PR N of 7)`.
6. Push with explicit upstream: `git push -u origin feat/fix-archive-mirrors-pr-N`.
7. Open with explicit head/base: `gh pr create --base develop --head feat/fix-archive-mirrors-pr-N --title "docs(mirrors): <archive> — add ES mirror (PR N of 7)" --body "[mirror-batch]"`.
8. Wait for CI and review.
9. Squash-merge to `develop`.
10. Continue only after `develop` contains the merge.

## 4. Atomic Commits

Seven PRs, one commit each, one archive subtree each. No stacked commits inside a PR. Any batch can be reverted independently; the full rollout reverts PR 7 → PR 1.

## 5. Test Execution Plan

| Requirement/scenario | Command / evidence |
|---|---|
| R1–R7 completeness | `diff <(find "openspec/changes/archive/<name>" -maxdepth 1 -name '*.md' -exec basename {} \; \| sort) <(find "Documents-es/openspec/changes/archive/<name>" -maxdepth 1 -name '*.md' -exec basename {} \; \| sort)` is empty. |
| R8 atomicity | PR contains one commit and only its archive subtree. |
| R9 order | `gh pr list --state merged --limit 7` plus merge timestamps shows PRs 1–7 sequentially. |
| R10 CJK | `perl -ne 'print if /\p{Han}/' Documents-es/openspec/changes/archive/<name>/*.md` returns empty. |
| R11 marker | PR title starts `docs(mirrors):`; body contains `[mirror-batch]`. |
| R12 docs-only scope | `git diff --name-only <base>...HEAD` contains only `Documents-es/openspec/changes/archive/<name>/*.md`; `grep -E '\.(ts|tsx|json|cjs|sh|yml|yaml)$'` returns empty. |
| CI | `pnpm lint:fixtures` exits 0 per PR. |
| Stray folders | `ls Documents-es/openspec/changes/archive/ | grep -E -- '-mirror$'` remains unchanged; Engram records deferred cleanup. |

## 6. Risks and Mitigations

| ID | Risk | Mitigation |
|---|---|---|
| R1 | Reviewer fatigue / chain conflicts | One independent archive per PR; ordered merges; consistent marker. |
| R2 | Regional-tone drift | Neutral professional Spanish; existing partial mirrors are tone references. |
| R3 | Technical mistranslation | EN remains authoritative; preserve paths, commands, identifiers, and versions verbatim; side-by-side review. |
| R4 | Active changes archive mid-chain | Do not expand a started PR; re-scope only at the next PR boundary under §13. |

## 7. Out of Scope

- Three stray `-mirror/` folders (Engram-only deferred-cleanup observation).
- Three active changes; their mirrors belong to their archive operation.
- Six already mirrored ADRs.
- Source, tooling, CI, ESLint, or automated-translation changes.

## 8. Open Questions for Tasks Phase

None; all six spec questions are resolved.

## 9. Validation Criteria for `sdd-verify`

After PR 7 merges: all seven EN/ES directory inventories match; 29 missing ES files now exist; both pre-existing partial files remain unchanged; all seven CI runs are green; CJK checks are empty; the aggregate chain changes only Markdown in the seven ES archive subtrees; AGENTS.md §13 compliance is restored for in-scope archives.

### Threat Matrix

| Boundary | Applicability | Design response |
|---|---|---|
| Documentation-like paths | Applicable: `.md` classification is the scope boundary | Reject any non-`.md` path; executable-like docs are not introduced. |
| Git repository selection | Applicable | Run in the project root; no `git -C` or alternate cwd. |
| Commit state | Applicable | Stage explicit archive paths; reject empty index or unrelated staged files; no `commit -a`. |
| Push state | Applicable | Explicit branch and first-push upstream; fail rather than infer another destination. |
| PR commands | Applicable | Explicit `--base develop` and `--head`; fixed title/body marker; no composed shell input. |

These are operational verification boundaries for documentation delivery; strict TDD is N/A because no automation code changes.

## 10. Traceability

| Spec requirement | Design section |
|---|---|
| R1–R7 | §2 inventory, §5 completeness |
| R8 | §4 |
| R9 | §3 steps 8–10, §5 order |
| R10 | §3 step 4, §5 CJK |
| R11 | §3 steps 5 and 7, §5 marker |
| R12 | §3 steps 2–4, §5 scope |
