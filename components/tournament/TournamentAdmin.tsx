'use client';

import { useTranslations } from 'next-intl';
import { useState, useCallback } from 'react';
import { useRouter } from '@/lib/i18n/navigation';
import { useTournamentStore } from '@/stores/tournamentStore';

interface Props {
  tournamentId: string;
  isAdmin: boolean;
  isCreator: boolean;
}

const sectionStyle = { backgroundColor: '#0d0d0d', border: '1px solid #262626', padding: '12px' };
const labelStyle = { color: '#888', fontSize: '10px', textTransform: 'uppercase' as const, letterSpacing: '0.08em' };
const btnBase = 'px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider cursor-pointer transition-opacity';

export function TournamentAdmin({ tournamentId, isAdmin, isCreator }: Props) {
  const t = useTranslations('tournament');
  const router = useRouter();
  const { activeTournament, startTournament, forfeitMatch, fetchTournament } = useTournamentStore();
  const [deleting, setDeleting] = useState(false);
  const [startingTournament, setStartingTournament] = useState(false);
  const [forfeitMatchId, setForfeitMatchId] = useState('');
  const [forfeitPlayerId, setForfeitPlayerId] = useState('');
  const [forfeiting, setForfeiting] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminMessage, setAdminMessage] = useState('');
  const [adminError, setAdminError] = useState('');
  // Disqualify
  const [dqUserId, setDqUserId] = useState('');
  const [dqReason, setDqReason] = useState('');
  // Set winner
  const [swMatchId, setSwMatchId] = useState('');
  const [swWinnerId, setSwWinnerId] = useState('');
  // Reset match
  const [resetMatchId, setResetMatchId] = useState('');
  // Ban player
  const [banUserId, setBanUserId] = useState('');
  const [banReason, setBanReason] = useState('');
  const [banPermanent, setBanPermanent] = useState(false);
  const [banDays, setBanDays] = useState('7');
  // Remove participant
  const [removeUserId, setRemoveUserId] = useState('');
  // Expanded sections
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  if (!activeTournament || (!isAdmin && !isCreator)) return null;

  const tour = activeTournament;
  const canStart = tour.status === 'registration' && (tour.participants?.length ?? 0) >= 2;
  const activeMatches = tour.matches?.filter(m => m.status === 'ready' || m.status === 'in_progress') ?? [];
  const allMatches = tour.matches ?? [];

  const adminAction = useCallback(async (body: Record<string, unknown>) => {
    setAdminLoading(true);
    setAdminMessage('');
    setAdminError('');
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setAdminError(data.error || 'Error'); return; }
      setAdminMessage(data.message || 'Done');
      await fetchTournament(tournamentId);
    } catch { setAdminError('Network error'); }
    finally { setAdminLoading(false); }
  }, [tournamentId, fetchTournament]);

  const handleStart = async () => {
    setStartingTournament(true);
    try { await startTournament(tournamentId); } catch {}
    setStartingTournament(false);
  };

  const handleForfeit = async () => {
    if (!forfeitMatchId || !forfeitPlayerId) return;
    setForfeiting(true);
    try { await forfeitMatch(tournamentId, forfeitMatchId, forfeitPlayerId); setForfeitMatchId(''); setForfeitPlayerId(''); } catch {}
    setForfeiting(false);
  };

  const toggle = (s: string) => setExpandedSection(prev => prev === s ? null : s);

  const SectionHeader = ({ id, label, color }: { id: string; label: string; color: string }) => (
    <button type="button" onClick={() => toggle(id)} className="w-full flex items-center justify-between py-1.5 cursor-pointer"
      style={{ borderBottom: '1px solid #1e1e1e' }}>
      <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color }}>{label}</span>
      <span className="text-[10px]" style={{ color: '#555' }}>{expandedSection === id ? '-' : '+'}</span>
    </button>
  );

  const SmallSelect = ({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) => (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="text-[10px] px-2 py-1 w-full" style={{ backgroundColor: '#111', color: '#ccc', border: '1px solid #333' }}>
      {children}
    </select>
  );

  const ActionBtn = ({ onClick, disabled, color, children }: { onClick: () => void; disabled?: boolean; color: string; children: React.ReactNode }) => (
    <button type="button" onClick={onClick} disabled={disabled || adminLoading}
      className={btnBase} style={{ backgroundColor: color, color: '#fff', opacity: (disabled || adminLoading) ? 0.4 : 1 }}>
      {adminLoading ? '...' : children}
    </button>
  );

  return (
    <div className="flex flex-col gap-3 p-4" style={{ backgroundColor: '#111111', border: '1px solid #262626', borderLeft: '3px solid #c4a35a' }}>
      <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: '#c4a35a' }}>
        {isAdmin ? 'Admin Panel' : t('organizer')}
      </h3>

      {/* Feedback */}
      {adminMessage && <p className="text-[10px] px-2 py-1" style={{ backgroundColor: '#1a3a1a', color: '#4ade80', border: '1px solid #333' }}>{adminMessage}</p>}
      {adminError && <p className="text-[10px] px-2 py-1" style={{ backgroundColor: '#3a1a1a', color: '#f87171', border: '1px solid #333' }}>{adminError}</p>}

      {/* Start Tournament */}
      {tour.status === 'registration' && (
        <div style={sectionStyle}>
          <button onClick={handleStart} disabled={!canStart || startingTournament}
            className="w-full px-4 py-2 text-xs font-semibold uppercase tracking-wider cursor-pointer"
            style={{ backgroundColor: canStart ? '#c4a35a' : '#333', color: canStart ? '#0a0a0a' : '#666', opacity: startingTournament ? 0.6 : 1 }}>
            {startingTournament ? '...' : t('start')}
          </button>
          {!canStart && <p className="text-[10px] mt-1" style={{ color: '#cc4444' }}>{t('minPlayers')}</p>}
        </div>
      )}

      {/* Force Forfeit */}
      {tour.status === 'in_progress' && activeMatches.length > 0 && (
        <div style={sectionStyle}>
          <SectionHeader id="forfeit" label={t('forceForfeit')} color="#cc4444" />
          {expandedSection === 'forfeit' && (
            <div className="flex flex-col gap-2 mt-2">
              <SmallSelect value={forfeitMatchId} onChange={(v) => { setForfeitMatchId(v); setForfeitPlayerId(''); }}>
                <option value="">-- {t('selectForfeitPlayer')} --</option>
                {activeMatches.map(m => <option key={m.id} value={m.id}>R{m.round} - {m.player1Username || '?'} vs {m.player2Username || '?'}</option>)}
              </SmallSelect>
              {forfeitMatchId && (() => {
                const m = activeMatches.find(x => x.id === forfeitMatchId);
                if (!m) return null;
                return (
                  <div className="flex gap-1">
                    {m.player1Id && <button type="button" onClick={() => setForfeitPlayerId(m.player1Id!)}
                      className="flex-1 px-2 py-1 text-[10px] cursor-pointer" style={{ backgroundColor: forfeitPlayerId === m.player1Id ? '#cc4444' : '#1a1a1a', color: forfeitPlayerId === m.player1Id ? '#fff' : '#aaa', border: '1px solid #333' }}>{m.player1Username}</button>}
                    {m.player2Id && <button type="button" onClick={() => setForfeitPlayerId(m.player2Id!)}
                      className="flex-1 px-2 py-1 text-[10px] cursor-pointer" style={{ backgroundColor: forfeitPlayerId === m.player2Id ? '#cc4444' : '#1a1a1a', color: forfeitPlayerId === m.player2Id ? '#fff' : '#aaa', border: '1px solid #333' }}>{m.player2Username}</button>}
                  </div>
                );
              })()}
              {forfeitMatchId && forfeitPlayerId && <ActionBtn onClick={handleForfeit} color="#cc4444">{t('forceForfeit')}</ActionBtn>}
            </div>
          )}
        </div>
      )}

      {/* Disqualify Player */}
      {tour.status === 'in_progress' && (
        <div style={sectionStyle}>
          <SectionHeader id="disqualify" label="Disqualify Player" color="#ef4444" />
          {expandedSection === 'disqualify' && (
            <div className="flex flex-col gap-2 mt-2">
              <SmallSelect value={dqUserId} onChange={setDqUserId}>
                <option value="">-- Select player --</option>
                {tour.participants.filter(p => !p.eliminated).map(p => <option key={p.userId} value={p.userId}>{p.username}</option>)}
              </SmallSelect>
              <input type="text" value={dqReason} onChange={e => setDqReason(e.target.value)} placeholder="Reason (optional)"
                className="text-[10px] px-2 py-1" style={{ backgroundColor: '#111', color: '#ccc', border: '1px solid #333' }} />
              <ActionBtn onClick={() => { adminAction({ action: 'disqualify', userId: dqUserId, reason: dqReason }); setDqUserId(''); setDqReason(''); }} disabled={!dqUserId} color="#ef4444">Disqualify</ActionBtn>
            </div>
          )}
        </div>
      )}

      {/* Set Match Winner (override) */}
      {tour.status === 'in_progress' && (
        <div style={sectionStyle}>
          <SectionHeader id="setWinner" label="Override Match Result" color="#f59e0b" />
          {expandedSection === 'setWinner' && (
            <div className="flex flex-col gap-2 mt-2">
              <SmallSelect value={swMatchId} onChange={(v) => { setSwMatchId(v); setSwWinnerId(''); }}>
                <option value="">-- Select match --</option>
                {allMatches.filter(m => m.player1Id && m.player2Id).map(m => (
                  <option key={m.id} value={m.id}>R{m.round} - {m.player1Username || '?'} vs {m.player2Username || '?'} [{m.status}]</option>
                ))}
              </SmallSelect>
              {swMatchId && (() => {
                const m = allMatches.find(x => x.id === swMatchId);
                if (!m) return null;
                return (
                  <div className="flex gap-1">
                    {m.player1Id && <button type="button" onClick={() => setSwWinnerId(m.player1Id!)}
                      className="flex-1 px-2 py-1 text-[10px] cursor-pointer" style={{ backgroundColor: swWinnerId === m.player1Id ? '#f59e0b' : '#1a1a1a', color: swWinnerId === m.player1Id ? '#000' : '#aaa', border: '1px solid #333' }}>{m.player1Username}</button>}
                    {m.player2Id && <button type="button" onClick={() => setSwWinnerId(m.player2Id!)}
                      className="flex-1 px-2 py-1 text-[10px] cursor-pointer" style={{ backgroundColor: swWinnerId === m.player2Id ? '#f59e0b' : '#1a1a1a', color: swWinnerId === m.player2Id ? '#000' : '#aaa', border: '1px solid #333' }}>{m.player2Username}</button>}
                  </div>
                );
              })()}
              {swMatchId && swWinnerId && <ActionBtn onClick={() => { adminAction({ action: 'setMatchWinner', matchId: swMatchId, winnerId: swWinnerId }); setSwMatchId(''); setSwWinnerId(''); }} color="#f59e0b">Set Winner</ActionBtn>}
            </div>
          )}
        </div>
      )}

      {/* Reset Match */}
      {tour.status === 'in_progress' && (
        <div style={sectionStyle}>
          <SectionHeader id="resetMatch" label="Reset Match" color="#3b82f6" />
          {expandedSection === 'resetMatch' && (
            <div className="flex flex-col gap-2 mt-2">
              <SmallSelect value={resetMatchId} onChange={setResetMatchId}>
                <option value="">-- Select match --</option>
                {allMatches.filter(m => m.status === 'completed' || m.status === 'forfeit' || m.status === 'in_progress').map(m => (
                  <option key={m.id} value={m.id}>R{m.round} - {m.player1Username || '?'} vs {m.player2Username || '?'} [{m.status}]</option>
                ))}
              </SmallSelect>
              {resetMatchId && <ActionBtn onClick={() => { adminAction({ action: 'resetMatch', matchId: resetMatchId }); setResetMatchId(''); }} color="#3b82f6">Reset Match</ActionBtn>}
            </div>
          )}
        </div>
      )}

      {/* Remove Participant (registration only) */}
      {tour.status === 'registration' && tour.participants.length > 0 && (
        <div style={sectionStyle}>
          <SectionHeader id="removePlayer" label="Remove Player" color="#f97316" />
          {expandedSection === 'removePlayer' && (
            <div className="flex flex-col gap-2 mt-2">
              <SmallSelect value={removeUserId} onChange={setRemoveUserId}>
                <option value="">-- Select player --</option>
                {tour.participants.filter(p => p.userId !== tour.creatorId).map(p => <option key={p.userId} value={p.userId}>{p.username}</option>)}
              </SmallSelect>
              {removeUserId && <ActionBtn onClick={() => { adminAction({ action: 'removeParticipant', userId: removeUserId }); setRemoveUserId(''); }} color="#f97316">Remove</ActionBtn>}
            </div>
          )}
        </div>
      )}

      {/* Ban Player from Tournaments */}
      <div style={sectionStyle}>
        <SectionHeader id="banPlayer" label="Ban Player" color="#dc2626" />
        {expandedSection === 'banPlayer' && (
          <div className="flex flex-col gap-2 mt-2">
            <SmallSelect value={banUserId} onChange={setBanUserId}>
              <option value="">-- Select player --</option>
              {tour.participants.map(p => <option key={p.userId} value={p.userId}>{p.username}</option>)}
            </SmallSelect>
            <input type="text" value={banReason} onChange={e => setBanReason(e.target.value)} placeholder="Ban reason"
              className="text-[10px] px-2 py-1" style={{ backgroundColor: '#111', color: '#ccc', border: '1px solid #333' }} />
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1 cursor-pointer">
                <input type="checkbox" checked={banPermanent} onChange={e => setBanPermanent(e.target.checked)} />
                <span className="text-[10px]" style={{ color: '#ccc' }}>Permanent</span>
              </label>
              {!banPermanent && (
                <label className="flex items-center gap-1">
                  <span className="text-[10px]" style={{ color: '#888' }}>Days:</span>
                  <input type="number" min="1" max="365" value={banDays} onChange={e => setBanDays(e.target.value)}
                    className="w-12 text-[10px] text-center" style={{ backgroundColor: '#111', color: '#ccc', border: '1px solid #333' }} />
                </label>
              )}
            </div>
            {banUserId && (
              <ActionBtn onClick={() => {
                adminAction({ action: 'banPlayer', userId: banUserId, reason: banReason, permanent: banPermanent, durationDays: parseInt(banDays) || 7 });
                setBanUserId(''); setBanReason('');
              }} color="#dc2626">Ban from Tournaments</ActionBtn>
            )}
          </div>
        )}
      </div>

      {/* Cancel Tournament */}
      {tour.status !== 'completed' && tour.status !== 'cancelled' && (
        <div style={sectionStyle}>
          <SectionHeader id="cancel" label={t('cancel')} color="#666" />
          {expandedSection === 'cancel' && (
            <div className="flex flex-col gap-2 mt-2">
              <p className="text-[10px]" style={{ color: '#cc4444' }}>This will cancel the entire tournament. This action cannot be undone.</p>
              <ActionBtn onClick={() => adminAction({ action: 'cancelTournament' })} color="#666">{t('cancel')}</ActionBtn>
            </div>
          )}
        </div>
      )}

      {/* Delete Tournament (permanently remove from database) */}
      <div style={sectionStyle}>
        <SectionHeader id="delete" label={t('deleteTournament')} color="#cc4444" />
        {expandedSection === 'delete' && (
          <div className="flex flex-col gap-2 mt-2">
            <p className="text-[10px]" style={{ color: '#cc4444' }}>{t('deleteTournamentWarning')}</p>
            <ActionBtn
              onClick={async () => {
                if (!confirm(t('deleteTournamentConfirm'))) return;
                setDeleting(true);
                try {
                  const res = await fetch(`/api/tournaments/${tournamentId}`, { method: 'DELETE' });
                  if (res.ok) {
                    router.push('/tournaments' as '/');
                  } else {
                    const data = await res.json();
                    setAdminError(data.error || 'Failed to delete');
                  }
                } catch { setAdminError('Network error'); }
                finally { setDeleting(false); }
              }}
              color="#cc4444"
              disabled={deleting}
            >
              {deleting ? '...' : t('deleteTournament')}
            </ActionBtn>
          </div>
        )}
      </div>
    </div>
  );
}
