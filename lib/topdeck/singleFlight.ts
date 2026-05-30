export interface SingleFlight {
  run<T>(key: string, fn: () => Promise<T>): Promise<T>;
  inflightCount(): number;
}

export function createSingleFlight(): SingleFlight {
  const inflight = new Map<string, Promise<unknown>>();
  return {
    run<T>(key: string, fn: () => Promise<T>): Promise<T> {
      const existing = inflight.get(key);
      if (existing) return existing as Promise<T>;
      const p = Promise.resolve()
        .then(fn)
        .finally(() => {
          inflight.delete(key);
        });
      inflight.set(key, p);
      return p;
    },
    inflightCount(): number {
      return inflight.size;
    },
  };
}
