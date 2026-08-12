import { describe, it, expect, beforeAll } from 'vitest';
import { createActionPhaseState, mockCharInPlay, mockMission, mockCharacter } from './testHelpers';
import { initializeRegistry } from '@/lib/effects/EffectRegistry';
import { getCardById } from '@/lib/data/cardIndex';
import { EffectEngine } from '@/lib/effects/EffectEngine';
import { GameEngine } from '@/lib/engine/GameEngine';
import { defeatCharacterInPlay } from '@/lib/effects/defeatUtils';
import type { GameState, CharacterInPlay, CharacterCard } from '@/lib/engine/types';

function plateau(missions = 2): GameState {
  const s = createActionPhaseState();
  s.activeMissions = Array.from({ length: missions }, (_, i) => ({
    card: mockMission({ basePoints: 3 + i }),
    rank: 'D' as const,
    basePoints: 3 + i,
    rankBonus: 1,
    player1Characters: [] as CharacterInPlay[],
    player2Characters: [] as CharacterInPlay[],
    wonBy: null,
  }));
  return s;
}

function controleur(instanceId: string): CharacterInPlay {
  return mockCharInPlay(
    { instanceId, controlledBy: 'player1', originalOwner: 'player1' },
    { id: 'KS-052-C', name_fr: 'KABUTO YAKUSHI', name_en: 'KABUTO YAKUSHI', power: 3 },
  );
}

function vole(instanceId: string, controllerInstanceId: string, cache = true): CharacterInPlay {
  return mockCharInPlay(
    {
      instanceId,
      controlledBy: 'player1',
      originalOwner: 'player2',
      controllerInstanceId,
      isHidden: cache,
    },
    { name_fr: 'CARTE VOLEE', name_en: 'STOLEN CARD', power: 2 },
  );
}

function cotesDe(s: GameState, instanceId: string): 'player1' | 'player2' | null {
  for (const m of s.activeMissions) {
    if (m.player1Characters.some((c) => c.instanceId === instanceId)) return 'player1';
    if (m.player2Characters.some((c) => c.instanceId === instanceId)) return 'player2';
  }
  return null;
}

describe('Kabuto Yakushi 052, la carte volee au deck revient quand il tombe', () => {
  beforeAll(async () => { await initializeRegistry(); });

  function volEnCours(): { state: GameState; kabuto: string } {
    const s = plateau();
    const kabuto = 'kabuto052';
    const carte = getCardById('KS-052-C') as CharacterCard;
    s.activeMissions[0].player1Characters = [
      mockCharInPlay({ instanceId: kabuto, controlledBy: 'player1', originalOwner: 'player1', missionIndex: 0 }, carte),
    ];
    s.player2.deck = [mockCharacter({ id: 'KS-010-C', name_fr: 'NARUTO UZUMAKI', name_en: 'NARUTO UZUMAKI', power: 3 })];

    const enJeu = s.activeMissions[0].player1Characters[0];
    let apres = EffectEngine.resolveRevealUpgradeEffects(s, 'player1', enJeu, 0);

    const confirmation = apres.pendingEffects.find((p) => p.targetSelectionType === 'KABUTO052_CONFIRM_AMBUSH')!;
    expect(confirmation).toBeDefined();
    apres = EffectEngine.applyTargetedEffect(apres, confirmation, [kabuto]);

    const choixMission = apres.pendingEffects.find((p) => p.targetSelectionType === 'KABUTO_CHOOSE_MISSION' && !p.resolved)!;
    expect(choixMission).toBeDefined();
    apres = EffectEngine.applyTargetedEffect(apres, choixMission, ['1']);

    return { state: apres, kabuto };
  }

  it('pose la carte volee de son cote, en la rattachant a Kabuto', () => {
    const { state, kabuto } = volEnCours();
    const volee = state.activeMissions[1].player1Characters[0];
    expect(volee).toBeDefined();
    expect(volee.originalOwner).toBe('player2');
    expect(volee.controlledBy).toBe('player1');
    expect(volee.controllerInstanceId).toBe(kabuto);
  });

  it('rend la carte a son proprietaire quand Kabuto est vaincu', () => {
    const { state, kabuto } = volEnCours();
    const voleeId = state.activeMissions[1].player1Characters[0].instanceId;

    const apres = defeatCharacterInPlay(state, 0, kabuto, 'player1Characters', true, 'player2');
    expect(cotesDe(apres, voleeId)).toBe('player2');
  });
});

describe('une carte volee revient quand son controleur quitte le jeu', () => {
  it('revient a son proprietaire quand le controleur est vaincu', () => {
    const s = plateau();
    s.activeMissions[0].player1Characters = [controleur('kabuto'), vole('carte', 'kabuto')];

    const apres = defeatCharacterInPlay(s, 0, 'kabuto', 'player1Characters', true, 'player2');
    expect(cotesDe(apres, 'carte')).toBe('player2');
  });

  it('revient aussi quand le controleur est cache', () => {
    const s = plateau();
    s.activeMissions[0].player1Characters = [controleur('kabuto'), vole('carte', 'kabuto')];

    const apres = EffectEngine.hideCharacterWithLog(s, 'kabuto', 'player2');
    expect(cotesDe(apres, 'carte')).toBe('player2');
  });

  it('revient quand le controleur se fait lui-meme voler', () => {
    const s = plateau();
    s.activeMissions[0].player1Characters = [controleur('kabuto'), vole('carte', 'kabuto')];

    const apres = EffectEngine.restoreControlOnLeave(s, 'kabuto');
    expect(cotesDe(apres, 'carte')).toBe('player2');
  });

  it('revient a la premiere action jouee si un chemin oublie de la liberer', () => {
    const s = plateau();
    s.activeMissions[0].player1Characters = [controleur('kabuto'), vole('carte', 'kabuto')];
    s.activeMissions[0].player1Characters = s.activeMissions[0].player1Characters.filter(
      (c) => c.instanceId !== 'kabuto',
    );
    expect(cotesDe(s, 'carte')).toBe('player1');

    const apres = GameEngine.applyAction(s, s.activePlayer, { type: 'PASS' });
    expect(cotesDe(apres, 'carte')).toBe('player2');
  });
});
