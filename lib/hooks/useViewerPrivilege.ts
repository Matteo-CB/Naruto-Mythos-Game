'use client';

import { useEffect, useState } from 'react';

export interface ViewerPrivilege {
  loaded: boolean;
  role: string;
  isAdmin: boolean;
  isTester: boolean;
  isOrganizer: boolean;
  canSeeUnrevealed: boolean;
  canCreateTournaments: boolean;
}

const DEFAULT: ViewerPrivilege = {
  loaded: false,
  role: 'user',
  isAdmin: false,
  isTester: false,
  isOrganizer: false,
  canSeeUnrevealed: false,
  canCreateTournaments: false,
};

let cache: ViewerPrivilege | null = null;
let inflight: Promise<ViewerPrivilege> | null = null;

async function load(): Promise<ViewerPrivilege> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = fetch('/api/user/me')
    .then(async (r) => {
      if (!r.ok) return { ...DEFAULT, loaded: true };
      const d = await r.json();
      const v: ViewerPrivilege = {
        loaded: true,
        role: typeof d.role === 'string' ? d.role : 'user',
        isAdmin: !!d.isAdmin,
        isTester: !!d.isTester,
        isOrganizer: !!d.isOrganizer,
        canSeeUnrevealed: !!d.canSeeUnrevealed,
        canCreateTournaments: !!d.canCreateTournaments,
      };
      cache = v;
      return v;
    })
    .catch(() => ({ ...DEFAULT, loaded: true }));
  return inflight;
}

export function useViewerPrivilege(): ViewerPrivilege {
  const [state, setState] = useState<ViewerPrivilege>(cache ?? DEFAULT);
  useEffect(() => {
    let active = true;
    load().then((v) => {
      if (active) setState(v);
    });
    return () => {
      active = false;
    };
  }, []);
  return state;
}
