'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';

function requestFullscreen() {
  const el = document.documentElement;
  if (el.requestFullscreen) {
    el.requestFullscreen().catch(() => {});
  } else if ((el as any).webkitRequestFullscreen) {
    (el as any).webkitRequestFullscreen();
  }
}

export function LandscapeBlocker() {
  const t = useTranslations('common');

  const handleFullscreen = useCallback(() => {
    requestFullscreen();
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
