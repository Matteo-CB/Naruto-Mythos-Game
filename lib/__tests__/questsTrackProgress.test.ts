import { describe, it, expect } from 'vitest';
import { matchQuestsForEvent, isQuestAllowedInMode } from '@/lib/quests/trackProgress';
import type { Quest } from '@/lib/quests/questData';

describe('matchQuestsForEvent', () => {
  it('matches quests by hook with no predicate', () => {
    const matches = matchQuestsForEvent('card.discarded', { gameMode: 'ranked' });
    expect(matches.length).toBeGreaterThan(0);
    for (const m of matches) expect(m.quest.hook).toBe('card.discarded');
  });

  it('matches a quest by predicate', () => {
    const matches = matchQuestsForEvent('character.played.group', {
      gameMode: 'ranked',
      group: 'Sound Village',
    });
    const ids = matches.map((m) => m.quest.id);
    expect(ids).toContain('play-1-sound-village');
  });

  it('does NOT match a quest when predicate diverges', () => {
    const matches = matchQuestsForEvent('character.played.group', {
      gameMode: 'ranked',
      group: 'Leaf Village',
    });
    const ids = matches.map((m) => m.quest.id);
    expect(ids).not.toContain('play-1-sound-village');
  });

  it('skips quests when game mode is solo_v_self', () => {
    const matches = matchQuestsForEvent('card.discarded', { gameMode: 'solo_v_self' });
    expect(matches.length).toBe(0);
  });

  it('honors quest.allowSoloVSelf when set', () => {
    const quest: Quest = {
      id: 'fake-solo-quest',
      level: 1,
      target: 1,
      hook: 'fake.hook',
      scope: 'match',
      text_fr: '',
      text_en: '',
      allowSoloVSelf: true,
    };
    expect(isQuestAllowedInMode(quest, 'solo_v_self')).toBe(true);
  });

  it('rejects solo_v_self for quests without flag', () => {
    const quest: Quest = {
      id: 'fake-quest',
      level: 1,
      target: 1,
      hook: 'fake.hook',
      scope: 'match',
      text_fr: '',
      text_en: '',
    };
    expect(isQuestAllowedInMode(quest, 'solo_v_self')).toBe(false);
    expect(isQuestAllowedInMode(quest, 'ranked')).toBe(true);
    expect(isQuestAllowedInMode(quest, 'casual')).toBe(true);
  });

  it('passes through delta when provided', () => {
    const matches = matchQuestsForEvent('card.discarded', { gameMode: 'ranked', delta: 3 });
    for (const m of matches) expect(m.delta).toBe(3);
  });

  it('defaults delta to 1', () => {
    const matches = matchQuestsForEvent('card.discarded', { gameMode: 'ranked' });
    for (const m of matches) expect(m.delta).toBe(1);
  });

  it('matches array predicate using strict inclusion', () => {
    const matches = matchQuestsForEvent('mission.has.characters', {
      gameMode: 'ranked',
      names: ['AKAMARU', 'KIBA INUZUKA', 'SHINO ABURAME'],
    });
    const ids = matches.map((m) => m.quest.id);
    expect(ids).toContain('akamaru-kiba-same-mission');
  });

  it('rejects array predicate when missing required item', () => {
    const matches = matchQuestsForEvent('mission.has.characters', {
      gameMode: 'ranked',
      names: ['AKAMARU', 'SHINO ABURAME'],
    });
    const ids = matches.map((m) => m.quest.id);
    expect(ids).not.toContain('akamaru-kiba-same-mission');
  });
});
