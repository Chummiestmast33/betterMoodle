import type { SyncedItem } from '@better-moodle/shared';

export type TaskFilterState = 'all' | 'pending' | 'upcoming' | 'submitted' | 'overdue';

export function classifyTaskStatus(
  item: Pick<SyncedItem, 'due_date' | 'submission_status'>,
  nowSec: number
): Exclude<TaskFilterState, 'all'> {
  if (item.submission_status === 'submitted' || item.submission_status === 'graded') {
    return 'submitted';
  }
  if (item.due_date && item.due_date < nowSec) {
    return 'overdue';
  }
  if (item.due_date && item.due_date - nowSec <= 72 * 3600) {
    return 'upcoming';
  }
  return 'pending';
}

export function formatUnixDate(unixSec?: number | null): string {
  if (!unixSec) return 'Sin fecha límite';
  return new Date(unixSec * 1000).toLocaleString('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function formatCountdown(dueDate?: number | null, nowSec?: number): string {
  if (!dueDate) return 'Sin vencimiento';
  const ref = nowSec ?? Math.floor(Date.now() / 1000);
  const diff = dueDate - ref;
  const abs = Math.abs(diff);

  const days = Math.floor(abs / 86400);
  const hours = Math.floor((abs % 86400) / 3600);
  const mins = Math.floor((abs % 3600) / 60);

  const label =
    days > 0
      ? `${days}d ${hours}h`
      : hours > 0
      ? `${hours}h ${mins}m`
      : `${Math.max(1, mins)}m`;

  return diff < 0 ? `Venció hace ${label}` : `En ${label}`;
}

export function formatRelativeTime(unixSec?: number | null): string {
  if (!unixSec) return 'Nunca';
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - unixSec);
  if (diff < 60) return `hace ${diff}s`;
  if (diff < 3600) return `hace ${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`;
  return `hace ${Math.floor(diff / 86400)}d`;
}

export function formatFileSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function buildProxyFileUrl(fileurl: string): string {
  if (fileurl.startsWith('/api/files/proxy')) return fileurl;
  return `/api/files/proxy?url=${encodeURIComponent(fileurl)}`;
}

export function getMoodleDeepLink(item: Pick<SyncedItem, 'item_key' | 'item_type' | 'url' | 'course_id'>): string {
  if (item.url) return item.url;
  const base = 'https://catedig.itlalaguna.edu.mx';
  if (item.item_key.startsWith('assign_')) {
    const cmid = item.item_key.replace('assign_', '');
    return `${base}/mod/assign/view.php?id=${cmid}`;
  }
  if (item.item_key.startsWith('discussion_')) {
    const did = item.item_key.replace('discussion_', '');
    return `${base}/mod/forum/discuss.php?d=${did}`;
  }
  return `${base}/course/view.php?id=${item.course_id}`;
}
