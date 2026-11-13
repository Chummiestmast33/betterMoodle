# Dispatch: Explorer 2 (E2E Test Architecture & Tier 1-4 Design)

**Task**: Design the E2E test suite architecture and concrete test case catalog across Tiers 1-4:
- Tier 1: Feature Coverage (>=5 tests per feature for each of the 5 endpoints = >=25 tests)
- Tier 2: Boundary & Corner Cases (>=5 tests per feature: invalid types, negative IDs, SQL injection payloads, empty tables, malicious URLs, protocol bypass, port injection = >=25 tests)
- Tier 3: Cross-Feature Combinations (interactions between dashboard, contents, grades, proxy, and health metrics)
- Tier 4: Real-World Scenarios (complete student user journeys and failure recovery)
- Design structure for `TEST_INFRA.md` and `TEST_READY.md`

**Inputs to Read**:
- `c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\ORIGINAL_REQUEST.md`
- `c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\orchestrator\PROJECT.md`
- `c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\e2e_testing_orch\SCOPE.md`

**Output Requirements**:
Write the comprehensive test plan, Tier 1-4 test catalog, and file layout recommendations to `c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\explorer_e2e_2\handoff.md`.
Do NOT implement code.
Notify your parent when complete.


## 2026-11-12T20:37:37Z
[Message] timestamp=2026-11-12T20:37:37Z sender=633791a2-7779-4c0d-82f1-cfb32407190b priority=MESSAGE_PRIORITY_HIGH content=You are Explorer 2 for the E2E Testing Track of BetterMoodle Phase 3.
Working directory: c:\Users\corte\Downloads\betterMoodle
State folder: c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\explorer_e2e_2

Authoritative inputs to read:
- c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\ORIGINAL_REQUEST.md (MANDATORY: read first)
- c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\orchestrator\PROJECT.md
- c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\e2e_testing_orch\SCOPE.md
- c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\explorer_e2e_2\DISPATCH.md

Your task:
Design the complete test catalog for Tiers 1-4:
- Tier 1: Feature Coverage (>=5 tests per feature for each of the 5 endpoints: Dashboard, Contents, Grades, Health, Proxy -> total >=25 tests)
- Tier 2: Boundary & Corner Cases (>=5 tests per feature: invalid types, negative/zero IDs, SQL injection strings, empty tables, malicious URLs, protocol bypass, port injection, missing params, oversized params -> total >=25 tests)
- Tier 3: Cross-Feature Combinations (>=5 tests: e.g. dashboard + grades consistency, contents + proxy resource url, sync runs + health metrics calculation)
- Tier 4: Real-World Scenarios (>=5 application scenarios: full student daily workflow, grade review, file download via proxy, error resilience)
- Propose the exact structure for TEST_INFRA.md and TEST_READY.md according to Project Pattern specifications.

Write your comprehensive test design and catalog to c:\Users\corte\Downloads\betterMoodle\.agents\teamwork\explorer_e2e_2\handoff.md.
Do NOT write code or modify files outside your state folder.
Send a message to your parent (conv ID: 633791a2-7779-4c0d-82f1-cfb32407190b) when done.
