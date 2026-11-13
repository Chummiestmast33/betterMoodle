import { z } from 'zod';

// ============================================================================
// 1. BASE DATABASE ENTITIES & SYNC MODELS (100% PRESERVED BACKWARD COMPATIBLE)
// ============================================================================

export const CourseSchema = z.object({
  id: z.number(),
  shortname: z.string(),
  fullname: z.string(),
  progress: z.number().nullable().optional(),
  payload_json: z.string().nullable().optional(),
  refreshed_at: z.number(),
  grades_synced_at: z.number().optional(),
  forums_synced_at: z.number().optional()
});
export type Course = z.infer<typeof CourseSchema>;

export const SyncedItemTypeSchema = z.enum(['assignment', 'grade', 'announcement']);
export type SyncedItemType = z.infer<typeof SyncedItemTypeSchema>;

export const SubmissionStatusSchema = z.enum(['pending', 'draft', 'submitted', 'graded']);
export type SubmissionStatus = z.infer<typeof SubmissionStatusSchema>;

export const SyncedItemSchema = z.object({
  item_key: z.string(),
  course_id: z.number(),
  item_type: SyncedItemTypeSchema,
  title: z.string(),
  url: z.string().nullable().optional(),
  due_date: z.number().nullable().optional(),
  grade_num: z.number().nullable().optional(),
  submission_status: SubmissionStatusSchema.nullable().optional(),
  status_synced_at: z.number().optional(),
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
  consecutive_failures: z.number(),
  moodle_user_id: z.number().nullable().optional(),
  courses_refreshed_at: z.number().optional(),
  grades_seeded: z.number().optional(),
  forums_seeded: z.number().optional(),
  circuit_open_until: z.number().optional(),
  dead_man_alerted: z.number().optional()
});
export type SyncState = z.infer<typeof SyncStateSchema>;

export const SyncRunSchema = z.object({
  id: z.number().optional(),
  started_at: z.number(),
  finished_at: z.number().nullable().optional(),
  status: z.enum(['ok', 'partial', 'error']),
  subrequests_used: z.number().nullable().optional(),
  items_changed: z.number().nullable().optional(),
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

// ============================================================================
// 2. DASHBOARD SCHEMAS & TYPES (GET /api/dashboard)
// ============================================================================

export const DashboardCourseSchema = z.object({
  id: z.number(),
  shortname: z.string(),
  fullname: z.string(),
  progress: z.number().nullable().optional(),
  refreshed_at: z.number()
});
export type DashboardCourse = z.infer<typeof DashboardCourseSchema>;

export const UpcomingAssignmentSchema = z.object({
  item_key: z.string(),
  course_id: z.number(),
  course_name: z.string().nullable().optional(),
  title: z.string(),
  url: z.string().nullable().optional(),
  due_date: z.number(),
  submission_status: SubmissionStatusSchema.nullable().optional(),
  timemodified: z.number()
});
export type UpcomingAssignment = z.infer<typeof UpcomingAssignmentSchema>;

export const RecentActivityItemSchema = z.object({
  item_key: z.string(),
  course_id: z.number(),
  course_name: z.string().nullable().optional(),
  item_type: SyncedItemTypeSchema,
  title: z.string(),
  url: z.string().nullable().optional(),
  timemodified: z.number(),
  updated_at: z.number().optional()
});
export type RecentActivityItem = z.infer<typeof RecentActivityItemSchema>;

export const DashboardGradeSchema = z.object({
  item_key: z.string(),
  course_id: z.number(),
  course_name: z.string().nullable().optional(),
  title: z.string(),
  grade_num: z.number().nullable(),
  grade_formatted: z.string().nullable().optional(),
  timemodified: z.number(),
  url: z.string().nullable().optional()
});
export type DashboardGrade = z.infer<typeof DashboardGradeSchema>;

export const DashboardResponseSchema = z.object({
  courses: z.array(DashboardCourseSchema),
  upcoming_assignments: z.array(UpcomingAssignmentSchema),
  recent_activity: z.array(RecentActivityItemSchema),
  current_grades: z.array(DashboardGradeSchema)
});
export type DashboardResponse = z.infer<typeof DashboardResponseSchema>;

// ============================================================================
// 3. COURSE CONTENTS SCHEMAS & TYPES (GET /api/courses/:id/contents)
// ============================================================================

export const CourseContentsParamsSchema = z.object({
  id: z.coerce.number().int().positive({ message: 'El ID de curso debe ser un entero positivo' })
});
export type CourseContentsParams = z.infer<typeof CourseContentsParamsSchema>;

export const CourseResourceFileSchema = z.object({
  filename: z.string(),
  fileurl: z.string(),
  filesize: z.number().nullable().optional(),
  filepath: z.string().nullable().optional(),
  mimetype: z.string().nullable().optional(),
  timemodified: z.number().nullable().optional(),
  proxy_url: z.string().optional()
});
export type CourseResourceFile = z.infer<typeof CourseResourceFileSchema>;

export const CourseModuleSchema = z.object({
  id: z.number(),
  name: z.string(),
  instance: z.number().optional(),
  modname: z.string(),
  modplural: z.string().optional(),
  description: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  visible: z.number().optional(),
  contents: z.array(CourseResourceFileSchema).optional()
});
export type CourseModule = z.infer<typeof CourseModuleSchema>;

export const CourseSectionSchema = z.object({
  id: z.number(),
  name: z.string(),
  visible: z.number().optional(),
  summary: z.string().nullable().optional(),
  section: z.number().optional(),
  modules: z.array(CourseModuleSchema)
});
export type CourseSection = z.infer<typeof CourseSectionSchema>;

export const CourseContentsResponseSchema = z.object({
  course_id: z.number(),
  sections: z.array(CourseSectionSchema),
  synced_at: z.number().nullable()
});
export type CourseContentsResponse = z.infer<typeof CourseContentsResponseSchema>;

// ============================================================================
// 4. COURSE GRADES SCHEMAS & TYPES (GET /api/courses/:id/grades)
// ============================================================================

export const CourseGradesParamsSchema = z.object({
  id: z.coerce.number().int().positive({ message: 'El ID de curso debe ser un entero positivo' })
});
export type CourseGradesParams = z.infer<typeof CourseGradesParamsSchema>;

export const GradeItemDetailSchema = z.object({
  item_key: z.string(),
  course_id: z.number(),
  title: z.string(),
  grade_num: z.number().nullable(),
  grade_formatted: z.string().nullable().optional(),
  grademin: z.number().nullable().optional(),
  grademax: z.number().nullable().optional(),
  percentage_formatted: z.string().nullable().optional(),
  feedback: z.string().nullable().optional(),
  itemtype: z.string().nullable().optional(),
  itemmodule: z.string().nullable().optional(),
  weight_formatted: z.string().nullable().optional(),
  timemodified: z.number(),
  url: z.string().nullable().optional()
});
export type GradeItemDetail = z.infer<typeof GradeItemDetailSchema>;

export const CourseGradesResponseSchema = z.object({
  course_id: z.number(),
  grades: z.array(GradeItemDetailSchema)
});
export type CourseGradesResponse = z.infer<typeof CourseGradesResponseSchema>;

// ============================================================================
// 5. ENHANCED HEALTH SCHEMAS & TYPES (GET /api/health)
// ============================================================================

export const SubrequestMetricsSchema = z.object({
  last_used: z.number(),
  max_budget: z.number(),
  avg_recent: z.number(),
  max_recent: z.number()
});
export type SubrequestMetrics = z.infer<typeof SubrequestMetricsSchema>;

export const EnhancedHealthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded', 'error', 'circuit_open']),
  timestamp: z.number(),
  sync_state: SyncStateSchema.nullable().optional(),
  syncState: SyncStateSchema.nullable().optional(), // Alias de retrocompatibilidad para apps/web/src/App.tsx y API existente
  recent_runs: z.array(SyncRunSchema),
  lastRun: SyncRunSchema.nullable().optional(), // Alias de retrocompatibilidad para API existente
  failure_rate: z.number(),
  subrequests: SubrequestMetricsSchema
});
export type EnhancedHealthResponse = z.infer<typeof EnhancedHealthResponseSchema>;

// ============================================================================
// 6. SECURE FILE PROXY SCHEMAS & TYPES (GET /api/files/proxy)
// ============================================================================

export const FileProxyQuerySchema = z.object({
  url: z.string().url('URL inválida').refine((val) => {
    try {
      const parsed = new URL(val);
      // 1. Protocolo estrictamente HTTPS
      if (parsed.protocol !== 'https:') return false;
      // 2. Hostname exactamente catedig.itlalaguna.edu.mx (en minúsculas)
      if (parsed.hostname.toLowerCase() !== 'catedig.itlalaguna.edu.mx') return false;
      // 3. Puerto estrictamente estándar HTTPS (443 o vacío)
      if (parsed.port !== '' && parsed.port !== '443') return false;
      // 4. Sin credenciales de usuario (userinfo)
      if (parsed.username || parsed.password) return false;
      // 5. Pathname delimitado que empiece con /webservice/pluginfile.php
      const pathname = parsed.pathname;
      if (pathname !== '/webservice/pluginfile.php' && !pathname.startsWith('/webservice/pluginfile.php/')) {
        return false;
      }
      // 6. Rechazo explícito de secuencias peligrosas de doble codificación y anidamiento
      // Bloquea %252e (.), %252f (/), %255c (\), %2500 (null), %250d/%250a (CRLF), %2525 (anidado)
      if (/%25(?:2e|2f|5c|00|0d|0a|1f|7f|25)/i.test(val)) {
        return false;
      }
      // 7. Decodificación de primer nivel sobre la URL completa (detecta percent-encoding malformado)
      let decodedVal: string;
      try {
        decodedVal = decodeURIComponent(val);
      } catch {
        return false;
      }
      // 8. Decodificación iterativa profunda (hasta 3 niveles para revelar evasiones encubiertas)
      const stages: string[] = [val, decodedVal];
      let current = decodedVal;
      for (let i = 0; i < 3; i++) {
        try {
          const next = decodeURIComponent(current);
          if (next === current) break;
          stages.push(next);
          current = next;
        } catch {
          // Si una decodificación posterior falla, indica un '%' literal seguido de caracteres no hexadecimales
          // (ej. "eval_100%.pdf"). Esto es seguro y detiene la iteración sin rechazar la URL.
          break;
        }
      }
      // 9. Verificación estricta anti-traversal, control chars y backslashes en todas las etapas
      for (const stage of stages) {
        if (stage.includes('..')) return false;
        if (/[\x00-\x1F\x7F]/.test(stage)) return false;
        if (stage.includes('\\')) return false;
      }
      // Doble verificación sobre pathname de WHATWG
      if (pathname.includes('..') || pathname.includes('\\')) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }, {
    message: 'URL rechazada: debe ser HTTPS, host catedig.itlalaguna.edu.mx y ruta /webservice/pluginfile.php'
  })
});
export type FileProxyQuery = z.infer<typeof FileProxyQuerySchema>;

// ============================================================================
// 7. API ERROR SCHEMAS & TYPES (Standard Error Responses)
// ============================================================================

export const ApiErrorResponseSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  details: z.unknown().optional(),
  status: z.string().optional()
});
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

// ============================================================================
// 8. WEB PUSH SCHEMAS & TYPES (Phase 4)
// ============================================================================

export const PushSubscriptionKeysSchema = z.object({
  p256dh: z.string().min(1, 'Clave p256dh requerida'),
  auth: z.string().min(1, 'Secreto auth requerido')
});
export type PushSubscriptionKeys = z.infer<typeof PushSubscriptionKeysSchema>;

export const PushSubscribeBodySchema = z.object({
  endpoint: z.string().url('Endpoint de suscripción inválido'),
  keys: PushSubscriptionKeysSchema,
  userAgent: z.string().max(512).optional()
});
export type PushSubscribeBody = z.infer<typeof PushSubscribeBodySchema>;

export const PushUnsubscribeBodySchema = z.object({
  endpoint: z.string().url('Endpoint de suscripción inválido')
});
export type PushUnsubscribeBody = z.infer<typeof PushUnsubscribeBodySchema>;

export const PushStatusResponseSchema = z.object({
  configured: z.boolean(),
  public_key: z.string().nullable(),
  subscription_count: z.number().int().nonnegative()
});
export type PushStatusResponse = z.infer<typeof PushStatusResponseSchema>;
