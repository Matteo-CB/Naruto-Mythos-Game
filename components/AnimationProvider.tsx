'use client';

import { useEffect } from 'react';
import { MotionConfig } from 'framer-motion';
import { useSettingsStore } from '@/stores/settingsStore';
import { isTouchPrimaryDevice } from '@/lib/utils/device';

export function AnimationProvider({ children }: { children: React.ReactNode }) {
  const animationsEnabled = useSettingsStore((s) => s.animationsEnabled);

  useEffect(() => {
    if (isTouchPrimaryDevice()) {
      document.documentElement.dataset.touchReduce = 'true';
    } else {
      delete document.documentElement.dataset.touchReduce;
    }
  }, []);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) {
        document.documentElement.dataset.tabHidden = 'true';
      } else {
        delete document.documentElement.dataset.tabHidden;
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  return (
    <MotionConfig reducedMotion={animationsEnabled ? 'never' : 'always'}>
      {children}
    </MotionConfig>
  );
}
