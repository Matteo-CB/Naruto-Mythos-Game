'use client';

import { MotionConfig } from 'framer-motion';
import { useSettingsStore } from '@/stores/settingsStore';

export function AnimationProvider({ children }: { children: React.ReactNode }) {
  const animationsEnabled = useSettingsStore((s) => s.animationsEnabled);
  return (
    <MotionConfig reducedMotion={animationsEnabled ? 'never' : 'always'}>
      {children}
    </MotionConfig>
  );
}
