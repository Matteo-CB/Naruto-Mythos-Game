'use client';

import { useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from '@/lib/i18n/navigation';
import { CloudBackground } from '@/components/CloudBackground';
import { Footer } from '@/components/Footer';
import { TradeOfferPanel } from '@/components/trade/TradeOfferPanel';
import { TradeInventoryGrid } from '@/components/trade/TradeInventoryGrid';
import { validateOffer } from '@/lib/trade/inventory-rules';

const ADMIN_USERNAMES = ['Kutxyt', 'admin', 'Daiki0'];
const ADMIN_EMAIL = 'matteo.biyikli3224@gmail.com';

interface SideState {
  username: string;
  userId: string;
  inventory: Map<string, number>;
  offer: string[];
}

const emptySide = (): SideState => ({ username: '', userId: '', inventory: new Map(), offer: [] });

function countOcc(cards: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of cards) m.set(c, (m.get(c) ?? 0) + 1);
  return m;
}

export default function TradeSimulatorPage() {
  const { data: session } = useSession();
  const [sideA, setSideA] = useState<SideState>(emptySide());
  const [sideB, setSideB] = useState<SideState>(emptySide());
  const [queryA, setQueryA] = useState('');
  const [queryB, setQueryB] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [animating, setAnimating] = useState(false);
  const [busy, setBusy] = useState(false);

  const isAdmin = !!session?.user && (
    (session.user.name && ADMIN_USERNAMES.includes(session.user.name)) ||
    session.user.email === ADMIN_EMAIL
  );

  const loadUser = useCallback(async (username: string, setter: (s: SideState) => void) => {
    if (!username.trim()) return;
    const res = await fetch(`/api/admin/trade-sim?username=${encodeURIComponent(username.trim())}`);
    if (!res.ok) { setMsg(`User "${username}" not found`); return; }
    const data = await res.json();
    const inv = new Map<string, number>();
    for (const [k, v] of Object.entries(data.inventory ?? {})) {
      if (typeof v === 'number' && v > 0) inv.set(k, v);
    }
    setter({ username: data.username, userId: data.userId, inventory: inv, offer: [] });
    setMsg(null);
  }, []);

  const addToOffer = (side: 'A' | 'B', cardId: string) => {
    if (side === 'A') setSideA((s) => ({ ...s, offer: [...s.offer, cardId] }));
    else setSideB((s) => ({ ...s, offer: [...s.offer, cardId] }));
  };
  const removeFromOffer = (side: 'A' | 'B', index: number) => {
    if (side === 'A') setSideA((s) => { const o = [...s.offer]; o.splice(index, 1); return { ...s, offer: o }; });
    else setSideB((s) => { const o = [...s.offer]; o.splice(index, 1); return { ...s, offer: o }; });
  };

  const offerCheck = validateOffer(sideA.offer, sideB.offer);

  const simulate = () => {
    setAnimating(true);
    setMsg(null);
    setTimeout(() => setAnimating(false), 1600);
  };

  const executeReal = async () => {
    if (!sideA.userId || !sideB.userId) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/trade-sim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userAId: sideA.userId, userBId: sideB.userId, offerA: sideA.offer, offerB: sideB.offer }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(`Failed: ${body.error ?? res.status}${body.reason ? ` (${body.reason})` : ''}`);
        return;
      }
      setMsg('Trade executed for real. Reloading inventories...');
      await loadUser(sideA.username, setSideA);
      await loadUser(sideB.username, setSideB);
    } finally {
      setBusy(false);
    }
  };

  if (!isAdmin) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center" style={{ backgroundColor: 'var(--t-bg)' }}>
        <CloudBackground />
        <p className="relative z-10 font-display uppercase tracking-widest text-sm" style={{ color: 'var(--t-danger)' }}>
          Admin only
        </p>
      </main>
    );
  }

  const renderSide = (side: 'A' | 'B', state: SideState, query: string, setQuery: (v: string) => void, setter: (s: SideState) => void) => (
    <div className="flex-1 min-w-0 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') loadUser(query, setter); }}
          placeholder={`User ${side} username`}
          className="flex-1 bg-transparent text-sm outline-none px-3 py-2 font-display"
          style={{ color: '#f0eee7', backgroundColor: 'rgba(13,12,16,0.85)' }}
        />
        <button
          type="button"
          onClick={() => loadUser(query, setter)}
          className="font-display px-3 py-2 text-[10px] uppercase tracking-widest"
          style={{ backgroundColor: 'var(--t-accent)', color: 'var(--t-bg)' }}
        >
          Load
        </button>
      </div>
      {state.userId && (
        <>
          <motion.div
            animate={animating ? { x: side === 'A' ? [0, 40, 0] : [0, -40, 0], opacity: [1, 0.5, 1] } : {}}
            transition={{ duration: 1.4 }}
          >
            <TradeOfferPanel
              title={`${state.username} offers`}
              cardIds={state.offer}
              editable
              onRemove={(i) => removeFromOffer(side, i)}
            />
          </motion.div>
          <div className="p-2 max-h-[240px] overflow-y-auto" style={{ backgroundColor: 'var(--t-bg)' }}>
            <TradeInventoryGrid
              inventory={state.inventory}
              offerCounts={countOcc(state.offer)}
              onAdd={(cardId) => addToOffer(side, cardId)}
            />
          </div>
        </>
      )}
    </div>
  );

  return (
    <main className="relative min-h-screen flex flex-col" style={{ backgroundColor: 'var(--t-bg)', color: 'var(--t-text)' }}>
      <CloudBackground />
      <header className="relative z-10 flex items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/admin" className="text-xs tracking-widest font-display" style={{ color: 'var(--t-muted)' }}>
          {'< Admin'}
        </Link>
      </header>

      <div className="relative z-10 flex-1 px-4 sm:px-6 max-w-6xl w-full mx-auto pb-10">
        <h1 className="text-2xl font-display tracking-[0.2em] mb-4 mt-2" style={{ color: 'var(--t-accent)' }}>
          TRADE SIMULATOR
        </h1>

        <div className="flex flex-col sm:flex-row gap-4 mb-5">
          {renderSide('A', sideA, queryA, setQueryA, setSideA)}
          {renderSide('B', sideB, queryB, setQueryB, setSideB)}
        </div>

        {sideA.userId && sideB.userId && (
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <button
              type="button"
              onClick={simulate}
              disabled={animating}
              className="font-display px-5 py-2.5 text-[11px] uppercase tracking-widest"
              style={{ backgroundColor: 'var(--t-surface-2)', color: 'var(--t-accent)' }}
            >
              Simulate animation
            </button>
            <button
              type="button"
              onClick={executeReal}
              disabled={busy || !offerCheck.valid}
              className="font-display px-5 py-2.5 text-[11px] uppercase tracking-widest"
              style={{ backgroundColor: offerCheck.valid ? 'var(--t-danger)' : 'var(--t-border-strong)', color: offerCheck.valid ? '#fff' : 'var(--t-dim)', cursor: offerCheck.valid ? 'pointer' : 'not-allowed' }}
            >
              Execute for real
            </button>
          </div>
        )}

        {!offerCheck.valid && (sideA.offer.length > 0 || sideB.offer.length > 0) && (
          <p className="text-[11px] text-center mt-3" style={{ color: '#b37e3e' }}>
            Invalid offer: {offerCheck.reason}
          </p>
        )}

        <AnimatePresence>
          {msg && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-[12px] text-center mt-4"
              style={{ color: 'var(--t-muted)' }}
            >
              {msg}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
      <Footer />
    </main>
  );
}
