import type { GameState, PlayerID, VisibleGameState } from '@/lib/engine/types';

export type MotionSide = 'me' | 'opp';

export interface MotionCharSnap {
  instanceId: string;
  missionIndex: number;
  side: MotionSide;
  isHidden: boolean;
  imageFile: string | null;
  powerTokens: number;
  stackSize: number;
  hasAmbush: boolean;
}

export interface MotionSnap {
  chars: Map<string, MotionCharSnap>;
  discard: { me: number; opp: number };
  edgeHolder: MotionSide | null;
  myHandCardIds: string[];
}

export interface MotionDiffEvent {
  type: 'card-reveal' | 'card-hide' | 'card-relocate' | 'card-defeat' | 'card-upgrade' | 'edge-transfer' | 'power-token';
  data: Record<string, unknown>;
}

function normImg(file: string | null | undefined): string | null {
  if (!file) return null;
  const p = file.replace(/\\/g, '/');
  return p.startsWith('/') ? p : `/${p}`;
}

export function snapFromGameState(state: GameState, me: PlayerID): MotionSnap {
  const chars = new Map<string, MotionCharSnap>();
  for (let mi = 0; mi < state.activeMissions.length; mi++) {
    const mission = state.activeMissions[mi];
    for (const sideKey of ['player1Characters', 'player2Characters'] as const) {
      const owner: PlayerID = sideKey === 'player1Characters' ? 'player1' : 'player2';
      const side: MotionSide = owner === me ? 'me' : 'opp';
      for (const c of mission[sideKey]) {
        const top = c.stack?.length > 0 ? c.stack[c.stack.length - 1] : c.card;
        chars.set(c.instanceId, {
          instanceId: c.instanceId,
          missionIndex: mi,
          side,
          isHidden: c.isHidden,
          imageFile: normImg(top?.image_file),
          powerTokens: c.powerTokens,
          stackSize: c.stack?.length ?? 1,
          hasAmbush: (top?.effects ?? []).some((e) => e.type === 'AMBUSH'),
        });
      }
    }
  }
  const opp: PlayerID = me === 'player1' ? 'player2' : 'player1';
  return {
    chars,
    discard: { me: state[me].discardPile.length, opp: state[opp].discardPile.length },
    edgeHolder: state.edgeHolder ? (state.edgeHolder === me ? 'me' : 'opp') : null,
    myHandCardIds: state[me].hand.map((c) => c.id),
  };
}

export function snapFromVisible(v: VisibleGameState): MotionSnap {
  const chars = new Map<string, MotionCharSnap>();
  const me = v.myPlayer;
  for (let mi = 0; mi < v.activeMissions.length; mi++) {
    const mission = v.activeMissions[mi];
    for (const sideKey of ['player1Characters', 'player2Characters'] as const) {
      const owner: PlayerID = sideKey === 'player1Characters' ? 'player1' : 'player2';
      const side: MotionSide = owner === me ? 'me' : 'opp';
      for (const c of mission[sideKey]) {
        const top = c.topCard ?? c.card;
        chars.set(c.instanceId, {
          instanceId: c.instanceId,
          missionIndex: mi,
          side,
          isHidden: c.isHidden,
          imageFile: normImg(top?.image_file),
          powerTokens: c.powerTokens,
          stackSize: c.stackSize > 0 ? c.stackSize : 1,
          hasAmbush: (top?.effects ?? []).some((e) => e.type === 'AMBUSH'),
        });
      }
    }
  }
  return {
    chars,
    discard: { me: v.myState.discardPile.length, opp: v.opponentState.discardPileSize },
    edgeHolder: v.edgeHolder ? (v.edgeHolder === me ? 'me' : 'opp') : null,
    myHandCardIds: v.myState.hand.map((c) => c.id),
  };
}

export function findRemovedHandIndex(prevIds: string[], nextIds: string[]): number | undefined {
  if (nextIds.length >= prevIds.length) return undefined;
  for (let i = 0; i < prevIds.length; i++) {
    if (i >= nextIds.length || nextIds[i] !== prevIds[i]) return i;
  }
  return prevIds.length - 1;
}

const MAX_EVENTS_PER_DIFF = 8;

export function buildMotionEventsFromSnaps(prev: MotionSnap, next: MotionSnap): MotionDiffEvent[] {
  const events: MotionDiffEvent[] = [];
  const removedHandIndex = findRemovedHandIndex(prev.myHandCardIds, next.myHandCardIds);
  const discardGrewMe = next.discard.me > prev.discard.me;
  const discardGrewOpp = next.discard.opp > prev.discard.opp;

  for (const [id, prevChar] of prev.chars) {
    const nextChar = next.chars.get(id);

    if (!nextChar) {
      const discardSide: MotionSide | null = prevChar.side === 'me'
        ? (discardGrewMe ? 'me' : discardGrewOpp ? 'opp' : null)
        : (discardGrewOpp ? 'opp' : discardGrewMe ? 'me' : null);
      if (discardSide) {
        events.push({
          type: 'card-defeat',
          data: {
            instanceId: id,
            missionIndex: prevChar.missionIndex,
            side: prevChar.side,
            discardSide,
            cardImage: prevChar.isHidden ? null : prevChar.imageFile,
            hidden: prevChar.isHidden,
          },
        });
      }
      continue;
    }

    if (nextChar.missionIndex !== prevChar.missionIndex || nextChar.side !== prevChar.side) {
      events.push({
        type: 'card-relocate',
        data: {
          instanceId: id,
          fromMissionIndex: prevChar.missionIndex,
          fromSide: prevChar.side,
          missionIndex: nextChar.missionIndex,
          side: nextChar.side,
        },
      });
    }

    if (prevChar.isHidden && !nextChar.isHidden) {
      events.push({
        type: 'card-reveal',
        data: {
          instanceId: id,
          missionIndex: nextChar.missionIndex,
          side: nextChar.side,
          cardImage: nextChar.imageFile,
          hasAmbush: nextChar.hasAmbush,
        },
      });
    } else if (!prevChar.isHidden && nextChar.isHidden) {
      events.push({
        type: 'card-hide',
        data: {
          instanceId: id,
          missionIndex: nextChar.missionIndex,
          side: nextChar.side,
          cardImage: prevChar.imageFile,
        },
      });
    }

    if (nextChar.stackSize > prevChar.stackSize) {
      events.push({
        type: 'card-upgrade',
        data: {
          instanceId: id,
          missionIndex: nextChar.missionIndex,
          side: nextChar.side,
          cardImage: nextChar.imageFile,
          cardIndex: nextChar.side === 'me' ? removedHandIndex : undefined,
        },
      });
    }

    const tokenDelta = nextChar.powerTokens - prevChar.powerTokens;
    if (tokenDelta !== 0) {
      events.push({
        type: 'power-token',
        data: {
          instanceId: id,
          missionIndex: nextChar.missionIndex,
          side: nextChar.side,
          delta: tokenDelta,
        },
      });
    }
  }

  if (prev.edgeHolder !== null && next.edgeHolder !== null && prev.edgeHolder !== next.edgeHolder) {
    events.push({ type: 'edge-transfer', data: { to: next.edgeHolder } });
  }

  if (events.length > MAX_EVENTS_PER_DIFF) {
    const priority: Record<MotionDiffEvent['type'], number> = {
      'card-defeat': 0, 'card-reveal': 1, 'card-relocate': 2, 'card-upgrade': 3,
      'card-hide': 4, 'edge-transfer': 5, 'power-token': 6,
    };
    events.sort((a, b) => priority[a.type] - priority[b.type]);
    return events.slice(0, MAX_EVENTS_PER_DIFF);
  }
  return events;
}
