import { z } from 'zod';

export const CourseSchema = z.object({
  id: z.number(),
  shortname: z.string(),
  fullname: z.string(),
  progress: z.number().nullable().optional(),
  payload_json: z.string().nullable().optional(),
  refreshed_at: z.number()
});

export type Course = z.infer<typeof CourseSchema>;

export const SyncedItemTypeSchema = z.enum(['assignment', 'grade', 'announcement']);
export type SyncedItemType = z.infer<typeof SyncedItemTypeSchema>;

export const SyncedItemSchema = z.object({
  item_key: z.string(),
  course_id: z.number(),
  item_type: SyncedItemTypeSchema,
  title: z.string(),
  url: z.string().nullable().optional(),
  due_date: z.number().nullable().optional(),
  grade_num: z.number().nullable().optional(),
  timemodified: z.number(),
  payload_json: z.string().nullable().optional(),
  first_seen_at: z.number(),
  updated_at: z.number(),
  deleted_at: z.number().nullable().optional()
});

export type SyncedItem = z.infer<typeof SyncedItemSchema>;

export const SyncStateSchema = z.object({
  id: z.number(),
  baseline_seeded: z.number(),
  last_success_at: z.number(),
  last_attempt_at: z.number(),
  consecutive_failures: z.number()
});

export type SyncState = z.infer<typeof SyncStateSchema>;

export const SyncRunSchema = z.object({
  id: z.number().optional(),
  started_at: z.number(),
  finished_at: z.number().nullable().optional(),
  status: z.enum(['ok', 'partial', 'error']),
  subrequests_used: z.number().optional(),
  items_changed: z.number().optional(),
  error: z.string().nullable().optional()
});

export type SyncRun = z.infer<typeof SyncRunSchema>;

export const MoodleTokenResponseSchema = z.union([
  z.object({
    token: z.string(),
    privatetoken: z.string().nullable().optional()
  }),
  z.object({
    error: z.string(),
    errorcode: z.string()
  })
]);

export type MoodleTokenResponse = z.infer<typeof MoodleTokenResponseSchema>;
