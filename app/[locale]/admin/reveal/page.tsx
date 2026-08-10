'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { Link } from '@/lib/i18n/navigation';
import { CloudBackground } from '@/components/CloudBackground';
import { Footer } from '@/components/Footer';

const ADMIN_EMAIL = 'matteo.biyikli3224@gmail.com';
const ADMIN_USERNAMES = ['Kutxyt', 'admin', 'Daiki0'];

interface RevealCard {
  id: string;
  set: string;
  number: number;
  rarity: string;
  name: string;
  title: string;
  revealed: boolean;
}

interface SetRow {
  id: string;
  number: number;
  nameEn: string;
  status: 'available' | 'revealing' | 'coming_soon';
}

interface VariantRow {
  id: string;
  set: string;
  number: number;
  rarity: string;
  name: string;
  mode: 'booster' | 'reserved' | 'locked';
}

export default function AdminRevealPage() {
  const t = useTranslations('adminReveal');
  const { data: session } = useSession();
  const [cards, setCards] = useState<RevealCard[]>([]);
  const [sets, setSets] = useState<SetRow[]>([]);
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const isAdmin = session?.user?.email === ADMIN_EMAIL || ADMIN_USERNAMES.includes(session?.user?.name ?? '');

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch('/api/admin/reveal').then((res) => res.json()).catch(() => ({})),
      fetch('/api/admin/sets').then((res) => res.json()).catch(() => ({})),
    ])
      .then(([revealData, setsData]) => {
        setCards(revealData.cards ?? []);
        setSets(setsData.sets ?? []);
        setVariants(setsData.variants ?? []);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  const updateSetStatus = async (setId: string, status: SetRow['status']) => {
    setBusy(`set-${setId}`);
    try {
      const res = await fetch('/api/admin/sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setStatus: { setId, status } }),
      });
      if (res.ok) setSets((prev) => prev.map((s) => (s.id === setId ? { ...s, status } : s)));
    } catch {
      /* ignore */
    } finally {
      setBusy(null);
    }
  };

  const updateObtention = async (cardId: string, mode: VariantRow['mode']) => {
    setBusy(`var-${cardId}`);
    try {
      const res = await fetch('/api/admin/sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ obtention: { cardId, mode } }),
      });
      if (res.ok) setVariants((prev) => prev.map((v) => (v.id === cardId ? { ...v, mode } : v)));
    } catch {
      /* ignore */
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (card: RevealCard) => {
    setBusy(card.id);
    try {
      const res = await fetch('/api/admin/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId: card.id, revealed: !card.revealed }),
      });
      if (res.ok) {
        setCards((prev) => prev.map((c) => (c.id === card.id ? { ...c, revealed: !c.revealed } : c)));
      }
    } catch {
      /* ignore */
    } finally {
      setBusy(null);
    }
  };

  const bulk = async (action: 'reveal' | 'hide') => {
    setBusy('__all__');
    try {
      const res = await fetch('/api/admin/reveal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: action }),
      });
      if (res.ok) {
        setCards((prev) => prev.map((c) => ({ ...c, revealed: action === 'reveal' })));
      }
    } catch {
      /* ignore */
    } finally {
      setBusy(null);
    }
  };

  const bySet = useMemo(() => {
    const groups = new Map<string, RevealCard[]>();
    for (const c of cards) {
      const arr = groups.get(c.set) ?? [];
      arr.push(c);
      groups.set(c.set, arr);
    }
    return [...groups.entries()];
  }, [cards]);

  const revealedCount = cards.filter((c) => c.revealed).length;

  if (!isAdmin) {
    return (
      <main className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--t-bg)' }}>
        <p style={{ color: 'var(--t-danger)' }}>{t('unauthorized')}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen relative" style={{ backgroundColor: 'var(--t-bg)', color: 'var(--t-text)' }}>
      <CloudBackground />
      <div className="relative z-10 max-w-5xl mx-auto px-4 py-8">
        <Link href="/admin" style={{ color: 'var(--t-accent)', fontSize: 14 }}>
          {t('back')}
        </Link>
        <h1 className="mt-4" style={{ fontFamily: 'NJNaruto, sans-serif', fontSize: 28, letterSpacing: 1 }}>
          {t('title')}
        </h1>
        <p className="mt-2" style={{ color: 'var(--t-muted)', fontSize: 14, maxWidth: 640 }}>
          {t('subtitle')}
        </p>

        <section className="mt-8">
          <h2 style={{ fontFamily: 'NJNaruto, sans-serif', fontSize: 20, color: 'var(--t-accent)' }}>{t('setStatusTitle')}</h2>
          <p className="mt-1" style={{ color: 'var(--t-muted)', fontSize: 13, maxWidth: 640 }}>{t('setStatusSubtitle')}</p>
          <div className="mt-3 space-y-2">
            {sets.map((s) => (
              <div key={s.id} className="flex items-center gap-3 p-2" style={{ backgroundColor: 'var(--t-panel)' }}>
                <span style={{ fontSize: 13, width: 180 }}>{s.nameEn} <span style={{ color: '#7a7a7a' }}>({s.id})</span></span>
                <div className="flex gap-1.5 flex-wrap">
                  {(['available', 'revealing', 'coming_soon'] as const).map((st) => (
                    <button
                      key={st}
                      onClick={() => updateSetStatus(s.id, st)}
                      disabled={busy !== null}
                      style={{
                        fontSize: 12, padding: '4px 10px', letterSpacing: 0.5,
                        backgroundColor: s.status === st ? 'var(--t-accent-glow)' : 'rgba(136,136,136,0.08)',
                        color: s.status === st ? 'var(--t-accent)' : 'var(--t-dim)',
                        opacity: busy === `set-${s.id}` ? 0.5 : 1,
                      }}
                    >
                      {st === 'available' ? t('statusAvailable') : st === 'revealing' ? t('statusRevealing') : t('statusComingSoon')}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {variants.length > 0 && (
          <section className="mt-8">
            <h2 style={{ fontFamily: 'NJNaruto, sans-serif', fontSize: 20, color: 'var(--t-accent)' }}>{t('obtentionTitle')}</h2>
            <p className="mt-1" style={{ color: 'var(--t-muted)', fontSize: 13, maxWidth: 640 }}>{t('obtentionSubtitle')}</p>
            <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
              {variants.map((v) => (
                <div key={v.id} className="flex items-center gap-2 p-2" style={{ backgroundColor: 'var(--t-panel)' }}>
                  <span style={{ fontSize: 12, flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {v.name} <span style={{ color: '#7a7a7a' }}>{v.set} {v.number} {v.rarity}</span>
                  </span>
                  <div className="flex gap-1 flex-shrink-0">
                    {(['booster', 'reserved', 'locked'] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => updateObtention(v.id, m)}
                        disabled={busy !== null}
                        style={{
                          fontSize: 11, padding: '3px 8px',
                          backgroundColor: v.mode === m ? 'var(--t-accent-glow)' : 'rgba(136,136,136,0.08)',
                          color: v.mode === m ? 'var(--t-accent)' : 'var(--t-dim)',
                          opacity: busy === `var-${v.id}` ? 0.5 : 1,
                        }}
                      >
                        {m === 'booster' ? t('modeBooster') : m === 'reserved' ? t('modeReserved') : t('modeLocked')}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <h2 className="mt-8" style={{ fontFamily: 'NJNaruto, sans-serif', fontSize: 20, color: 'var(--t-accent)' }}>{t('title')}</h2>
        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <span style={{ color: 'var(--t-accent)', fontSize: 14 }}>
            {t('countLabel', { revealed: revealedCount, total: cards.length })}
          </span>
          <button
            onClick={() => bulk('reveal')}
            disabled={busy !== null}
            style={{ backgroundColor: 'var(--t-success-surface)', color: 'var(--t-success)', padding: '6px 14px', fontSize: 13, letterSpacing: 1, opacity: busy ? 0.5 : 1 }}
          >
            {t('revealAll')}
          </button>
          <button
            onClick={() => bulk('hide')}
            disabled={busy !== null}
            style={{ backgroundColor: 'var(--t-danger-surface)', color: 'var(--t-danger)', padding: '6px 14px', fontSize: 13, letterSpacing: 1, opacity: busy ? 0.5 : 1 }}
          >
            {t('hideAll')}
          </button>
        </div>

        {loading ? (
          <p className="mt-8" style={{ color: 'var(--t-muted)' }}>{t('loading')}</p>
        ) : cards.length === 0 ? (
          <p className="mt-8" style={{ color: 'var(--t-muted)' }}>{t('empty')}</p>
        ) : (
          <div className="mt-6 space-y-8">
            {bySet.map(([setId, setCards]) => (
              <section key={setId}>
                <h2 style={{ fontFamily: 'NJNaruto, sans-serif', fontSize: 18, color: 'var(--t-accent)', marginBottom: 12 }}>
                  {setId}
                </h2>
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
                  {setCards.map((card) => (
                    <div
                      key={card.id}
                      className="flex items-center gap-3 p-2"
                      style={{ backgroundColor: 'var(--t-panel)', boxShadow: '0 8px 20px var(--t-shadow)' }}
                    >
                      {}
                      <img
                        src={`/api/card-image/${card.id}`}
                        alt=""
                        width={44}
                        height={60}
                        style={{ width: 44, height: 60, objectFit: 'cover', flexShrink: 0, backgroundColor: 'var(--t-surface-2)' }}
                      />
                      <div className="flex-1 min-w-0">
                        <div style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {card.name} {card.title}
                        </div>
                        <div style={{ fontSize: 11, color: '#7a7a7a' }}>
                          {card.number} · {card.rarity}
                        </div>
                        <button
                          onClick={() => toggle(card)}
                          disabled={busy !== null}
                          className="mt-1"
                          style={{
                            fontSize: 12,
                            letterSpacing: 1,
                            padding: '3px 10px',
                            backgroundColor: card.revealed ? '#1c2b1c' : '#2b1c1c',
                            color: card.revealed ? '#8fce8f' : '#ce8f8f',
                            opacity: busy === card.id ? 0.5 : 1,
                          }}
                        >
                          {card.revealed ? t('statusRevealed') : t('statusHidden')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
      <Footer />
    </main>
  );
}
