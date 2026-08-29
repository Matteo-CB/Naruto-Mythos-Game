'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { AnimatePresence } from 'framer-motion';
import { SeasonIntroModal } from '@/components/season/SeasonIntroModal';
import type { DonneesDeLintro } from '@/lib/season/intro';

export function SeasonIntroGate() {
  const { status } = useSession();
  const [donnees, setDonnees] = useState<DonneesDeLintro | null>(null);

  useEffect(() => {
    if (status !== 'authenticated') return;
    let annule = false;
    fetch('/api/user/season-intro')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { show?: boolean; donnees?: DonneesDeLintro } | null) => {
        if (annule || !d?.show || !d.donnees) return;
        setDonnees(d.donnees);
      })
      .catch(() => {});
    return () => { annule = true; };
  }, [status]);

  const fermer = useCallback(() => {
    setDonnees(null);
    fetch('/api/user/season-intro', { method: 'POST' }).catch(() => {});
  }, []);

  return (
    <AnimatePresence>
      {donnees && <SeasonIntroModal key="season-intro" donnees={donnees} onClose={fermer} />}
    </AnimatePresence>
  );
}
