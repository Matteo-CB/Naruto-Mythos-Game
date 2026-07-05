'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

const ACCENT = '#c4a35a';

type Status = 'pending' | 'succeeded' | 'failed' | 'refunded' | 'cancelled';
type Mode = '' | 'payment' | 'subscription';

interface DonationRow {
  id: string;
  createdAt: string;
  paidAt: string | null;
  amountCents: number;
  currency: string;
  mode: 'payment' | 'subscription';
  status: Status;
  isRecurring: boolean;
  userId: string | null;
  userEmail: string | null;
  username: string | null;
  stripeChargeId: string | null;
  stripeSessionId: string | null;
}

interface AdminDonationsResponse {
  rows: DonationRow[];
  nextCursor: string | null;
  totals: {
    monthCents: number;
    lifetimeCents: number;
    activeSubscriptions: number;
  };
}

const STATUS_COLORS: Record<Status, { text: string; bg: string }> = {
  pending: { text: '#888', bg: 'rgba(136,136,136,0.10)' },
  succeeded: { text: '#7fd49d', bg: 'rgba(127,212,157,0.10)' },
  failed: { text: '#d47f7f', bg: 'rgba(212,127,127,0.10)' },
  refunded: { text: '#d4a87f', bg: 'rgba(212,168,127,0.12)' },
  cancelled: { text: '#7fa3d4', bg: 'rgba(127,163,212,0.10)' },
};

function formatEur(cents: number, bcp47: string): string {
  return new Intl.NumberFormat(bcp47, { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

function formatDateTime(iso: string, bcp47: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  const opts: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  };
  return new Intl.DateTimeFormat(bcp47, opts).format(d);
}

function isoDateInput(value: string): string {
  return value || '';
}

export function AdminDonationsTab() {
  const t = useTranslations('helpUs.admin');
  const tStatus = useTranslations('helpUs.admin.donationStatus');
  const tMeta = useTranslations('_meta');

  const [status, setStatus] = useState<'' | Status>('');
  const [mode, setMode] = useState<Mode>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [data, setData] = useState<AdminDonationsResponse | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const buildQuery = useCallback((cursor: string | null): string => {
    const sp = new URLSearchParams();
    if (status) sp.set('status', status);
    if (mode) sp.set('mode', mode);
    if (dateFrom) sp.set('dateFrom', `${dateFrom}T00:00:00.000Z`);
    if (dateTo) sp.set('dateTo', `${dateTo}T23:59:59.999Z`);
    if (cursor) sp.set('cursor', cursor);
    sp.set('limit', '50');
    return sp.toString();
  }, [status, mode, dateFrom, dateTo]);

  const fetchPage = useCallback(async (resetList: boolean, cursor: string | null) => {
    if (resetList) {
      setLoading(true);
      setError(false);
    } else {
      setLoadingMore(true);
    }
    try {
      const res = await fetch(`/api/admin/donations?${buildQuery(cursor)}`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error('fetch');
      const json = (await res.json()) as AdminDonationsResponse;
      setData((prev) => {
        if (resetList || !prev) return json;
        return { ...json, rows: [...prev.rows, ...json.rows] };
      });
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [buildQuery]);

  useEffect(() => {
    fetchPage(true, null);
  }, [fetchPage]);

  const reset = useCallback(() => {
    setStatus('');
    setMode('');
    setDateFrom('');
    setDateTo('');
  }, []);

  const totals = data?.totals;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatTile label={t('stats.monthTotal')} value={totals ? formatEur(totals.monthCents, tMeta('bcp47')) : '…'} />
        <StatTile label={t('stats.lifetimeTotal')} value={totals ? formatEur(totals.lifetimeCents, tMeta('bcp47')) : '…'} />
        <StatTile label={t('stats.activeSubs')} value={totals ? String(totals.activeSubscriptions) : '…'} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as Status | '')}
          className="px-3 py-2.5 rounded-md font-body text-sm focus:outline-none"
          style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: '#e8e8e8', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <option value="">{t('donations.filterStatusAll')}</option>
          {(Object.keys(STATUS_COLORS) as Status[]).map((s) => (
            <option key={s} value={s}>{tStatus(s)}</option>
          ))}
        </select>

        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as Mode)}
          className="px-3 py-2.5 rounded-md font-body text-sm focus:outline-none"
          style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: '#e8e8e8', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <option value="">{t('donations.filterModeAll')}</option>
          <option value="payment">{t('donations.filterModeOneTime')}</option>
          <option value="subscription">{t('donations.filterModeMonthly')}</option>
        </select>

        <input
          type="date"
          value={isoDateInput(dateFrom)}
          onChange={(e) => setDateFrom(e.target.value)}
          aria-label={t('donations.filterDateFrom')}
          className="px-3 py-2.5 rounded-md font-body text-sm focus:outline-none"
          style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: '#e8e8e8', border: '1px solid rgba(255,255,255,0.08)' }}
        />
        <input
          type="date"
          value={isoDateInput(dateTo)}
          onChange={(e) => setDateTo(e.target.value)}
          aria-label={t('donations.filterDateTo')}
          className="px-3 py-2.5 rounded-md font-body text-sm focus:outline-none"
          style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: '#e8e8e8', border: '1px solid rgba(255,255,255,0.08)' }}
        />
        <button
          type="button"
          onClick={reset}
          className="font-display uppercase text-xs tracking-widest px-4 py-2.5 rounded-md"
          style={{ backgroundColor: 'rgba(196,163,90,0.15)', color: ACCENT }}
        >
          {t('donations.reset')}
        </button>
      </div>

      {error ? (
        <p className="text-sm font-body py-4" style={{ color: '#d47f7f' }}>{t('error.loadFailed')}</p>
      ) : loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 rounded-md animate-pulse" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }} />
          ))}
        </div>
      ) : !data?.rows.length ? (
        <p className="text-sm font-body py-4 text-center" style={{ color: '#888' }}>{t('donations.empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm font-body" style={{ color: '#e8e8e8' }}>
            <thead className="text-[11px] uppercase tracking-widest" style={{ color: '#666' }}>
              <tr>
                <th className="text-left px-2 py-2">{t('table.date')}</th>
                <th className="text-right px-2 py-2">{t('table.amount')}</th>
                <th className="text-left px-2 py-2 hidden sm:table-cell">{t('table.mode')}</th>
                <th className="text-left px-2 py-2">{t('table.status')}</th>
                <th className="text-left px-2 py-2 hidden md:table-cell">{t('table.user')}</th>
                <th className="text-right px-2 py-2">{t('table.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => {
                const sc = STATUS_COLORS[r.status];
                const userLabel = r.username || r.userEmail || t('table.anonymous');
                return (
                  <tr key={r.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                    <td className="px-2 py-2.5 whitespace-nowrap text-[12px]" style={{ color: '#bbb' }}>
                      {formatDateTime(r.paidAt ?? r.createdAt, tMeta('bcp47'))}
                    </td>
                    <td className="px-2 py-2.5 text-right font-display" style={{ color: '#e8e8e8' }}>
                      {formatEur(r.amountCents, tMeta('bcp47'))}
                    </td>
                    <td className="px-2 py-2.5 hidden sm:table-cell text-[12px]" style={{ color: '#bbb' }}>
                      {r.mode === 'subscription' ? t('donations.filterModeMonthly') : t('donations.filterModeOneTime')}
                    </td>
                    <td className="px-2 py-2.5">
                      <span
                        className="font-display uppercase text-[10px] tracking-widest px-2 py-1 rounded-sm"
                        style={{ backgroundColor: sc.bg, color: sc.text }}
                      >
                        {tStatus(r.status)}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 hidden md:table-cell text-[12px]" style={{ color: '#bbb' }}>
                      {userLabel}
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      {r.stripeChargeId ? (
                        <a
                          href={`https://dashboard.stripe.com/payments/${r.stripeChargeId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-display uppercase text-[10px] tracking-widest underline"
                          style={{ color: ACCENT }}
                        >
                          {t('table.openInStripe')}
                        </a>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {data.nextCursor && (
            <div className="flex justify-center pt-4">
              <button
                type="button"
                onClick={() => fetchPage(false, data.nextCursor)}
                disabled={loadingMore}
                className="font-display uppercase text-xs tracking-widest px-5 py-2.5 rounded-md transition-opacity"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  color: '#e8e8e8',
                  opacity: loadingMore ? 0.5 : 1,
                }}
              >
                {t('donations.loadMore')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-md px-4 py-3"
      style={{ backgroundColor: 'rgba(196,163,90,0.08)' }}
    >
      <div className="font-display text-2xl tracking-wider" style={{ color: ACCENT }}>
        {value}
      </div>
      <div className="font-body text-[11px] uppercase tracking-widest mt-1" style={{ color: '#888' }}>
        {label}
      </div>
    </div>
  );
}
