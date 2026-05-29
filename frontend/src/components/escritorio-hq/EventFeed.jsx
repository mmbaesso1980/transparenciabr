/**
 * EventFeed.jsx — Feed ao vivo dos últimos eventos do maestro_audit_log
 *
 * Mostra os últimos 20 eventos com tool, timestamp relativo, latência e custo.
 */

const TOOL_EMOJI = {
  telegram_send:    '📨',
  vertex_invoke:    '🧠',
  firestore_write:  '💾',
  firestore_read:   '🔎',
  github_edit_file: '🐙',
  shell_exec:       '⚙️',
  snapshot_firestore: '📸',
  memory_recall:    '🧩',
  memory_write:     '📝',
  task_complete:    '✅',
  web_search:       '🌐',
  fetch_url:        '🔗',
  subagent_spawn:   '👥',
  load_skill_runtime: '📚',
  cron_schedule:    '⏰',
  browser_task_remote: '🖥️',
  confirm_action:   '❓',
  notify_push:      '🔔',
  directdata_call:  '🏦',
};

function relativeTime(iso) {
  if (!iso) return '?';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60000) return `${Math.floor(ms / 1000)}s atrás`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}min atrás`;
  if (ms < 86400000) return `${Math.floor(ms / 3600000)}h atrás`;
  return `${Math.floor(ms / 86400000)}d atrás`;
}

export default function EventFeed({ events = [], maxItems = 20 }) {
  const visible = events.slice(0, maxItems);

  return (
    <div style={{
      background: '#0D1E1E',
      border: '1px solid #01696F',
      borderRadius: 8,
      padding: 12,
      fontFamily: 'Inter, sans-serif',
      color: '#E5E7EB',
      fontSize: 12,
      maxHeight: 400,
      overflowY: 'auto',
    }}>
      <h4 style={{ margin: '0 0 8px', color: '#C9A227', fontSize: 13 }}>
        📡 Audit log live ({visible.length})
      </h4>

      {visible.length === 0 ? (
        <div style={{ color: '#9CA3AF', fontStyle: 'italic', textAlign: 'center', padding: 20 }}>
          Sem eventos ainda. O Maestro está descansando.
        </div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {visible.map((ev) => (
            <li
              key={ev.id}
              style={{
                padding: '6px 0',
                borderBottom: '1px solid #1a2a2a',
                display: 'grid',
                gridTemplateColumns: '24px 1fr auto',
                gap: 8,
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: 16 }}>
                {TOOL_EMOJI[ev.tool] || '•'}
              </span>
              <span>
                <strong style={{ color: '#01a89c' }}>{ev.tool || 'unknown'}</strong>
                <br />
                <span style={{ color: '#9CA3AF', fontSize: 10 }}>
                  {relativeTime(ev.timestamp)}
                  {ev.latency_ms ? ` · ${ev.latency_ms}ms` : ''}
                </span>
              </span>
              {ev.cost_brl > 0 && (
                <span style={{ color: '#C9A227', fontSize: 11 }}>
                  R$ {Number(ev.cost_brl).toFixed(3)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
