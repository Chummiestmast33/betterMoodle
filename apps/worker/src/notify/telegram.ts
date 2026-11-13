export interface SyncChange {
  kind: 'new' | 'due_changed' | 'updated';
  itemType: 'assignment' | 'grade' | 'announcement';
  courseName: string;
  title: string;
  dueDate?: number | null;
  gradeNum?: number | null;
  url?: string | null;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatUnixDate(unixSeconds?: number | null): string {
  if (!unixSeconds) return 'Sin fecha límite';
  return new Date(unixSeconds * 1000).toLocaleString('es-MX', {
    timeZone: 'America/Monterrey',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

const CHANGE_META: Record<
  `${SyncChange['itemType']}:${SyncChange['kind']}`,
  { icon: string; label: string }
> = {
  'assignment:new': { icon: '🆕', label: 'Nueva tarea' },
  'assignment:due_changed': { icon: '📅', label: 'Cambio de fecha / prórroga' },
  'assignment:updated': { icon: '📝', label: 'Tarea actualizada' },
  'grade:new': { icon: '📊', label: 'Nueva calificación' },
  'grade:due_changed': { icon: '📊', label: 'Calificación actualizada' },
  'grade:updated': { icon: '📊', label: 'Calificación actualizada' },
  'announcement:new': { icon: '📢', label: 'Nuevo aviso' },
  'announcement:due_changed': { icon: '📢', label: 'Aviso actualizado' },
  'announcement:updated': { icon: '📢', label: 'Aviso actualizado' },
};

export function formatAggregatedAlert(changes: SyncChange[]): string {
  const count = changes.length;
  const header = `🔔 <b>BetterMoodle: ${count} ${count === 1 ? 'novedad' : 'novedades'}</b>\n`;

  const lines = changes.slice(0, 15).map((ch) => {
    const { icon, label } = CHANGE_META[`${ch.itemType}:${ch.kind}`];
    const title = ch.url
      ? `<a href="${escapeHtml(ch.url)}">${escapeHtml(ch.title)}</a>`
      : escapeHtml(ch.title);

    const details: string[] = [];
    if (ch.itemType === 'grade' && ch.gradeNum !== null && ch.gradeNum !== undefined) {
      details.push(`   🎯 Calificación: <b>${ch.gradeNum}</b>`);
    }
    if (ch.dueDate) {
      details.push(`   ⏰ ${formatUnixDate(ch.dueDate)}`);
    }

    const extra = details.length > 0 ? `\n${details.join('\n')}` : '';
    return `${icon} <b>${label}</b> (${escapeHtml(ch.courseName)})\n   ${title}${extra}`;
  });

  if (changes.length > 15) {
    lines.push(`\n... y ${changes.length - 15} novedades más.`);
  }

  return `${header}\n${lines.join('\n\n')}`;
}

export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  htmlText: string
): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: htmlText,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Telegram API ${res.status}: ${errBody}`);
  }
}
