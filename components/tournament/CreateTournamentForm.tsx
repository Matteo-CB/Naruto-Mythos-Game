'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useTournamentStore, type CreateTournamentInput } from '@/stores/tournamentStore';
import { useRouter } from '@/lib/i18n/navigation';
import { RANK_TIERS } from '@/components/EloBadge';

interface Props {
  isAdmin: boolean;
}

export function CreateTournamentForm({ isAdmin }: Props) {
  const t = useTranslations('tournament');
  const router = useRouter();
  const { createTournament } = useTournamentStore();

  const [name, setName] = useState('');
  const [type, setType] = useState<'simulator' | 'player'>('player');
  const [gameMode, setGameMode] = useState<'classic' | 'sealed'>('classic');
  const [maxPlayers, setMaxPlayers] = useState(8);
  const [isPublic, setIsPublic] = useState(true);
  const [useBanList, setUseBanList] = useState(true);
  const [sealedBoosters, setSealedBoosters] = useState<4 | 5 | 6>(5);
  const [discordRole, setDiscordRole] = useState('');
  const [allowedLeagues, setAllowedLeagues] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const input: CreateTournamentInput = {
        name: name.trim(),
        type,
        gameMode: type === 'player' ? 'classic' : gameMode,
        maxPlayers,
        isPublic,
        useBanList,
        ...(gameMode === 'sealed' && type === 'simulator' ? { sealedBoosterCount: sealedBoosters } : {}),
        ...(discordRole && type === 'simulator' ? { discordRoleReward: discordRole } : {}),
        ...(type === 'simulator' && allowedLeagues.length > 0 ? { allowedLeagues } : {}),
      };
      const id = await createTournament(input);
      router.push(`/tournaments/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = { backgroundColor: '#0a0a0a', border: '1px solid #333', color: '#e0e0e0', padding: '8px 12px', fontSize: '13px', width: '100%' };
  const labelStyle = { color: '#888', fontSize: '11px', textTransform: 'uppercase' as const, letterSpacing: '0.1em', marginBottom: '4px' };

  const ToggleBtn = ({ val, cur, onClick, children }: { val: string; cur: string; onClick: () => void; children: React.ReactNode }) => (
    <button type="button" onClick={onClick} className="px-3 py-1.5 text-xs uppercase tracking-wider font-medium"
      style={{ backgroundColor: cur === val ? '#c4a35a' : '#1a1a1a', color: cur === val ? '#0a0a0a' : '#888', border: `1px solid ${cur === val ? '#c4a35a' : '#333'}` }}>
      {children}
    </button>
  );

  return (
    <div className="flex flex-col gap-4 p-5" style={{ backgroundColor: '#111', border: '1px solid #262626' }}>
      <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: '#c4a35a' }}>{t('create')}</h2>

      <div className="flex flex-col gap-1">
        <label style={labelStyle}>{t('name')}</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('namePlaceholder')} style={inputStyle} maxLength={50} />
      </div>

      {isAdmin && (
        <div className="flex flex-col gap-1">
          <label style={labelStyle}>Type</label>
          <div className="flex gap-2">
            <ToggleBtn val="player" cur={type} onClick={() => setType('player')}>{t('typePlayer')}</ToggleBtn>
            <ToggleBtn val="simulator" cur={type} onClick={() => setType('simulator')}>{t('typeSimulator')}</ToggleBtn>
          </div>
        </div>
      )}

      {type === 'simulator' && (
        <div className="flex flex-col gap-1">
          <label style={labelStyle}>{t('mode')}</label>
          <div className="flex gap-2">
            <ToggleBtn val="classic" cur={gameMode} onClick={() => setGameMode('classic')}>{t('modeClassic')}</ToggleBtn>
            <ToggleBtn val="sealed" cur={gameMode} onClick={() => setGameMode('sealed')}>{t('modeSealed')}</ToggleBtn>
          </div>
        </div>
      )}

      {type === 'simulator' && gameMode === 'sealed' && (
        <div className="flex flex-col gap-1">
          <label style={labelStyle}>{t('sealedBoosters')}</label>
          <div className="flex gap-2">
            {([4, 5, 6] as const).map(v => (
              <ToggleBtn key={v} val={String(v)} cur={String(sealedBoosters)} onClick={() => setSealedBoosters(v)}>{v}</ToggleBtn>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label style={labelStyle}>{t('maxPlayers')}</label>
        <div className="flex gap-2">
          {[4, 8, 16, 32].map(v => (
            <ToggleBtn key={v} val={String(v)} cur={String(maxPlayers)} onClick={() => setMaxPlayers(v)}>{v}</ToggleBtn>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label style={labelStyle}>{t('visibility')}</label>
        <div className="flex gap-2">
          <ToggleBtn val="true" cur={String(isPublic)} onClick={() => setIsPublic(true)}>{t('public')}</ToggleBtn>
          <ToggleBtn val="false" cur={String(isPublic)} onClick={() => setIsPublic(false)}>{t('private')}</ToggleBtn>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span style={labelStyle}>{t('useBanList')}</span>
        <button type="button" role="switch" aria-checked={useBanList} onClick={() => setUseBanList(!useBanList)}
          className="relative h-6 w-11 flex-shrink-0 rounded-full transition-colors overflow-hidden"
          style={{ backgroundColor: useBanList ? '#c4a35a' : '#333', cursor: 'pointer' }}>
          <span className="absolute top-0.5 h-5 w-5 rounded-full"
            style={{ backgroundColor: '#0a0a0a', left: useBanList ? '22px' : '2px', transition: 'left 150ms ease' }} />
        </button>
      </div>

      {type === 'simulator' && isAdmin && (
        <div className="flex flex-col gap-1.5">
          <label style={labelStyle}>{t('allowedLeagues')}</label>
          <p className="text-xs" style={{ color: '#666' }}>{t('allowedLeaguesHint')}</p>
          <div className="flex flex-wrap gap-2">
            {RANK_TIERS.map(tier => {
              const isSelected = allowedLeagues.includes(tier.key);
              return (
                <button
                  key={tier.key}
                  type="button"
                  onClick={() => {
                    setAllowedLeagues(prev =>
                      isSelected
                        ? prev.filter(k => k !== tier.key)
                        : [...prev, tier.key],
                    );
                  }}
                  className="px-2.5 py-1 text-xs font-medium uppercase tracking-wider"
                  style={{
                    backgroundColor: isSelected ? tier.bgColor : '#1a1a1a',
                    color: isSelected ? tier.color : '#666',
                    border: `1px solid ${isSelected ? tier.borderColor : '#333'}`,
                    boxShadow: isSelected ? `0 0 8px ${tier.glowColor}` : 'none',
                  }}
                >
                  {t(`leagueName.${tier.key}`)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {type === 'simulator' && (
        <div className="flex flex-col gap-1">
          <label style={labelStyle}>{t('discordRole')}</label>
          <input type="text" value={discordRole} onChange={(e) => setDiscordRole(e.target.value)} placeholder={t('discordRolePlaceholder')} style={inputStyle} maxLength={50} />
        </div>
      )}

      {error && <p className="text-xs" style={{ color: '#cc4444' }}>{error}</p>}

      <button type="button" disabled={submitting || !name.trim()} onClick={handleSubmit}
        className="py-2.5 text-xs font-bold uppercase tracking-wider transition-colors"
        style={{ backgroundColor: name.trim() ? '#c4a35a' : '#333', color: name.trim() ? '#0a0a0a' : '#666', cursor: name.trim() ? 'pointer' : 'default' }}>
        {submitting ? '...' : t('create')}
      </button>
    </div>
  );
}
