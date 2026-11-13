# Sub-Orchestrator Dispatch: Milestone M2 (D1 Read BFF Endpoints)

**Role**: Sub-Orchestrator for Milestone M2
**Scope Document**: `c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\sub_orch_m2\SCOPE.md`
**Authoritative Request**: `c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\ORIGINAL_REQUEST.md`
**Global Project Decomposition**: `c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\orchestrator\PROJECT.md`
**Explorer Survey Finding**: `c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\teamwork_explorer_survey_2\handoff.md`
**Shared Schemas Deliverable**: `c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\sub_orch_m1\handoff.md`

## Instructions
1. Follow the Project Pattern procedure:
   - Spawn Explorers to review `SCOPE.md`, the shared schemas in `@better-moodle/shared`, and existing routes in `src/index.ts`.
   - Spawn Worker with exclusive write ownership of M2 files to implement migration `0003_phase3_course_contents.sql`, routes in `apps/worker/src/routes/`, and refactor `apps/worker/src/index.ts`. Ensure RNF-02 (no Moodle fetches on read routes) is strictly honored.
   - Spawn Reviewers (2), Challengers (2), and Forensic Auditor.
   - Execute gate verification.
2. Write handoff report to `c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\sub_orch_m2\handoff.md` and notify parent orchestrator when complete.
