/**
 * Empirical Assertiveness & Defect Sensitivity Verification Harness
 * Challenger 2 - BetterMoodle Phase 3 E2E Testing Track
 */

import { describe, it, expect } from 'bun:test';
import {
  DashboardResponseSchema,
  CourseContentsResponseSchema,
  CourseGradesResponseSchema,
  EnhancedHealthResponseSchema,
  ApiErrorResponseSchema,
} from '../packages/shared/src/index';

console.log('=== RUNNING CHALLENGER 2 EMPIRICAL ASSERTIVENESS EXPERIMENTS ===\n');

// ---------------------------------------------------------------------------
// Experiment 1: Schema Validation Sensitivity (Hypothesis 1)
// ---------------------------------------------------------------------------
describe('Experiment 1: Schema Sensitivity vs as any Casting', () => {
  it('Proves that an invalid dashboard payload passes loose assertions but is killed by Zod schema', () => {
    // Malformed dashboard: course id is string, refreshed_at missing, upcoming_assignments missing due_date
    const malformedDashboard = {
      courses: [
        { id: '10' as any, shortname: 'MAT101', fullname: 'Calculo' }, // missing refreshed_at, id is string
        { id: '20' as any, shortname: 'FIS201', fullname: 'Fisica' },
      ],
      upcoming_assignments: [
        { item_key: 'a1', course_id: 10, title: 'T1' }, // missing due_date, timemodified
        { item_key: 'a2', course_id: 20, title: 'T2' },
      ],
      recent_activity: [
        { item_key: 'ann1', course_id: 10, title: 'Notice' }, // missing item_type, timemodified
      ],
      current_grades: [
        { item_key: 'g1', course_id: 10, title: 'Exam', grade_num: 95.5 }, // missing timemodified
      ],
    };

    // 1. Simulating T1-DASH-01 assertions:
    const body = malformedDashboard as any;
    let looseAssertionsPassed = false;
    try {
      expect(Array.isArray(body.courses)).toBe(true);
      expect(body.courses.length).toBe(2);
      expect(Array.isArray(body.upcoming_assignments)).toBe(true);
      expect(body.upcoming_assignments.length).toBe(2);
      expect(Array.isArray(body.recent_activity)).toBe(true);
      expect(body.recent_activity.length).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(body.current_grades)).toBe(true);
      expect(body.current_grades.length).toBe(1);
      expect(body.current_grades[0].grade_num).toBe(95.5);
      looseAssertionsPassed = true;
    } catch {
      looseAssertionsPassed = false;
    }

    // 2. Strict Zod Schema validation:
    const schemaResult = DashboardResponseSchema.safeParse(malformedDashboard);

    console.log('[Exp 1] Loose assertions passed on malformed data?:', looseAssertionsPassed);
    console.log('[Exp 1] Zod Schema caught defects?:', !schemaResult.success);

    expect(looseAssertionsPassed).toBe(true); // Proves the test suite would pass malformed payloads!
    expect(schemaResult.success).toBe(false); // Proves Zod schema would have caught the bug!
  });
});

// ---------------------------------------------------------------------------
// Experiment 2: Silent Pass on Empty Array in T1-DASH-05 (Hypothesis 2)
// ---------------------------------------------------------------------------
describe('Experiment 2: T1-DASH-05 Mutation Survival (Empty Array)', () => {
  it('Proves T1-DASH-05 passes when a buggy backend returns empty recent_activity array', () => {
    // Buggy implementation returns empty recent_activity despite 20 seeded items
    const buggyBody = {
      recent_activity: [] as any[],
    };

    let passed = false;
    try {
      // Line 226 of tier1-features.test.ts:
      expect(buggyBody.recent_activity.length).toBeLessThanOrEqual(15);

      // Lines 228-232 of tier1-features.test.ts:
      for (let i = 0; i < buggyBody.recent_activity.length - 1; i++) {
        expect(buggyBody.recent_activity[i].timemodified).toBeGreaterThanOrEqual(
          buggyBody.recent_activity[i + 1].timemodified
        );
      }
      passed = true;
    } catch {
      passed = false;
    }

    console.log('[Exp 2] Did buggy empty array survive T1-DASH-05?:', passed);
    expect(passed).toBe(true); // Mutant survived! Test fails to assert that length === 15!
  });
});

// ---------------------------------------------------------------------------
// Experiment 3: Ineffective Number.isNaN in T2-HLTH-05 (Hypothesis 5)
// ---------------------------------------------------------------------------
describe('Experiment 3: T2-HLTH-05 Number.isNaN(undefined) Trap', () => {
  it('Proves Number.isNaN(undefined) returns false, letting missing properties pass', () => {
    const missingSubrequestsBody = {
      subrequests: {
        last_used: 10,
        // avg_recent is completely missing / undefined!
      } as any,
    };

    let passed = false;
    try {
      // Line 373 of tier2-boundaries.test.ts:
      expect(Number.isNaN(missingSubrequestsBody.subrequests.avg_recent)).toBe(false);
      passed = true;
    } catch {
      passed = false;
    }

    console.log('[Exp 3] Did missing avg_recent pass Number.isNaN check?:', passed);
    expect(passed).toBe(true); // Mutation survived! Test passes on undefined!
  });
});

// ---------------------------------------------------------------------------
// Experiment 4: Overly Lenient Status Check in T2-HLTH-01 & T2-CONT-05 (Hypothesis 4)
// ---------------------------------------------------------------------------
describe('Experiment 4: [200, 500] Permissive Crash Acceptance', () => {
  it('Proves that an unhandled 500 internal server error passes T2-HLTH-01 and T2-CONT-05', () => {
    const crashedStatus = 500;

    // Line 303 in tier2-boundaries.test.ts:
    const hlthPasses = [200, 500].includes(crashedStatus);
    // Line 198 in tier2-boundaries.test.ts:
    const contPasses = [200, 500].includes(crashedStatus);

    console.log('[Exp 4] Does 500 crash pass T2-HLTH-01?:', hlthPasses);
    console.log('[Exp 4] Does 500 crash pass T2-CONT-05?:', contPasses);

    expect(hlthPasses).toBe(true);
    expect(contPasses).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Experiment 5: Incomplete Tombstone Pre-Verification in T3-XFEAT-05 (Hypothesis 6)
// ---------------------------------------------------------------------------
describe('Experiment 5: T3-XFEAT-05 Missing Dashboard Precondition', () => {
  it('Proves T3-XFEAT-05 passes even if dashboard never returned the grade initially', () => {
    // Suppose /api/dashboard has a bug: it never includes grades from course 103
    const brokenDashboardAfterDelete = {
      current_grades: [] as any[], // empty initially and empty after
    };

    // Lines 206-208 in tier3-combinations.test.ts:
    const itemNotPresentAfterDelete = !brokenDashboardAfterDelete.current_grades.some(
      (g: any) => g.item_key === 'grade_arch_quiz'
    );

    console.log('[Exp 5] Does broken dashboard pass T3-XFEAT-05?:', itemNotPresentAfterDelete);
    expect(itemNotPresentAfterDelete).toBe(true); // The test passes even though the feature never worked!
  });
});
