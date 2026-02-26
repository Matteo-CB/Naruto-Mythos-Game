'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';

async function requestFullscreenAndLandscape() {
  const el = document.documentElement;
  try {
    if (el.requestFullscreen) {
      await el.requestFullscreen();
    } else if ((el as any).webkitRequestFullscreen) {
      (el as any).webkitRequestFullscreen();
    }
  } catch {
    // Fullscreen denied — continue anyway
  }

  // Try to lock orientation to landscape (Screen Orientation API)
  try {
    const orientation = screen.orientation as any;
    if (orientation && typeof orientation.lock === 'function') {
      await orientation.lock('landscape');
    }
  } catch {
    // Orientation lock not supported or denied — that's fine
  }
}

export function LandscapeBlocker() {
  const t = useTranslations('common');

  const handleFullscreen = useCallback(() => {
    requestFullscreenAndLandscape();
  }, []);

  return (
    <>
      {/* Portrait overlay — tells user to rotate to landscape */}
      <div className="portrait-blocker">
        <div className="portrait-blocker-content">
          <div className="phone-rotate-animation">
            <div className="phone-outline">
              <div className="phone-screen" />
              <div className="phone-notch" />
            </div>
          </div>
          <p className="portrait-blocker-text">{t('rotateDevice')}</p>
          <button className="fullscreen-btn" onClick={handleFullscreen} type="button">
            <span className="fullscreen-icon"><span className="fullscreen-icon-inner" /></span>
            {t('fullscreen')}
          </button>
        </div>
      </div>

      {/* Small floating fullscreen button — visible on touch devices, unobtrusive */}
      <button
        className="fullscreen-float"
        onClick={handleFullscreen}
        type="button"
        aria-label={t('fullscreen')}
      >
        <span className="fullscreen-icon"><span className="fullscreen-icon-inner" /></span>
      </button>
    </>
  );
}
