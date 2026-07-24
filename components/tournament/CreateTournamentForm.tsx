'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useState } from 'react';
import { useTournamentStore, type CreateTournamentInput } from '@/stores/tournamentStore';
import { useRouter } from '@/lib/i18n/navigation';
import { RANK_TIERS } from '@/components/EloBadge';
import { ALL_SET_IDS, SET_REGISTRY, isSetAvailable, getSetName } from '@/lib/data/sets/registry';
import { TOURNAMENT_PRIZE_CARD_IDS } from '@/lib/variants/constants';
import { getCardById } from '@/lib/data/cardIndex';
import { getCardName, getCardTitle, getCardGroup, getCardKeyword, getRarityLabel } from '@/lib/utils/cardLocale';
import Image from 'next/image';

interface Props {
  isAdmin: boolean;
}

export function CreateTournamentForm({ isAdmin }: Props) {
  const t = useTranslations('tournament');
  const tRoot = useTranslations();
  const tCardMeta = useTranslations('cardMeta');
  const locale = useLocale();
  const router = useRouter();
  const { createTournament } = useTournamentStore();

  const [name, setName] = useState('');
  const [format, setFormat] = useState<'swiss' | 'elimination' | 'double_elimination'>('swiss');
  const [gameMode, setGameMode] = useState<'classic' | 'sealed' | 'restricted' | 'evolving'>('classic');
  const [maxPlayers, setMaxPlayers] = useState(32);
  const [isPublic, setIsPublic] = useState(true);
  const [useBanList, setUseBanList] = useState(true);
  const [sealedBoosters, setSealedBoosters] = useState<4 | 5 | 6>(5);
  const [sealedSetChoice, setSealedSetChoice] = useState<string>('random');
  const [allowedLeagues, setAllowedLeagues] = useState<string[]>([]);
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  
  const [allowedGroups, setAllowedGroups] = useState<string[]>([]);
  const [bannedGroups, setBannedGroups] = useState<string[]>([]);
  const [allowedKeywords, setAllowedKeywords] = useState<string[]>([]);
  const [bannedKeywords, setBannedKeywords] = useState<string[]>([]);
  const [allowedRarities, setAllowedRarities] = useState<string[]>([]);
  const [bannedRarities, setBannedRarities] = useState<string[]>([]);
  const [maxPerRarity, setMaxPerRarity] = useState<Record<string, string>>({});
  const [maxCopiesPerCard, setMaxCopiesPerCard] = useState('');
  const [minDeckSize, setMinDeckSize] = useState('');
  const [maxDeckSize, setMaxDeckSize] = useState('');
  const [maxChakraCost, setMaxChakraCost] = useState('');
  const [restrictionNote, setRestrictionNote] = useState('');
  const [bannedCardIds, setBannedCardIds] = useState('');
  const [prizeCardId, setPrizeCardId] = useState<string>('');

  const ALL_GROUPS = ['Leaf Village', 'Sand Village', 'Sound Village', 'Akatsuki', 'Independent'];
  const ALL_KEYWORDS = ['Team 7', 'Team 8', 'Team 10', 'Team Gai', 'Team Baki', 'Sannin', 'Jutsu', 'Summon', 'Rogue Ninja', 'Sound Four'];
  const ALL_RARITIES = ['C', 'UC', 'R', 'RA', 'S', 'M'];

  if (!isAdmin) return null;

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      let scheduledStartAt: string | undefined;
      if (scheduledDate && scheduledTime) {
        scheduledStartAt = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();
      }

      const parsedMaxPerRarity: Record<string, number> = {};
      for (const [k, v] of Object.entries(maxPerRarity)) {
        const n = parseInt(v, 10);
        if (!isNaN(n) && n >= 0) parsedMaxPerRarity[k] = n;
      }

      const input: CreateTournamentInput = {
        name: name.trim(),
        type: 'simulator',
        format,
        gameMode,
        maxPlayers,
        isPublic,
        useBanList,
        ...(gameMode === 'sealed' ? { sealedBoosterCount: sealedBoosters, sealedSetChoice } : {}),
        ...(allowedLeagues.length > 0 ? { allowedLeagues } : {}),
        ...(scheduledStartAt ? { scheduledStartAt } : {}),
        ...(bannedCardIds.trim() ? { bannedCardIds: bannedCardIds.split(',').map(s => s.trim()).filter(Boolean) } : {}),
        ...(prizeCardId ? { prizeCardId } : {}),
        ...(gameMode === 'restricted' ? {
          ...(allowedGroups.length > 0 ? { allowedGroups } : {}),
          ...(bannedGroups.length > 0 ? { bannedGroups } : {}),
          ...(allowedKeywords.length > 0 ? { allowedKeywords } : {}),
          ...(bannedKeywords.length > 0 ? { bannedKeywords } : {}),
          ...(allowedRarities.length > 0 ? { allowedRarities } : {}),
          ...(bannedRarities.length > 0 ? { bannedRarities } : {}),
          ...(Object.keys(parsedMaxPerRarity).length > 0 ? { maxPerRarity: parsedMaxPerRarity } : {}),
          ...(maxCopiesPerCard ? { maxCopiesPerCard: parseInt(maxCopiesPerCard, 10) } : {}),
          ...(minDeckSize ? { minDeckSize: parseInt(minDeckSize, 10) } : {}),
          ...(maxDeckSize ? { maxDeckSize: parseInt(maxDeckSize, 10) } : {}),
          ...(maxChakraCost ? { maxChakraCost: parseInt(maxChakraCost, 10) } : {}),
          ...(restrictionNote.trim() ? { restrictionNote: restrictionNote.trim() } : {}),
        } : {}),
      };
      const id = await createTournament(input);
      router.push(`/tournaments/${id}`);
    } catch (err) {
      const errorKey = (err as Error & { errorKey?: string })?.errorKey;
      if (typeof errorKey === 'string') {
        try { setError(tRoot(errorKey)); return; }
        catch { /* fall through */ }
      }
      setError(err instanceof Error ? err.message : t('admin.error'));
    } finally {
      setSubmitting(false);
    }
  };

  const inputStyle = { backgroundColor: '#0a0a0a', border: '1px solid #333', color: '#e0e0e0', padding: '8px 12px', fontSize: '13px', width: '100%' };
  const labelStyle = { color: '#888', fontSize: '11px', textTransform: 'uppercase' as const, letterSpacing: '0.1em', marginBottom: '4px' };

  const ToggleBtn = ({ val, cur, onClick, children }: { val: string; cur: string; onClick: () => void; children: React.ReactNode }) => (
    <button type="button" onClick={onClick} className="px-3 py-1.5 text-xs uppercase tracking-wider font-medium cursor-pointer"
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

      <div className="flex flex-col gap-1">
        <label style={labelStyle}>{t('format')}</label>
        <div className="flex gap-2">
          <ToggleBtn val="swiss" cur={format} onClick={() => setFormat('swiss')}>{t('formatSwiss')}</ToggleBtn>
          <ToggleBtn val="elimination" cur={format} onClick={() => setFormat('elimination')}>{t('formatElimination')}</ToggleBtn>
          <ToggleBtn val="double_elimination" cur={format} onClick={() => setFormat('double_elimination')}>{t('formatDoubleElim')}</ToggleBtn>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label style={labelStyle}>{t('mode')}</label>
        <div className="flex flex-wrap gap-2">
          <ToggleBtn val="classic" cur={gameMode} onClick={() => setGameMode('classic')}>{t('modeClassic')}</ToggleBtn>
          <ToggleBtn val="sealed" cur={gameMode} onClick={() => setGameMode('sealed')}>{t('modeSealed')}</ToggleBtn>
          <ToggleBtn val="restricted" cur={gameMode} onClick={() => setGameMode('restricted')}>{t('modeRestricted')}</ToggleBtn>
          <ToggleBtn val="evolving" cur={gameMode} onClick={() => setGameMode('evolving')}>{t('modeEvolving')}</ToggleBtn>
        </div>
        {gameMode === 'evolving' && (
          <p className="text-[10px] mt-1" style={{ color: '#888' }}>
            {t('modeEvolvingHint')}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <label style={labelStyle}>{t('prizeLabel')}</label>
        <p className="text-[10px]" style={{ color: '#555' }}>{t('prizeHint')}</p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setPrizeCardId('')}
            className="cursor-pointer flex flex-col items-center justify-center"
            style={{
              width: 110, minHeight: 160,
              backgroundColor: '#0a0a0a',
              border: `1px solid ${prizeCardId === '' ? '#c4a35a' : '#333'}`,
              boxShadow: prizeCardId === '' ? '0 0 18px #c4a35a66' : 'none',
              color: prizeCardId === '' ? '#c4a35a' : '#888',
              fontSize: 11,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            {t('prizeNone')}
          </button>
          {TOURNAMENT_PRIZE_CARD_IDS.map((cardId) => {
            const selected = prizeCardId === cardId;
            const card = getCardById(cardId);
            const number = cardId.split('-')[1] ?? '';
            const displayLabel = card
              ? `${getCardName(card, locale as 'en' | 'fr')} ${getCardTitle(card, locale as 'en' | 'fr')}`
              : cardId;
            return (
              <button
                key={cardId}
                type="button"
                onClick={() => setPrizeCardId(cardId)}
                className="cursor-pointer flex flex-col"
                style={{
                  width: 110,
                  border: `1px solid ${selected ? '#c4a35a' : '#333'}`,
                  boxShadow: selected ? '0 0 18px #c4a35a66' : 'none',
                  backgroundColor: '#0a0a0a',
                }}
                title={displayLabel}
              >
                <div className="relative" style={{ width: '100%', aspectRatio: '110 / 160' }}>
                  <Image
                    src={`/images/cards/KS/mythos_v/${cardId}.webp`}
                    alt=""
                    fill
                    sizes="110px"
                    style={{ objectFit: 'cover' }}
                  />
                </div>
                <div className="px-2 py-1.5 text-[10px] tracking-wide" style={{ color: selected ? '#c4a35a' : '#bbb' }}>
                  <div className="truncate">{card ? getCardName(card, locale as 'en' | 'fr') : cardId}</div>
                  <div className="text-[9px]" style={{ color: '#666' }}>{number} MV</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {gameMode === 'sealed' && (
        <>
          <div className="flex flex-col gap-1">
            <label style={labelStyle}>{t('sealedBoosters')}</label>
            <div className="flex gap-2">
              {([4, 5, 6] as const).map(v => (
                <ToggleBtn key={v} val={String(v)} cur={String(sealedBoosters)} onClick={() => setSealedBoosters(v)}>{v}</ToggleBtn>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label style={labelStyle}>{tRoot('sealed.setChoiceLabel')}</label>
            <div className="flex flex-wrap gap-2">
              <ToggleBtn val="random" cur={sealedSetChoice} onClick={() => setSealedSetChoice('random')}>{tRoot('sealed.setRandom')}</ToggleBtn>
              {ALL_SET_IDS.map((sid) => {
                const desc = SET_REGISTRY[sid];
                const name = getSetName(sid, locale);
                const available = isSetAvailable(sid);
                const cur = sealedSetChoice;
                return (
                  <button
                    key={sid}
                    type="button"
                    onClick={() => available && setSealedSetChoice(sid)}
                    disabled={!available}
                    className="px-3 py-1.5 text-xs uppercase tracking-wider font-medium cursor-pointer disabled:cursor-not-allowed"
                    style={{
                      backgroundColor: cur === sid ? '#c4a35a' : '#1a1a1a',
                      color: !available ? '#444' : cur === sid ? '#0a0a0a' : '#888',
                      border: '1px solid ' + (cur === sid ? '#c4a35a' : '#333'),
                      opacity: available ? 1 : 0.6,
                    }}
                    title={!available ? tRoot('common.comingSoon') : undefined}
                  >
                    {name}
                    {!available && <span className="ml-1 text-[9px] normal-case opacity-70">({tRoot('common.comingSoon')})</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {gameMode === 'restricted' && (
        <div className="flex flex-col gap-3 p-4" style={{ backgroundColor: '#0d0d0d', border: '1px solid #333', }}>
          <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#c4a35a' }}>{t('restrictedSettings')}</h3>

          <div className="flex flex-col gap-1">
            <label style={labelStyle}>{t('allowedGroups')}</label>
            <p className="text-[10px]" style={{ color: '#555' }}>{t('allowedGroupsHint')}</p>
            <div className="flex flex-wrap gap-1.5">
              {ALL_GROUPS.map(g => {
                const sel = allowedGroups.includes(g);
                return <button key={g} type="button" onClick={() => setAllowedGroups(prev => sel ? prev.filter(x => x !== g) : [...prev, g])}
                  className="px-2 py-1 text-[10px] cursor-pointer" style={{ backgroundColor: sel ? '#1a3a1a' : '#1a1a1a', color: sel ? '#4ade80' : '#666', border: `1px solid ${sel ? '#4ade80' : '#333'}` }}>{getCardGroup(g, tCardMeta)}</button>;
              })}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label style={labelStyle}>{t('bannedGroups')}</label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_GROUPS.map(g => {
                const sel = bannedGroups.includes(g);
                return <button key={g} type="button" onClick={() => setBannedGroups(prev => sel ? prev.filter(x => x !== g) : [...prev, g])}
                  className="px-2 py-1 text-[10px] cursor-pointer" style={{ backgroundColor: sel ? '#3a1a1a' : '#1a1a1a', color: sel ? '#f87171' : '#666', border: `1px solid ${sel ? '#f87171' : '#333'}` }}>{getCardGroup(g, tCardMeta)}</button>;
              })}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label style={labelStyle}>{t('allowedKeywords')}</label>
            <p className="text-[10px]" style={{ color: '#555' }}>{t('allowedKeywordsHint')}</p>
            <div className="flex flex-wrap gap-1.5">
              {ALL_KEYWORDS.map(kw => {
                const sel = allowedKeywords.includes(kw);
                return <button key={kw} type="button" onClick={() => setAllowedKeywords(prev => sel ? prev.filter(x => x !== kw) : [...prev, kw])}
                  className="px-2 py-1 text-[10px] cursor-pointer" style={{ backgroundColor: sel ? '#1a3a1a' : '#1a1a1a', color: sel ? '#4ade80' : '#666', border: `1px solid ${sel ? '#4ade80' : '#333'}` }}>{getCardKeyword(kw, tCardMeta)}</button>;
              })}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label style={labelStyle}>{t('bannedKeywords')}</label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_KEYWORDS.map(kw => {
                const sel = bannedKeywords.includes(kw);
                return <button key={kw} type="button" onClick={() => setBannedKeywords(prev => sel ? prev.filter(x => x !== kw) : [...prev, kw])}
                  className="px-2 py-1 text-[10px] cursor-pointer" style={{ backgroundColor: sel ? '#3a1a1a' : '#1a1a1a', color: sel ? '#f87171' : '#666', border: `1px solid ${sel ? '#f87171' : '#333'}` }}>{getCardKeyword(kw, tCardMeta)}</button>;
              })}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label style={labelStyle}>{t('allowedRarities')}</label>
            <p className="text-[10px]" style={{ color: '#555' }}>{t('allowedRaritiesHint')}</p>
            <div className="flex flex-wrap gap-1.5">
              {ALL_RARITIES.map(r => {
                const sel = allowedRarities.includes(r);
                return <button key={r} type="button" onClick={() => setAllowedRarities(prev => sel ? prev.filter(x => x !== r) : [...prev, r])}
                  className="px-2 py-1 text-[10px] font-bold cursor-pointer" style={{ backgroundColor: sel ? '#1a3a1a' : '#1a1a1a', color: sel ? '#4ade80' : '#666', border: `1px solid ${sel ? '#4ade80' : '#333'}` }}>{getRarityLabel(r, tCardMeta)}</button>;
              })}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label style={labelStyle}>{t('bannedRarities')}</label>
            <div className="flex flex-wrap gap-1.5">
              {ALL_RARITIES.map(r => {
                const sel = bannedRarities.includes(r);
                return <button key={r} type="button" onClick={() => setBannedRarities(prev => sel ? prev.filter(x => x !== r) : [...prev, r])}
                  className="px-2 py-1 text-[10px] font-bold cursor-pointer" style={{ backgroundColor: sel ? '#3a1a1a' : '#1a1a1a', color: sel ? '#f87171' : '#666', border: `1px solid ${sel ? '#f87171' : '#333'}` }}>{getRarityLabel(r, tCardMeta)}</button>;
              })}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label style={labelStyle}>{t('maxPerRarity')}</label>
            <p className="text-[10px]" style={{ color: '#555' }}>{t('maxPerRarityHint')}</p>
            <div className="flex flex-wrap gap-2">
              {ALL_RARITIES.map(r => (
                <div key={r} className="flex items-center gap-1">
                  <span className="text-[10px] font-bold" style={{ color: '#888' }}>{getRarityLabel(r, tCardMeta)}:</span>
                  <input type="number" min="0" max="30" value={maxPerRarity[r] ?? ''} placeholder="-"
                    onChange={(e) => setMaxPerRarity(prev => ({ ...prev, [r]: e.target.value }))}
                    className="w-10 text-center text-[10px]" style={{ backgroundColor: '#0a0a0a', border: '1px solid #333', color: '#e0e0e0', padding: '2px' }} />
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label style={labelStyle}>{t('maxCopiesPerCard')}</label>
              <input type="number" min="1" max="10" value={maxCopiesPerCard} onChange={(e) => setMaxCopiesPerCard(e.target.value)}
                placeholder="2" style={{ ...inputStyle, padding: '4px 8px' }} />
            </div>
            <div className="flex flex-col gap-1">
              <label style={labelStyle}>{t('maxChakraCostLabel')}</label>
              <input type="number" min="1" max="10" value={maxChakraCost} onChange={(e) => setMaxChakraCost(e.target.value)}
                placeholder="-" style={{ ...inputStyle, padding: '4px 8px' }} />
            </div>
            <div className="flex flex-col gap-1">
              <label style={labelStyle}>{t('minDeckSizeLabel')}</label>
              <input type="number" min="10" max="60" value={minDeckSize} onChange={(e) => setMinDeckSize(e.target.value)}
                placeholder="30" style={{ ...inputStyle, padding: '4px 8px' }} />
            </div>
            <div className="flex flex-col gap-1">
              <label style={labelStyle}>{t('maxDeckSizeLabel')}</label>
              <input type="number" min="10" max="60" value={maxDeckSize} onChange={(e) => setMaxDeckSize(e.target.value)}
                placeholder="-" style={{ ...inputStyle, padding: '4px 8px' }} />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label style={labelStyle}>{t('bannedCards')}</label>
            <input type="text" value={bannedCardIds} onChange={(e) => setBannedCardIds(e.target.value)}
              placeholder="KS-133-S, KS-143-M, ..." style={{ ...inputStyle, padding: '4px 8px', fontSize: '11px' }} />
          </div>

          <div className="flex flex-col gap-1">
            <label style={labelStyle}>{t('restrictionNote')}</label>
            <textarea value={restrictionNote} onChange={(e) => setRestrictionNote(e.target.value)}
              placeholder={t('restrictionNotePlaceholder')} rows={2}
              style={{ ...inputStyle, padding: '6px 8px', fontSize: '11px', resize: 'vertical' }} />
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
          className="relative h-6 w-11 shrink-0 rounded-full transition-colors overflow-hidden cursor-pointer"
          style={{ backgroundColor: useBanList ? '#c4a35a' : '#333' }}>
          <span className="absolute top-0.5 h-5 w-5 rounded-full"
            style={{ backgroundColor: '#0a0a0a', left: useBanList ? '22px' : '2px', transition: 'left 150ms ease' }} />
        </button>
      </div>

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
                className="px-2.5 py-1 text-xs font-medium uppercase tracking-wider cursor-pointer"
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

      <div className="flex flex-col gap-1">
        <label style={labelStyle}>{t('scheduledStart')}</label>
        <p className="text-xs" style={{ color: '#666' }}>{t('scheduledStartHint')}</p>
        <div className="flex gap-2">
          <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)}
            style={{ ...inputStyle, width: 'auto', flex: 1 }} />
          <input type="time" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)}
            style={{ ...inputStyle, width: 'auto', flex: 1 }} />
        </div>
      </div>

      {error && <p className="text-xs" style={{ color: '#cc4444' }}>{error}</p>}

      <button type="button" disabled={submitting || !name.trim()} onClick={handleSubmit}
        className="py-2.5 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
        style={{ backgroundColor: name.trim() ? '#c4a35a' : '#333', color: name.trim() ? '#0a0a0a' : '#666' }}>
        {submitting ? '...' : t('create')}
      </button>
    </div>
  );
}
