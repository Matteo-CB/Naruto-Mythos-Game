'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { CloudBackground } from '@/components/CloudBackground';
import { Footer } from '@/components/Footer';

interface Report {
  id: string;
  targetType: string;
  postId: string | null;
  messageId: string | null;
  reporterName: string;
  authorName: string | null;
  content: string;
  reason: string | null;
  createdAt: string;
}

interface Scan {
  id: string;
  userId: string;
  username: string;
  message: string;
  topCategory: string;
  topScore: number;
  action: string;
  createdAt: string;
}

export default function AdminPostModerationPage() {
  const t = useTranslations('adminPostModeration');
  const [reports, setReports] = useState<Report[]>([]);
  const [scans, setScans] = useState<Scan[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    fetch('/api/admin/post-moderation')
      .then((res) => { if (res.status === 403) { setForbidden(true); return { reports: [], scans: [] }; } return res.json(); })
      .then((d) => { setReports(d.reports ?? []); setScans(d.scans ?? []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const act = async (body: Record<string, unknown>, key: string) => {
    setBusy(key);
    try {
      const res = await fetch('/api/admin/post-moderation', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) {
        if (body.action === 'resolveReport') setReports((r) => r.filter((x) => x.id !== body.reportId));
        else if (body.action === 'resolveScan') setScans((s) => s.filter((x) => x.id !== body.scanId));
        else if (body.action === 'deletePost') setReports((r) => r.filter((x) => x.postId !== body.postId));
      }
    } catch { /* ignore */ } finally { setBusy(null); }
  };

  if (forbidden) {
    return <main className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0a0a0a' }}><p style={{ color: '#b33e3e' }}>{t('unauthorized')}</p></main>;
  }

  return (
    <main className="min-h-screen relative" style={{ backgroundColor: '#0a0a0a', color: '#e8e8e8' }}>
      <CloudBackground />
      <div className="relative z-10 max-w-4xl mx-auto px-4 py-8">
        <Link href="/admin" style={{ color: '#c4a35a', fontSize: 14 }}>{t('back')}</Link>
        <h1 className="mt-4" style={{ fontFamily: 'NJNaruto, sans-serif', fontSize: 28, letterSpacing: 1 }}>{t('title')}</h1>
        <p className="mt-2" style={{ color: '#9a9a9a', fontSize: 14, maxWidth: 640 }}>{t('subtitle')}</p>

        {loading ? <p className="mt-8" style={{ color: '#9a9a9a' }}>{t('loading')}</p> : (
          <>
            <section className="mt-8">
              <h2 style={{ fontFamily: 'NJNaruto, sans-serif', fontSize: 20, color: '#c4a35a', marginBottom: 12 }}>{t('reports')} <span style={{ color: '#6a6a70', fontSize: 14 }}>{reports.length}</span></h2>
              {reports.length === 0 ? <p style={{ color: '#6a6a70', fontSize: 13 }}>{t('noReports')}</p> : (
                <div className="space-y-2">
                  {reports.map((r) => (
                    <div key={r.id} className="p-3" style={{ backgroundColor: '#111111' }}>
                      <div className="flex items-center gap-2 text-[11px]" style={{ color: '#7a7a7a' }}>
                        <span style={{ color: '#c4a35a' }}>{r.targetType === 'message' ? t('typeMessage') : t('typePost')}</span>
                        <span>· {t('by')} {r.authorName ?? '?'}</span>
                        <span>· {t('reportedBy')} {r.reporterName}</span>
                      </div>
                      <p className="mt-1.5 text-sm whitespace-pre-wrap break-words" style={{ color: '#d8d6cf' }}>{r.content || <em style={{ color: '#666' }}>{t('noText')}</em>}</p>
                      {r.reason && <p className="mt-1 text-[11px]" style={{ color: '#8a8a8a' }}>{t('reason')}: {r.reason}</p>}
                      <div className="mt-2 flex gap-2">
                        <button type="button" disabled={busy !== null} onClick={() => act({ action: 'resolveReport', reportId: r.id }, r.id)} className="text-[11px] uppercase tracking-wider px-3 py-1" style={{ backgroundColor: 'rgba(62,139,62,0.12)', color: '#7fbf7f' }}>{t('resolve')}</button>
                        {r.postId && <button type="button" disabled={busy !== null} onClick={() => act({ action: 'deletePost', postId: r.postId }, r.id)} className="text-[11px] uppercase tracking-wider px-3 py-1" style={{ backgroundColor: 'rgba(179,62,62,0.12)', color: '#c26a6a' }}>{t('deletePost')}</button>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="mt-8">
              <h2 style={{ fontFamily: 'NJNaruto, sans-serif', fontSize: 20, color: '#c4a35a', marginBottom: 12 }}>{t('aiScans')} <span style={{ color: '#6a6a70', fontSize: 14 }}>{scans.length}</span></h2>
              {scans.length === 0 ? <p style={{ color: '#6a6a70', fontSize: 13 }}>{t('noScans')}</p> : (
                <div className="space-y-2">
                  {scans.map((s) => (
                    <div key={s.id} className="p-3" style={{ backgroundColor: '#111111' }}>
                      <div className="flex items-center gap-2 text-[11px]" style={{ color: '#7a7a7a' }}>
                        <span style={{ color: s.action === 'blocked' ? '#c26a6a' : '#c4a35a' }}>{s.action}</span>
                        <span>· {s.username}</span>
                        <span>· {s.topCategory} {(s.topScore * 100).toFixed(0)}%</span>
                      </div>
                      <p className="mt-1.5 text-sm whitespace-pre-wrap break-words" style={{ color: '#d8d6cf' }}>{s.message}</p>
                      <div className="mt-2">
                        <button type="button" disabled={busy !== null} onClick={() => act({ action: 'resolveScan', scanId: s.id }, s.id)} className="text-[11px] uppercase tracking-wider px-3 py-1" style={{ backgroundColor: 'rgba(62,139,62,0.12)', color: '#7fbf7f' }}>{t('resolve')}</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
      <Footer />
    </main>
  );
}
