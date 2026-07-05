'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker.getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
        .catch(() => { /* ignore */ });
      if (typeof caches !== 'undefined') {
        caches.keys()
          .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
          .catch(() => { /* ignore */ });
      }
      return;
    }

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });

        if (registration.waiting) {
          registration.waiting.postMessage('SKIP_WAITING');
        }

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              installing.postMessage('SKIP_WAITING');
            }
          });
        });
      } catch {
        /* registration failure is non-fatal */
      }
    };

    const onLoad = () => { register(); };
    if (document.readyState === 'complete') onLoad();
    else window.addEventListener('load', onLoad, { once: true });

    return () => window.removeEventListener('load', onLoad);
  }, []);

  return null;
}
