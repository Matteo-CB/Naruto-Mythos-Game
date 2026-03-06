'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useTournamentStore } from '@/stores/tournamentStore';

interface Props {
  tournamentId: string;
  isAdmin: boolean;
  isCreator: boolean;
}

export function TournamentAdmin({ tournamentId, isAdmin, isCreator }: Props) {
  const t = useTranslations('tournament');
  const { activeTournament, startTournament, forfeitMatch } = useTournamentStore();
  const [startingTournament, setStartingTournament] = useState(false);
  const [forfeitMatchId, setForfeitMatchId] = useState('');
  const [forfeitPlayerId, setForfeitPlayerId] = useState('');
  const [forfeiting, setForfeiting] = useState(false);

  if (!activeTournament || (!isAdmin && !isCreator)) return null;

  const canStart = activeTournament.status === 'registration'
    && (activeTournament.participants?.length ?? 0) >= 2;

  const activeMatches = activeTournament.matches?.filter(
    m => m.status === 'ready' || m.status === 'in_progress',
  ) ?? [];

  const handleStart = async () => {
    setStartingTournament(true);
    try { await startTournament(tournamentId); } catch {}
    setStartingTournament(false);
  };

  const handleForfeit = async () => {
    if (!forfeitMatchId || !forfeitPlayerId) return;
    setForfeiting(true);
    try {
      await forfeitMatch(tournamentId, forfeitMatchId, forfeitPlayerId);
      setForfeitMatchId('');
      setForfeitPlayerId('');
    } catch {}
    setForfeiting(false);
  };

  return (
    <div
      className="flex flex-col gap-4 p-4"
      style={{ backgroundColor: '#111111', border: '1px solid #262626' }}
    >
      <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: '#c4a35a' }}>
        Admin
      </h3>

      {activeTournament.status === 'registration' && (
        <div className="flex flex-col gap-2">
          <button
            onClick={handleStart}
            disabled={!canStart || startingTournament}
            className="px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-colors"
            style={{
              backgroundColor: canStart ? '#c4a35a' : '#333',
              color: canStart ? '#0a0a0a' : '#666',
              cursor: canStart ? 'pointer' : 'default',
              opacity: startingTournament ? 0.6 : 1,
            }}
          >
            {startingTournament ? '...' : t('start')}
          </button>
          {!canStart && (
            <p className="text-[10px]" style={{ color: '#cc4444' }}>{t('minPlayers')}</p>
          )}
        </div>
      )}

      {activeTournament.status === 'in_progress' && activeMatches.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-medium" style={{ color: '#aaa' }}>
            {t('forceForfeit')}
          </span>
          <select
            value={forfeitMatchId}
            onChange={(e) => { setForfeitMatchId(e.target.value); setForfeitPlayerId(''); }}
            className="text-xs px-2 py-1"
            style={{ backgroundColor: '#1a1a1a', color: '#ccc', border: '1px solid #333' }}
          >
            <option value="">{t('selectForfeitPlayer')}</option>
            {activeMatches.map((m) => (
              <option key={m.id} value={m.id}>
                R{m.round} - {m.player1Username || t('tbd')} vs {m.player2Username || t('tbd')}
              </option>
            ))}
          </select>

          {forfeitMatchId && (() => {
            const match = activeMatches.find(m => m.id === forfeitMatchId);
            if (!match) return null;
            return (
              <div className="flex gap-2">
                {match.player1Id && (
                  <button
                    onClick={() => setForfeitPlayerId(match.player1Id!)}
                    className="flex-1 px-2 py-1 text-[10px] uppercase tracking-wider"
                    style={{
                      backgroundColor: forfeitPlayerId === match.player1Id ? '#cc4444' : '#222',
                      color: forfeitPlayerId === match.player1Id ? '#fff' : '#aaa',
                      border: '1px solid #333', cursor: 'pointer',
                    }}
                  >
                    {match.player1Username}
                  </button>
                )}
                {match.player2Id && (
                  <button
                    onClick={() => setForfeitPlayerId(match.player2Id!)}
                    className="flex-1 px-2 py-1 text-[10px] uppercase tracking-wider"
                    style={{
                      backgroundColor: forfeitPlayerId === match.player2Id ? '#cc4444' : '#222',
                      color: forfeitPlayerId === match.player2Id ? '#fff' : '#aaa',
                      border: '1px solid #333', cursor: 'pointer',
                    }}
                  >
                    {match.player2Username}
                  </button>
                )}
              </div>
            );
          })()}

          {forfeitMatchId && forfeitPlayerId && (
            <button
              onClick={handleForfeit}
              disabled={forfeiting}
              className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider"
              style={{
                backgroundColor: '#cc4444', color: '#fff',
                cursor: forfeiting ? 'default' : 'pointer',
                opacity: forfeiting ? 0.6 : 1,
              }}
            >
              {forfeiting ? '...' : t('forceForfeit')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
