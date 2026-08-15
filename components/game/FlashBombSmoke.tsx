'use client';

import { useMemo } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { normalizeImagePath } from '@/lib/utils/imagePath';
import { SMOKE_LAYER } from './AttachmentStrip';

const COLONNES = 8;
const LIGNES = 4;
const IMAGES = COLONNES * LIGNES;
const DUREE_S = 2.6;

function positionDeCellule(index: number): string {
  const colonne = index % COLONNES;
  const ligne = Math.floor(index / COLONNES);
  const x = (colonne / (COLONNES - 1)) * 100;
  const y = (ligne / (LIGNES - 1)) * 100;
  return `${x}% ${y}%`;
}

export function FlashBombSmoke({ instanceId }: { instanceId: string }) {
  const animationsEnabled = useSettingsStore((s) => s.animationsEnabled);
  const nom = useMemo(() => `fbSmoke${instanceId.replace(/[^a-zA-Z0-9]/g, '')}`, [instanceId]);

  const etapes = useMemo(() => {
    const lignes: string[] = [];
    for (let i = 0; i < IMAGES; i++) {
      const pourcentage = ((i / IMAGES) * 100).toFixed(4);
      lignes.push(`${pourcentage}% { background-position: ${positionDeCellule(i)}; }`);
    }
    lignes.push(`100% { background-position: ${positionDeCellule(0)}; }`);
    return lignes.join('\n');
  }, []);

  const feuille = normalizeImagePath('images/vfx/smoke-sheet.webp');

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ zIndex: SMOKE_LAYER, borderRadius: 'inherit', backgroundColor: 'rgba(18,18,20,0.76)' }}
      aria-hidden
    >
      <div
        className="absolute"
        style={{
          left: '-14%',
          top: '-10%',
          width: '128%',
          height: '120%',
          backgroundImage: `url(${feuille})`,
          backgroundSize: `${COLONNES * 100}% ${LIGNES * 100}%`,
          backgroundPosition: positionDeCellule(0),
          backgroundRepeat: 'no-repeat',
          animation: animationsEnabled ? `${nom} ${DUREE_S}s steps(1, end) infinite` : undefined,
        }}
      />
      <div
        className="absolute"
        style={{
          left: '-22%',
          top: '-6%',
          width: '144%',
          height: '126%',
          backgroundImage: `url(${feuille})`,
          backgroundSize: `${COLONNES * 100}% ${LIGNES * 100}%`,
          backgroundPosition: positionDeCellule(17),
          backgroundRepeat: 'no-repeat',
          opacity: 0.72,
          transform: 'scaleX(-1)',
          animation: animationsEnabled ? `${nom} ${DUREE_S * 1.47}s steps(1, end) infinite` : undefined,
        }}
      />

      <style>{`@keyframes ${nom} {\n${etapes}\n}`}</style>
    </div>
  );
}
