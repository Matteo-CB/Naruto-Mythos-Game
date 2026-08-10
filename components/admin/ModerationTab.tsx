'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { SANCTION_DURATIONS, HOUR_MS, DAY_MS, type SanctionType } from '@/lib/moderation/sanctions';

interface AdminReport {
  id: string;
  reporterId: string;
  reporterName: string;
  targetId: string;
  targetName: string;
  reason: string;
  context: string;
  roomCode: string | null;
  attachedMessage: string | null;
  status: string;
  createdAt: string;
}

interface PlayerFile {
  user: { id: string; username: string; elo: number; createdAt: string; chatVisibility: string; usernameResetRequired: boolean };
  sanctions: Array<{ id: string; type: string; reason: string; issuedByName: string; expiresAt: number | null; revokedAt: number | null; createdAt: number; reportId: string | null }>;
  reportsReceived: AdminReport[];
  reportsFiled: AdminReport[];
  messages: Array<{ id: string; source: 'game' | 'dm'; text: string; roomCode: string | null; createdAt: number }>;
}

const SANCTIONABLE_TYPES: SanctionType[] = [
  'warn', 'warn_severe', 'mute_chat', 'shadow_mute', 'ranked_ban', 'suspension', 'spectate_ban', 'name_reset', 'elo_adjust',
];

function durationLabel(ms: number | null): string {
  if (ms === null) return 'permanent';
  if (ms >= 30 * DAY_MS) return '30j';
  if (ms >= 7 * DAY_MS) return '7j';
  if (ms >= DAY_MS) return '24h';
  if (ms >= HOUR_MS) return '1h';
  return `${Math.round(ms / 60000)}min`;
}

const panelStyle = { backgroundColor: 'var(--t-panel)', border: '1px solid var(--t-border)' } as const;

export function ModerationTab() {
  const t = useTranslations('adminModeration');
  const [statusFilter, setStatusFilter] = useState<'pending' | 'resolved' | 'dismissed'>('pending');
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ id: string; username: string; elo: number }>>([]);
  const [file, setFile] = useState<PlayerFile | null>(null);
  const [fileReportId, setFileReportId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [sType, setSType] = useState<SanctionType>('warn');
  const [sDuration, setSDuration] = useState<number | null>(null);
  const [sReason, setSReason] = useState('');

  interface AutoScan {
    id: string;
    userId: string;
    username: string;
    message: string;
    topCategory: string;
    topScore: number;
    action: string;
    status?: string | null;
    handledByName?: string | null;
    createdAt: string;
  }
  const [scans, setScans] = useState<AutoScan[]>([]);
  const [scanFilter, setScanFilter] = useState<'pending' | 'handled'>('pending');
  const [fileScanId, setFileScanId] = useState<string | null>(null);

  const loadScans = useCallback((filter: 'pending' | 'handled') => {
    fetch(`/api/admin/moderation/auto-scans?status=${filter}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { scans: [] }))
      .then((data) => setScans(data.scans ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => { loadScans(scanFilter); }, [scanFilter, loadScans]);

  const resolveScan = useCallback(async (scanId: string) => {
    try {
      await fetch('/api/admin/moderation/auto-scans/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ scanId }),
      });
    } catch { }
    loadScans(scanFilter);
  }, [loadScans, scanFilter]);

  const loadReports = useCallback((status: 'pending' | 'resolved' | 'dismissed') => {
    setLoading(true);
    fetch(`/api/admin/moderation/reports?status=${status}`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { reports: [] }))
      .then((data) => { setReports(data.reports ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { loadReports(statusFilter); }, [statusFilter, loadReports]);

  const openFile = useCallback(async (userId: string, reportId: string | null, scanId: string | null = null) => {
    setFeedback(null);
    setFileReportId(reportId);
    setFileScanId(scanId);
    try {
      const res = await fetch(`/api/admin/moderation/player/${encodeURIComponent(userId)}`, { credentials: 'include' });
      if (res.ok) setFile(await res.json());
    } catch { }
  }, []);

  const runSearch = async () => {
    if (search.trim().length < 2) return;
    try {
      const res = await fetch(`/api/admin/players?search=${encodeURIComponent(search.trim())}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setSearchResults((data.players ?? []).slice(0, 8));
      }
    } catch { }
  };

  const applySanction = async () => {
    if (!file || busy || sReason.trim().length < 3) return;
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/moderation/sanction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          userId: file.user.id,
          type: sType,
          durationMs: SANCTION_DURATIONS[sType].length === 0 ? null : sDuration,
          reason: sReason.trim(),
          reportId: fileReportId,
        }),
      });
      if (res.ok) {
        setFeedback(t('applied'));
        setSReason('');
        if (fileScanId) {
          await resolveScan(fileScanId);
          setFileScanId(null);
        }
        await openFile(file.user.id, null);
        loadReports(statusFilter);
      } else {
        const data = await res.json().catch(() => ({}));
        setFeedback(data?.error ?? 'error');
      }
    } catch {
      setFeedback('error');
    }
    setBusy(false);
  };

  const dismissReport = async (reportId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await fetch('/api/admin/moderation/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reportId }),
      });
      loadReports(statusFilter);
    } catch { }
    setBusy(false);
  };

  const revoke = async (sanctionId: string) => {
    if (!file || busy) return;
    setBusy(true);
    try {
      await fetch('/api/admin/moderation/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ sanctionId }),
      });
      await openFile(file.user.id, fileReportId);
    } catch { }
    setBusy(false);
  };

  const deleteMessage = async (source: 'game' | 'dm', messageId: string) => {
    if (!file || busy) return;
    setBusy(true);
    try {
      await fetch('/api/admin/moderation/delete-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ source, messageId, reason: sReason.trim() || 'moderation' }),
      });
      await openFile(file.user.id, fileReportId);
    } catch { }
    setBusy(false);
  };

  const availableDurations = SANCTION_DURATIONS[sType];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 p-4" style={panelStyle}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') runSearch(); }}
          placeholder={t('searchPlaceholder')}
          className="px-3 py-2 text-[12px] outline-none flex-1 min-w-[180px]"
          style={{ backgroundColor: 'var(--t-divider)', border: '1px solid var(--t-border)', color: 'var(--t-text)' }}
        />
        <button onClick={runSearch} className="px-4 py-2 text-[11px] font-bold uppercase cursor-pointer" style={{ backgroundColor: 'var(--t-accent)', color: 'var(--t-bg)', border: 'none' }}>
          {t('search')}
        </button>
        {searchResults.map((u) => (
          <button
            key={u.id}
            onClick={() => { setSearchResults([]); openFile(u.id, null); }}
            className="px-3 py-1.5 text-[11px] cursor-pointer"
            style={{ backgroundColor: 'var(--t-accent-glow)', color: 'var(--t-accent)', border: 'none' }}
          >
            {u.username} ({u.elo})
          </button>
        ))}
      </div>

      {file && (
        <div className="flex flex-col gap-3 p-4" style={panelStyle}>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-sm font-bold" style={{ color: 'var(--t-accent)' }}>
              {file.user.username} <span style={{ color: 'var(--t-dim)' }}>ELO {file.user.elo}</span>
            </span>
            <button onClick={() => { setFile(null); setFileReportId(null); setFileScanId(null); }} className="px-3 py-1 text-[11px] cursor-pointer" style={{ backgroundColor: 'var(--t-divider)', color: 'var(--t-muted)', border: 'none' }}>
              X
            </button>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase" style={{ color: 'var(--t-muted)' }}>{t('sanctionType')}</span>
              <select
                value={sType}
                onChange={(e) => { const v = e.target.value as SanctionType; setSType(v); setSDuration(SANCTION_DURATIONS[v][0] ?? null); }}
                className="px-2 py-2 text-[12px]"
                style={{ backgroundColor: 'var(--t-surface-2)', color: 'var(--t-text)', border: '1px solid var(--t-border)' }}
              >
                {SANCTIONABLE_TYPES.map((ty) => (
                  <option key={ty} value={ty}>{t(`types.${ty}`)}</option>
                ))}
              </select>
            </div>
            {availableDurations.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase" style={{ color: 'var(--t-muted)' }}>{t('duration')}</span>
                <select
                  value={sDuration === null ? 'null' : String(sDuration)}
                  onChange={(e) => setSDuration(e.target.value === 'null' ? null : Number(e.target.value))}
                  className="px-2 py-2 text-[12px]"
                  style={{ backgroundColor: 'var(--t-surface-2)', color: 'var(--t-text)', border: '1px solid var(--t-border)' }}
                >
                  {availableDurations.map((d) => (
                    <option key={String(d)} value={d === null ? 'null' : String(d)}>{durationLabel(d)}</option>
                  ))}
                </select>
              </div>
            )}
            <input
              value={sReason}
              onChange={(e) => setSReason(e.target.value.slice(0, 300))}
              placeholder={t('reasonPlaceholder')}
              className="px-3 py-2 text-[12px] outline-none flex-1 min-w-[200px]"
              style={{ backgroundColor: 'var(--t-divider)', border: '1px solid var(--t-border)', color: 'var(--t-text)' }}
            />
            <button
              onClick={applySanction}
              disabled={busy || sReason.trim().length < 3}
              className="px-4 py-2 text-[11px] font-bold uppercase cursor-pointer disabled:opacity-40"
              style={{ backgroundColor: 'var(--t-danger)', color: 'var(--t-on-danger)', border: 'none' }}
            >
              {t('apply')}
            </button>
            {fileReportId && (
              <span className="text-[10px]" style={{ color: 'var(--t-accent)' }}>{t('linkedToReport')}</span>
            )}
            {fileScanId && (
              <span className="text-[10px]" style={{ color: 'var(--t-accent)' }}>{t('linkedToScan')}</span>
            )}
          </div>
          {sType === 'elo_adjust' && (
            <p className="text-[10px]" style={{ color: 'var(--t-muted)' }}>{t('eloAdjustHint')}</p>
          )}
          {feedback && <p className="text-[11px]" style={{ color: 'var(--t-accent)' }}>{feedback}</p>}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] uppercase font-bold mb-1.5" style={{ color: 'var(--t-muted)' }}>{t('history')} ({file.sanctions.length})</p>
              <div className="max-h-56 overflow-y-auto flex flex-col gap-1">
                {file.sanctions.length === 0 && <p className="text-[11px]" style={{ color: 'var(--t-dim)' }}>{t('cleanRecord')}</p>}
                {file.sanctions.map((sc) => {
                  const active = !sc.revokedAt && (sc.expiresAt === null || sc.expiresAt > Date.now());
                  const stateful = ['mute_chat', 'shadow_mute', 'ranked_ban', 'suspension', 'spectate_ban'].includes(sc.type);
                  return (
                    <div key={sc.id} className="flex items-start gap-2 px-2 py-1.5" style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
                      <div className="flex-1 min-w-0">
                        <span className="text-[11px] font-bold" style={{ color: sc.revokedAt ? 'var(--t-dim)' : 'var(--t-text)' }}>
                          {t(`types.${sc.type}`)}
                        </span>
                        <span className="text-[10px] ml-2" style={{ color: 'var(--t-dim)' }}>
                          {new Date(sc.createdAt).toLocaleString()} · {sc.issuedByName}
                          {sc.expiresAt ? ` · ${new Date(sc.expiresAt).toLocaleString()}` : ''}
                          {sc.revokedAt ? ` · ${t('revoked')}` : ''}
                        </span>
                        <p className="text-[10px] truncate" style={{ color: 'var(--t-muted)' }}>{sc.reason}</p>
                      </div>
                      {stateful && active && (
                        <button onClick={() => revoke(sc.id)} disabled={busy} className="text-[9px] uppercase font-bold cursor-pointer shrink-0 px-2 py-1 disabled:opacity-40" style={{ backgroundColor: 'var(--t-accent-glow)', color: 'var(--t-accent)', border: 'none' }}>
                          {t('revoke')}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold mb-1.5" style={{ color: 'var(--t-muted)' }}>{t('lastMessages')} ({file.messages.length})</p>
              <div className="max-h-56 overflow-y-auto flex flex-col gap-1">
                {file.messages.map((m) => (
                  <div key={`${m.source}-${m.id}`} className="flex items-start gap-2 px-2 py-1" style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
                    <span className="text-[9px] uppercase shrink-0 font-bold" style={{ color: m.source === 'dm' ? '#5A7ABB' : 'var(--t-accent)' }}>{m.source}</span>
                    <span className="text-[11px] flex-1 min-w-0" style={{ color: 'var(--t-muted)', overflowWrap: 'anywhere' }}>{m.text}</span>
                    <button onClick={() => deleteMessage(m.source, m.id)} disabled={busy} className="text-[9px] uppercase cursor-pointer shrink-0 disabled:opacity-40" style={{ color: 'var(--t-danger)', background: 'none', border: 'none' }}>
                      {t('deleteMessage')}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            <p className="text-[10px] uppercase font-bold mb-1.5" style={{ color: 'var(--t-muted)' }}>
              {t('reportsAgainst')} ({file.reportsReceived.length}) · {t('reportsBy')} ({file.reportsFiled.length})
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        {(['pending', 'resolved', 'dismissed'] as const).map((st) => (
          <button
            key={st}
            onClick={() => setStatusFilter(st)}
            className="px-4 py-2 text-[11px] font-bold uppercase cursor-pointer"
            style={{
              backgroundColor: statusFilter === st ? 'var(--t-accent)' : 'rgba(255,255,255,0.03)',
              color: statusFilter === st ? 'var(--t-bg)' : 'var(--t-muted)',
              border: 'none',
            }}
          >
            {t(`status.${st}`)}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-[12px]" style={{ color: 'var(--t-dim)' }}>...</p>
      ) : reports.length === 0 ? (
        <p className="text-[12px] p-4" style={{ ...panelStyle, color: 'var(--t-dim)' }}>{t('noReports')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {reports.map((r) => (
            <div key={r.id} className="flex flex-col gap-1.5 p-4" style={panelStyle}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-[12px]" style={{ color: 'var(--t-text)' }}>
                  <span style={{ color: 'var(--t-muted)' }}>{r.reporterName}</span>
                  <span style={{ color: 'var(--t-dim)' }}> &#x25B8; </span>
                  <span className="font-bold" style={{ color: 'var(--t-accent)' }}>{r.targetName}</span>
                </span>
                <span className="text-[10px]" style={{ color: 'var(--t-dim)' }}>
                  {t(`context.${r.context}`)} · {new Date(r.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="text-[12px]" style={{ color: 'var(--t-muted)' }}>{r.reason}</p>
              {r.attachedMessage && (
                <p className="text-[11px] px-2 py-1.5" style={{ backgroundColor: 'rgba(179,62,62,0.06)', color: '#d0a0a0', overflowWrap: 'anywhere' }}>
                  {r.attachedMessage}
                </p>
              )}
              {r.status === 'pending' && (
                <div className="flex items-center gap-2 mt-1">
                  <button
                    onClick={() => openFile(r.targetId, r.id)}
                    className="px-3 py-1.5 text-[10px] font-bold uppercase cursor-pointer"
                    style={{ backgroundColor: 'var(--t-accent)', color: 'var(--t-bg)', border: 'none' }}
                  >
                    {t('openFile')}
                  </button>
                  <button
                    onClick={() => dismissReport(r.id)}
                    disabled={busy}
                    className="px-3 py-1.5 text-[10px] font-bold uppercase cursor-pointer disabled:opacity-40"
                    style={{ backgroundColor: 'var(--t-divider)', color: 'var(--t-muted)', border: 'none' }}
                  >
                    {t('dismiss')}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          <p className="text-[11px] uppercase font-bold" style={{ color: 'var(--t-accent)' }}>
            {t('autoScansTitle')}
          </p>
          {(['pending', 'handled'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setScanFilter(f)}
              className="px-3 py-1.5 text-[10px] font-bold uppercase cursor-pointer"
              style={{
                backgroundColor: scanFilter === f ? 'var(--t-accent)' : 'rgba(255,255,255,0.03)',
                color: scanFilter === f ? 'var(--t-bg)' : 'var(--t-muted)',
                border: 'none',
              }}
            >
              {f === 'pending' ? t('autoStatusPending') : t('autoStatusHandled')}
            </button>
          ))}
        </div>
        {scans.length === 0 ? (
          <p className="text-[12px] p-4" style={{ ...panelStyle, color: 'var(--t-dim)' }}>{t('autoScansEmpty')}</p>
        ) : (
          scans.map((s) => (
            <div key={s.id} className="flex flex-col gap-1.5 p-4" style={panelStyle}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-[12px]">
                  <span
                    className="font-bold cursor-pointer"
                    style={{ color: 'var(--t-accent)' }}
                    onClick={() => openFile(s.userId, null, s.id)}
                    data-gp="true"
                    role="button"
                    tabIndex={-1}
                  >
                    {s.username}
                  </span>
                  <span
                    className="ml-2 px-2 py-0.5 text-[10px] font-bold uppercase"
                    style={{
                      backgroundColor: s.action === 'flagged' ? 'rgba(196,163,90,0.12)' : 'rgba(179,62,62,0.14)',
                      color: s.action === 'flagged' ? 'var(--t-accent)' : 'var(--t-danger)',
                    }}
                  >
                    {s.action === 'blocked' ? t('autoActionBlocked') : s.action === 'removed' ? t('autoActionRemoved') : t('autoActionFlagged')}
                  </span>
                  {s.status === 'handled' && s.handledByName && (
                    <span className="ml-2 text-[10px]" style={{ color: 'var(--t-dim)' }}>
                      {t('autoHandledBy', { name: s.handledByName })}
                    </span>
                  )}
                </span>
                <span className="text-[10px]" style={{ color: 'var(--t-dim)' }}>
                  {s.topCategory} {Math.round(s.topScore * 100)}% · {new Date(s.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="text-[11px] px-2 py-1.5" style={{ backgroundColor: 'rgba(179,62,62,0.06)', color: '#d0a0a0', overflowWrap: 'anywhere' }}>
                {s.message}
              </p>
              {s.status !== 'handled' && (
                <div className="flex items-center gap-2 mt-1">
                  <button
                    onClick={() => openFile(s.userId, null, s.id)}
                    className="px-3 py-1.5 text-[10px] font-bold uppercase cursor-pointer"
                    style={{ backgroundColor: 'var(--t-accent)', color: 'var(--t-bg)', border: 'none' }}
                  >
                    {t('openFile')}
                  </button>
                  <button
                    onClick={() => resolveScan(s.id)}
                    disabled={busy}
                    className="px-3 py-1.5 text-[10px] font-bold uppercase cursor-pointer disabled:opacity-40"
                    style={{ backgroundColor: 'var(--t-divider)', color: 'var(--t-muted)', border: 'none' }}
                  >
                    {t('autoHandle')}
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
