import type {
  DashboardResponse,
  CourseContentsResponse,
  CourseGradesResponse,
  EnhancedHealthResponse,
  SyncedItem,
  PushStatusResponse,
} from '@better-moodle/shared';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let errMsg = `Error ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) errMsg = body.error;
    } catch {
      // ignorar si no es JSON
    }
    throw new Error(errMsg);
  }
  return res.json() as Promise<T>;
}

export function fetchDashboard(): Promise<DashboardResponse> {
  return fetchJson<DashboardResponse>('/api/dashboard');
}

export function fetchItems(type?: 'assignment' | 'grade' | 'announcement'): Promise<{ items: SyncedItem[] }> {
  const query = type ? `?type=${encodeURIComponent(type)}` : '';
  return fetchJson<{ items: SyncedItem[] }>(`/api/items${query}`);
}

export function fetchCourseContents(courseId: number): Promise<CourseContentsResponse> {
  return fetchJson<CourseContentsResponse>(`/api/courses/${courseId}/contents`);
}

export function fetchCourseGrades(courseId: number): Promise<CourseGradesResponse> {
  return fetchJson<CourseGradesResponse>(`/api/courses/${courseId}/grades`);
}

export function fetchHealth(): Promise<EnhancedHealthResponse> {
  return fetchJson<EnhancedHealthResponse>('/api/health');
}

export function triggerManualSync(): Promise<{
  status: string;
  coursesCount: number;
  itemsChanged: number;
  subrequestsUsed: number;
  error?: string;
}> {
  return fetchJson('/api/sync/manual', { method: 'POST' });
}

export function fetchPushStatus(): Promise<PushStatusResponse> {
  return fetchJson<PushStatusResponse>('/api/push/status');
}

export function subscribeWebPush(subscription: PushSubscriptionJSON): Promise<{ ok: boolean }> {
  return fetchJson('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      userAgent: navigator.userAgent,
    }),
  });
}

export function unsubscribeWebPush(endpoint: string): Promise<{ ok: boolean }> {
  return fetchJson('/api/push/unsubscribe', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  });
}

export function sendTestPush(endpoint?: string): Promise<{ sent: number; purged: number; failed: number }> {
  return fetchJson('/api/push/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  });
}
