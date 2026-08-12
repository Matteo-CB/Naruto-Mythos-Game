'use client';

import { motion, useReducedMotion } from 'framer-motion';

type Rarity = 'RA' | 'MV' | 'SV' | 'L';

interface RarityFinaleProps {
  rarity: Rarity;
  label: string;
}

const COLOR: Record<Rarity, string> = {
  RA: 'var(--t-accent)',
  MV: '#5fa3df',
  SV: '#9b59b6',
  L: 'var(--t-danger)',
};

export function RarityFinale({ rarity, label }: RarityFinaleProps) {
  const reduce = useReducedMotion();
  const accent = COLOR[rarity];

  if (rarity === 'L') return <LegendaryBurst accent={accent} label={label} reduce={!!reduce} />;
  if (rarity === 'SV') return <SecretSpiral accent={accent} label={label} reduce={!!reduce} />;
  if (rarity === 'MV') return <MythosTracer accent={accent} label={label} reduce={!!reduce} />;
  return <RaShimmer accent={accent} reduce={!!reduce} />;
}

function RaShimmer({ accent, reduce }: { accent: string; reduce: boolean }) {
  const duration = reduce ? 0.6 : 0.9;
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 0.8, 0] }}
      transition={{ duration, ease: 'linear' }}
      style={{ boxShadow: `0 0 18px ${accent}44, inset 0 0 12px ${accent}33` }}
    />
  );
}

function MythosTracer({ accent, label, reduce }: { accent: string; label: string; reduce: boolean }) {
  return (
    <>
      <motion.div
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          top: -4, left: -4, right: -4, bottom: -4,
          boxShadow: `0 0 0 1px ${accent}, 0 0 18px ${accent}66`,
        }}
        initial={{ opacity: 0, rotate: 0 }}
        animate={reduce ? { opacity: [0, 0.9, 0] } : { opacity: [0, 0.9, 0], rotate: 360 }}
        transition={{ duration: reduce ? 0.6 : 1.1, ease: 'linear' }}
      />
      <FinaleLabel accent={accent} label={label} reduce={reduce} />
    </>
  );
}

function LegendaryBurst({ accent, label, reduce }: { accent: string; label: string; reduce: boolean }) {
  const burstDuration = reduce ? 0.6 : 1.4;
  return (
    <>
      <motion.div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-60"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.92 }}
        transition={{ duration: 0.3 }}
        style={{ backgroundColor: 'var(--t-overlay)' }}
      />
      <motion.div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-61 flex items-center justify-center"
      >
        <motion.div
          initial={{ scale: 0.2, opacity: 0.8 }}
          animate={{ scale: 4, opacity: 0 }}
          transition={{ duration: burstDuration, ease: [0.22, 0.61, 0.36, 1] }}
          style={{
            width: 120,
            height: 120,
            borderRadius: '50%',
            backgroundColor: accent,
            boxShadow: `0 0 80px ${accent}, 0 0 160px ${accent}88`,
          }}
        />
      </motion.div>
      <FinaleLabel accent={accent} label={label} big reduce={reduce} />
    </>
  );
}

function SecretSpiral({ accent, label, reduce }: { accent: string; label: string; reduce: boolean }) {
  const purple = accent;
  const cyan = '#5fa3df';
  const gold = 'var(--t-accent)';
  const bars = [purple, cyan, gold, purple, cyan, gold];
  const spiralDuration = reduce ? 0.6 : 1.4;
  return (
    <>
      <motion.div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-60"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.92 }}
        transition={{ duration: 0.3 }}
        style={{ backgroundColor: 'var(--t-overlay)' }}
      />
      <div className="pointer-events-none fixed inset-0 z-61 flex items-center justify-center">
        <motion.div
          animate={reduce ? { opacity: [0, 1, 0] } : { rotate: 360 }}
          transition={{ duration: spiralDuration, ease: reduce ? 'easeInOut' : 'linear' }}
          style={{
            position: 'relative',
            width: 220,
            height: 220,
          }}
        >
          {bars.map((color, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: 3,
                height: 220,
                marginLeft: -1.5,
                marginTop: -110,
                backgroundColor: color,
                boxShadow: `0 0 12px ${color}aa`,
                transform: `rotate(${(360 / bars.length) * i}deg)`,
              }}
            />
          ))}
        </motion.div>
      </div>
      <FinaleLabel accent={accent} label={label} big reduce={reduce} />
    </>
  );
}

function FinaleLabel({ accent, label, big = false, reduce = false }: { accent: string; label: string; big?: boolean; reduce?: boolean }) {
  return (
    <motion.div
      className="font-display uppercase tracking-wider"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: [0, 1, 0.7], y: 0 }}
      transition={{ duration: reduce ? 0.6 : 1.6, ease: [0.22, 0.61, 0.36, 1] }}
      style={{
        position: big ? 'fixed' : 'absolute',
        bottom: big ? '20%' : -36,
        left: 0,
        right: 0,
        textAlign: 'center',
        color: accent,
        fontSize: big ? 28 : 12,
        letterSpacing: '0.22em',
        zIndex: big ? 62 : 'auto',
      }}
    >
      {label}
    </motion.div>
  );
}
