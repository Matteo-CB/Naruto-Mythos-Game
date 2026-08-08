import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { tournamentSpectateVerdictFor, TOURNAMENT_SPECTATE_MAX_TILES } from '@/lib/tournament/spectatePolicy';
import {
  MAX_TILES,
  fillEmptyTiles,
  gridColumnsFor,
  isTileSelectable,
  pruneVanishedTiles,
  replaceEndedTile,
  toggleTile,
  type LiveMatch,
} from '@/lib/spectate/tileSelection';
import { readTileMessage, postTileMessage, SPECTATE_TILE_CHANNEL } from '@/lib/spectate/tileMessages';

const SERVER = readFileSync('lib/socket/server.ts', 'utf8');
const LOCALES = ['en', 'fr', 'es', 'ja', 'pt', 'it', 'pl'];

function match(roomCode: string, startedAt = 0): LiveMatch {
  return {
    roomCode,
    matchId: `m-${roomCode}`,
    player1Name: `P1-${roomCode}`,
    player2Name: `P2-${roomCode}`,
    turn: 1,
    phase: 'action',
    spectatorCount: 0,
    startedAt,
  };
}

describe('a tournament player can never watch another table', () => {
  it('a participant is refused, whoever they are', () => {
    const verdict = tournamentSpectateVerdictFor({ isSignedIn: true, isParticipant: true });
    expect(verdict.allowed).toBe(false);
    expect(verdict).toMatchObject({ errorKey: 'spectate.errorPlayerInTournament' });
  });

  it('anyone else who is signed in may watch', () => {
    expect(tournamentSpectateVerdictFor({ isSignedIn: true, isParticipant: false }).allowed).toBe(true);
  });

  it('a signed out visitor is asked to sign in, so participation can be checked', () => {
    const verdict = tournamentSpectateVerdictFor({ isSignedIn: false, isParticipant: false });
    expect(verdict.allowed).toBe(false);
    expect(verdict).toMatchObject({ errorKey: 'spectate.errorSignInRequired' });
  });

  it('the socket gate calls the policy for tournament rooms and refuses the two seated players', () => {
    expect(SERVER, 'tournament rooms no longer fall in the private branch').toContain('if (room.tournamentId) {');
    expect(SERVER).toContain('canSpectateTournament(room.tournamentId, authedUserId)');
    expect(SERVER, 'the players of the match themselves are refused first')
      .toContain("socket.emit('spectate:error', { message: 'You are playing this match', errorKey: 'spectate.errorPlayerInTournament' });");
    expect(SERVER, 'a plain private room is still closed')
      .toContain('} else if (room.isPrivate && !isSeatedPlayer) {');
  });
});

describe('the spectator payload never leaks a private zone', () => {
  it('the shared builder empties both hands, the deck, the missions and the user id', () => {
    const builder = SERVER.slice(
      SERVER.indexOf('function buildSpectatorState('),
      SERVER.indexOf('function broadcastState('),
    );
    expect(builder).toContain('hand: [],');
    expect(builder, 'the deck order was readable by the opponent in a second tab').toContain('deck: [],');
    expect(builder).toContain('missionCards: [],');
    expect(builder).toContain('unusedMission: null,');
    expect(builder).toContain('userId: null,');
    expect(builder, 'unreleased cards stay masked').toContain('stateForViewer(spectatorState, false, hiddenIds)');
  });

  it('every spectator path goes through that one builder', () => {
    const uses = SERVER.split('buildSpectatorState(room').length - 1;
    expect(uses, 'join, resync and broadcast').toBeGreaterThanOrEqual(3);
    expect(SERVER, 'no hand-rolled spectator state is left').not.toContain('const specMs = p1State.activeMissions.map');
  });
});

describe('the tile grid never shows more than four boards', () => {
  it('the cap is shared by the policy and the grid', () => {
    expect(MAX_TILES).toBe(4);
    expect(TOURNAMENT_SPECTATE_MAX_TILES).toBe(MAX_TILES);
  });

  it('a fifth match cannot be added', () => {
    const selected = ['a', 'b', 'c', 'd'];
    expect(isTileSelectable(selected, 'e')).toBe(false);
    expect(toggleTile(selected, 'e')).toEqual(selected);
  });

  it('an already shown match can always be removed', () => {
    const selected = ['a', 'b', 'c', 'd'];
    expect(isTileSelectable(selected, 'c')).toBe(true);
    expect(toggleTile(selected, 'c')).toEqual(['a', 'b', 'd']);
  });

  it('the first live matches fill the empty screen, up to the cap', () => {
    const live = ['a', 'b', 'c', 'd', 'e'].map((c, i) => match(c, i));
    expect(fillEmptyTiles([], live)).toEqual(['a', 'b', 'c', 'd']);
    expect(fillEmptyTiles(['e'], live)).toEqual(['e', 'a', 'b', 'c']);
  });

  it('the grid is one column alone, two columns otherwise', () => {
    expect(gridColumnsFor(1)).toBe(1);
    expect(gridColumnsFor(2)).toBe(2);
    expect(gridColumnsFor(4)).toBe(2);
  });
});

describe('a tile whose match ends switches to the next one', () => {
  it('the finished match is replaced in place by a live one that is not shown yet', () => {
    const live = [match('a'), match('b'), match('c')];
    expect(replaceEndedTile(['a', 'b'], 'a', live)).toEqual(['c', 'b']);
  });

  it('with nothing left to show, the tile simply disappears', () => {
    const live = [match('a'), match('b')];
    expect(replaceEndedTile(['a', 'b'], 'b', live)).toEqual(['a']);
  });

  it('a match that is not on screen changes nothing', () => {
    const live = [match('a'), match('b'), match('c')];
    expect(replaceEndedTile(['a'], 'b', live)).toEqual(['a']);
  });

  it('a match that vanished from the live list is dropped', () => {
    expect(pruneVanishedTiles(['a', 'b'], [match('b')])).toEqual(['b']);
  });
});

describe('the tile talks to the page through one guarded channel', () => {
  it('a foreign message is ignored', () => {
    expect(readTileMessage(null)).toBeNull();
    expect(readTileMessage({ kind: 'ended', roomCode: 'a' })).toBeNull();
    expect(readTileMessage({ channel: 'other', kind: 'ended', roomCode: 'a' })).toBeNull();
    expect(readTileMessage({ channel: SPECTATE_TILE_CHANNEL, kind: 'nonsense', roomCode: 'a' })).toBeNull();
    expect(readTileMessage({ channel: SPECTATE_TILE_CHANNEL, kind: 'ended' })).toBeNull();
  });

  it('a real end message is read back', () => {
    expect(readTileMessage({ channel: SPECTATE_TILE_CHANNEL, kind: 'ended', roomCode: 'ABC' }))
      .toEqual({ kind: 'ended', roomCode: 'ABC' });
  });

  it('posting from outside an iframe does nothing', () => {
    expect(() => postTileMessage({ kind: 'ended', roomCode: 'ABC' })).not.toThrow();
  });
});

describe('the server tells watchers when the match they follow is over', () => {
  it('a spectator end event carries the room and the tournament', () => {
    expect(SERVER).toContain("io.to(`spec:${room.code}`).emit('spectate:match-ended'");
    expect(SERVER).toContain('tournamentMatchId: room.tournamentMatchId ?? null,');
  });

  it('the live list is pushed when a tournament game starts and when one ends', () => {
    expect(SERVER.split('broadcastTournamentLiveMatches(io, room.tournamentId)').length - 1)
      .toBeGreaterThanOrEqual(2);
    expect(SERVER).toContain("socket.on('tournament:live-matches'");
  });
});

describe('every new string exists in all seven languages', () => {
  const KEYS = [
    ['tournamentSpectate', 'panelTitle'],
    ['tournamentSpectate', 'noLiveMatches'],
    ['tournamentSpectate', 'signInRequired'],
    ['tournamentSpectate', 'watchLive'],
    ['tournamentSpectate', 'removeTile'],
    ['spectator', 'connecting'],
    ['spectator', 'signInToWatch'],
    ['spectator', 'errorPlayerInTournament'],
    ['spectate', 'errorPlayerInTournament'],
    ['spectate', 'errorSignInRequired'],
  ];

  for (const locale of LOCALES) {
    it(`${locale} carries every spectate key`, () => {
      const messages = JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8'));
      for (const [namespace, key] of KEYS) {
        expect(messages[namespace]?.[key], `${locale} ${namespace}.${key}`).toBeTruthy();
      }
    });
  }
});
