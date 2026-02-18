'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { CloudBackground } from '@/components/CloudBackground';
import { Footer } from '@/components/Footer';

const ADMIN_EMAIL = 'matteo.biyikli3224@gmail.com';

interface BugReport {
  id: string;
  userId: string | null;
  username: string | null;
  description: string;
  imageData: string | null;
  status: string;
  createdAt: string;
}

type FilterStatus = 'all' | 'open' | 'fixed' | 'wontfix';

export default function AdminBugsPage() {
  const t = useTranslations();
  const { data: session } = useSession();
  const [reports, setReports] = useState<BugReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  useEffect(() => {
    if (session?.user?.email === ADMIN_EMAIL) {
      fetchReports();
    }
  }, [session]);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/bugs');
      const data = await res.json();
      if (res.ok) {
        setReports(data.reports ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/bugs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setReports((prev) =>
          prev.map((r) => (r.id === id ? { ...r, status } : r)),
        );
      }
    } catch {
      // ignore
    }
  };

  const deleteReport = async (id: string) => {
    try {
      const res = await fetch(`/api/bugs/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setReports((prev) => prev.filter((r) => r.id !== id));
      }
    } catch {
      // ignore
    }
  };

  // Not admin
  if (!session?.user?.email || session.user.email !== ADMIN_EMAIL) {
    return (
      <div className="flex min-h-screen relative flex-col" style={{ backgroundColor: '#0a0a0a' }}>
        <CloudBackground />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="flex flex-col items-center gap-4 relative z-10">
            <p className="text-sm" style={{ color: '#b33e3e' }}>
              {t('bugReport.admin.forbidden')}
            </p>
            <Link
              href="/"
              className="px-6 py-2.5 text-sm"
              style={{ backgroundColor: '#141414', border: '1px solid #262626', color: '#888888' }}
            >
              {t('common.back')}
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const filtered = filter === 'all' ? reports : reports.filter((r) => r.status === filter);

  const statusColor = (status: string) => {
    switch (status) {
      case 'open': return '#c4a35a';
      case 'fixed': return '#4a9e4a';
      case 'wontfix': return '#888888';
      default: return '#888888';
    }
  };

  const counts = {
    all: reports.length,
    open: reports.filter((r) => r.status === 'open').length,
    fixed: reports.filter((r) => r.status === 'fixed').length,
    wontfix: reports.filter((r) => r.status === 'wontfix').length,
  };

  return (
    <div className="flex min-h-screen relative flex-col" style={{ backgroundColor: '#0a0a0a' }}>
      <CloudBackground />

      {/* Expanded image modal */}
      {expandedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-8"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.9)' }}
          onClick={() => setExpandedImage(null)}
        >
          <img
            src={expandedImage}
            alt="Bug screenshot"
            className="max-w-full max-h-full object-contain rounded"
          />
        </div>
      )}

      <div className="flex-1 flex flex-col items-center px-4 py-8 relative z-10">
        <div className="w-full max-w-4xl flex flex-col gap-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold tracking-wider uppercase" style={{ color: '#c4a35a' }}>
              {t('bugReport.admin.title')}
            </h1>
            <Link
              href="/"
              className="px-4 py-2 text-xs"
              style={{ backgroundColor: '#141414', border: '1px solid #262626', color: '#888888' }}
            >
              {t('common.back')}
            </Link>
          </div>

          {/* Filter tabs */}
          <div className="flex gap-2">
            {(['all', 'open', 'fixed', 'wontfix'] as FilterStatus[]).map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider transition-colors"
                style={{
                  backgroundColor: filter === s ? '#1a1a1a' : '#0a0a0a',
                  borderBottom: filter === s ? `2px solid ${s === 'all' ? '#c4a35a' : statusColor(s)}` : '2px solid transparent',
                  color: filter === s ? '#e0e0e0' : '#555555',
                }}
              >
                {t(`bugReport.admin.filter.${s}`)} ({counts[s]})
              </button>
            ))}
          </div>

          {/* Reports list */}
          {loading ? (
            <p className="text-sm" style={{ color: '#888888' }}>{t('common.loading')}</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm" style={{ color: '#555555' }}>{t('bugReport.admin.noReports')}</p>
          ) : (
            <div className="flex flex-col gap-3">
              {filtered.map((report) => (
                <div
                  key={report.id}
                  className="rounded-lg p-4 flex flex-col gap-3"
                  style={{ backgroundColor: '#141414', border: '1px solid #262626' }}
                >
                  {/* Header row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span
                        className="px-2 py-0.5 text-xs font-bold uppercase rounded"
                        style={{
                          backgroundColor: `${statusColor(report.status)}20`,
                          color: statusColor(report.status),
                          border: `1px solid ${statusColor(report.status)}40`,
                        }}
                      >
                        {t(`bugReport.admin.status.${report.status}`)}
                      </span>
                      <span className="text-xs" style={{ color: '#888888' }}>
                        {report.username || 'Anonymous'}
                      </span>
                      <span className="text-xs" style={{ color: '#333333' }}>
                        {new Date(report.createdAt).toLocaleDateString()} {new Date(report.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-sm whitespace-pre-wrap" style={{ color: '#e0e0e0' }}>
                    {report.description}
                  </p>

                  {/* Image */}
                  {report.imageData && (
                    <img
                      src={report.imageData}
                      alt="Bug screenshot"
                      className="max-h-48 object-contain rounded cursor-pointer self-start"
                      style={{ border: '1px solid #262626' }}
                      onClick={() => setExpandedImage(report.imageData)}
                    />
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    {report.status !== 'fixed' && (
                      <button
                        onClick={() => updateStatus(report.id, 'fixed')}
                        className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider"
                        style={{ backgroundColor: '#1a2a1a', border: '1px solid #4a9e4a', color: '#4a9e4a' }}
                      >
                        {t('bugReport.admin.markFixed')}
                      </button>
                    )}
                    {report.status !== 'open' && (
                      <button
                        onClick={() => updateStatus(report.id, 'open')}
                        className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider"
                        style={{ backgroundColor: '#1a1a0a', border: '1px solid #c4a35a', color: '#c4a35a' }}
                      >
                        {t('bugReport.admin.markOpen')}
                      </button>
                    )}
                    {report.status !== 'wontfix' && (
                      <button
                        onClick={() => updateStatus(report.id, 'wontfix')}
                        className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider"
                        style={{ backgroundColor: '#141414', border: '1px solid #555555', color: '#555555' }}
                      >
                        {t('bugReport.admin.markWontfix')}
                      </button>
                    )}
                    <button
                      onClick={() => deleteReport(report.id)}
                      className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider ml-auto"
                      style={{ backgroundColor: '#1a0a0a', border: '1px solid #b33e3e', color: '#b33e3e' }}
                    >
                      {t('common.delete')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
