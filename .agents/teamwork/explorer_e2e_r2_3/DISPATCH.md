# Dispatch: Explorer 3 — Iteration 2 (Feature & Combination Tests Remediation)

**Task**: Analyze how to fix mutation survival and missing preconditions in Tier 1 and Tier 3:
- `T1-DASH-05`: Mutant survival on empty array. Fix: change `expect(body.recent_activity.length).toBeLessThanOrEqual(15)` to `expect(body.recent_activity.length).toBe(15)` since 20 items were seeded.
- `T3-XFEAT-05`: Tombstone cascade test missing dashboard baseline check. Fix: query `/api/dashboard` prior to tombstoning and assert `grade_arch_quiz` is present, then verify disappearance after deletion.
- Verify that these fixes prevent mutant escapes without breaking valid implementations.
- Formulate the exact code edits for the worker to execute.
- Do NOT implement code directly.

**Mandatory Inputs**:
- `c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\ORIGINAL_REQUEST.md` (MANDATORY: read first)
- `c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\challenger_e2e_2\handoff.md`
- `c:\Users\corte\Downloads\betterMoodle\apps\worker\test\e2e\tier1-features.test.ts`
- `c:\Users\corte\Downloads\betterMoodle\apps\worker\test\e2e\tier3-combinations.test.ts`

Write your findings to `c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\explorer_e2e_r2_3\handoff.md` and notify parent.
