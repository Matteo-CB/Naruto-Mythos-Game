export interface ViewportSize {
  width: number;
  height: number;
}

export function readViewport(): ViewportSize {
  if (typeof window === 'undefined') return { width: 1180, height: 670 };
  const visual = window.visualViewport;
  const width = Math.round(visual?.width ?? window.innerWidth ?? 0);
  const height = Math.round(visual?.height ?? window.innerHeight ?? 0);
  if (width > 0 && height > 0) return { width, height };
  return {
    width: window.innerWidth || document.documentElement.clientWidth || 1180,
    height: window.innerHeight || document.documentElement.clientHeight || 670,
  };
}

export function watchViewport(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const settleTimers: Array<ReturnType<typeof setTimeout>> = [];
  const fire = () => onChange();
  const fireSoon = () => {
    fire();
    requestAnimationFrame(fire);
    for (const delay of [120, 400, 900]) settleTimers.push(setTimeout(fire, delay));
  };

  window.addEventListener('resize', fireSoon);
  window.addEventListener('orientationchange', fireSoon);
  window.addEventListener('pageshow', fireSoon);
  document.addEventListener('visibilitychange', fireSoon);
  window.visualViewport?.addEventListener('resize', fire);
  window.visualViewport?.addEventListener('scroll', fire);

  let observer: ResizeObserver | null = null;
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(fire);
    observer.observe(document.documentElement);
  }

  fireSoon();

  return () => {
    for (const timer of settleTimers) clearTimeout(timer);
    window.removeEventListener('resize', fireSoon);
    window.removeEventListener('orientationchange', fireSoon);
    window.removeEventListener('pageshow', fireSoon);
    document.removeEventListener('visibilitychange', fireSoon);
    window.visualViewport?.removeEventListener('resize', fire);
    window.visualViewport?.removeEventListener('scroll', fire);
    observer?.disconnect();
  };
}

export function isCompactBoardViewport(width: number, height: number, coarsePointer: boolean): boolean {
  if (height > 0 && height < 500) return true;
  return coarsePointer && (width < 1024 || height < 600);
}

export function hasCoarsePointer(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(pointer: coarse)').matches;
}
