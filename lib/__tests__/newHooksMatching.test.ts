import { describe, it, expect } from 'vitest';
import { matchQuestsForEvent } from '@/lib/quests/trackProgress';

describe('character.defeated.by.name → defeat-kyubi quest', () => {
  it('matches when name is KYÛBI', () => {
    const matches = matchQuestsForEvent('character.defeated.by.name', {
      gameMode: 'ranked', name: 'KYÛBI',
    });
    expect(matches.map((m) => m.quest.id)).toContain('defeat-kyubi');
  });

  it('does not match for other names', () => {
    const matches = matchQuestsForEvent('character.defeated.by.name', {
      gameMode: 'ranked', name: 'NARUTO UZUMAKI',
    });
    expect(matches.map((m) => m.quest.id)).not.toContain('defeat-kyubi');
  });
});

describe('character.power.threshold → Itachi quest', () => {
  it('matches Itachi 10+ Power', () => {
    const matches = matchQuestsForEvent('character.power.threshold', {
      gameMode: 'ranked', name: 'ITACHI UCHIWA', threshold: 10,
    });
    expect(matches.map((m) => m.quest.id)).toContain('itachi-10-power-match');
  });

  it('does not match other characters at 10 Power', () => {
    const matches = matchQuestsForEvent('character.power.threshold', {
      gameMode: 'ranked', name: 'SASUKE UCHIWA', threshold: 10,
    });
    expect(matches.map((m) => m.quest.id)).not.toContain('itachi-10-power-match');
  });
});

describe('character.power_tokens.threshold → Rock Lee + Maître Gai', () => {
  it('matches Rock Lee 10+ tokens', () => {
    const matches = matchQuestsForEvent('character.power_tokens.threshold', {
      gameMode: 'ranked', name: 'ROCK LEE', threshold: 10,
    });
    expect(matches.map((m) => m.quest.id)).toContain('rock-lee-10-tokens-match');
  });

  it('matches Gaï Maito 10+ tokens', () => {
    const matches = matchQuestsForEvent('character.power_tokens.threshold', {
      gameMode: 'ranked', name: 'GAÏ MAITO', threshold: 10,
    });
    expect(matches.map((m) => m.quest.id)).toContain('maito-gai-10-tokens-match');
  });
});

describe('ambush.activated.via_reveal → reveal-for-ambush-10', () => {
  it('matches reveal AMBUSH events', () => {
    const matches = matchQuestsForEvent('ambush.activated.via_reveal', {
      gameMode: 'ranked', targetName: 'KIDOMARU',
    });
    expect(matches.map((m) => m.quest.id)).toContain('reveal-for-ambush-10');
  });
});

describe('elo.tier.reached → Chûnin / Hokage', () => {
  it('matches chunin tier', () => {
    const matches = matchQuestsForEvent('elo.tier.reached', {
      gameMode: 'ranked', tier: 'chunin',
    });
    expect(matches.map((m) => m.quest.id)).toContain('elo-reach-chunin');
  });

  it('matches will_of_fire tier (Hokage quest)', () => {
    const matches = matchQuestsForEvent('elo.tier.reached', {
      gameMode: 'ranked', tier: 'will_of_fire',
    });
    expect(matches.map((m) => m.quest.id)).toContain('elo-reach-hokage');
  });

  it('does not match for unrelated tier', () => {
    const matches = matchQuestsForEvent('elo.tier.reached', {
      gameMode: 'ranked', tier: 'genin',
    });
    const ids = matches.map((m) => m.quest.id);
    expect(ids).not.toContain('elo-reach-chunin');
    expect(ids).not.toContain('elo-reach-hokage');
  });
});

describe('character.defeated.with.source.power.combo → Neji 4+6 quest', () => {
  it('matches Neji 4+6 combo', () => {
    const matches = matchQuestsForEvent('character.defeated.with.source.power.combo', {
      gameMode: 'ranked', sourceName: 'NEJI HYÛGA', powers: [4, 6],
    });
    expect(matches.map((m) => m.quest.id)).toContain('neji-defeat-power4-power6-same-action');
  });
});

describe('ranked.win.no_effects_used → quest', () => {
  it('matches when emitted', () => {
    const matches = matchQuestsForEvent('ranked.win.no_effects_used', { gameMode: 'ranked' });
    expect(matches.map((m) => m.quest.id)).toContain('ranked-win-no-effects-3');
  });
});

describe('mission.has.characters → Team 7 + Akamaru/Kiba', () => {
  it('matches when team 7 is present', () => {
    const matches = matchQuestsForEvent('mission.has.characters', {
      gameMode: 'ranked',
      names: ['NARUTO UZUMAKI', 'SASUKE UCHIWA', 'SAKURA HARUNO'],
    });
    expect(matches.map((m) => m.quest.id)).toContain('team7-same-mission');
  });

  it('matches Akamaru+Kiba combo', () => {
    const matches = matchQuestsForEvent('mission.has.characters', {
      gameMode: 'ranked',
      names: ['AKAMARU', 'KIBA INUZUKA', 'SHINO ABURAME'],
    });
    expect(matches.map((m) => m.quest.id)).toContain('akamaru-kiba-same-mission');
  });
});

describe('character.controlled.with.source → Ino quest', () => {
  it('matches Ino controlled', () => {
    const matches = matchQuestsForEvent('character.controlled.with.source', {
      gameMode: 'ranked', sourceName: 'INO YAMANAKA',
    });
    expect(matches.map((m) => m.quest.id)).toContain('ino-control-5');
  });
});

describe('tokens.removed.with.source → Kisame + Neji', () => {
  it('matches Kisame', () => {
    const matches = matchQuestsForEvent('tokens.removed.with.source', {
      gameMode: 'ranked', sourceName: 'KISAME HOSHIGAKI',
    });
    expect(matches.map((m) => m.quest.id)).toContain('kisame-remove-30');
  });

  it('matches Neji', () => {
    const matches = matchQuestsForEvent('tokens.removed.with.source', {
      gameMode: 'ranked', sourceName: 'NEJI HYÛGA',
    });
    expect(matches.map((m) => m.quest.id)).toContain('neji-remove-15-tokens-match');
    expect(matches.map((m) => m.quest.id)).toContain('neji-remove-10-tokens-match');
  });
});

describe('effect.copied.with.source → Sakon + Kakashi', () => {
  it('matches Sakon', () => {
    const matches = matchQuestsForEvent('effect.copied.with.source', {
      gameMode: 'ranked', sourceName: 'SAKON',
    });
    expect(matches.map((m) => m.quest.id)).toContain('sakon-copy-5');
  });

  it('matches Kakashi (cumulative + 20 + AMBUSH)', () => {
    const matches = matchQuestsForEvent('effect.copied.with.source', {
      gameMode: 'ranked', sourceName: 'KAKASHI HATAKE',
    });
    expect(matches.map((m) => m.quest.id)).toContain('kakashi-copy-20');
  });
});

describe('character.hidden.with.source → all hide sources', () => {
  it.each([
    ['ZABUZA MOMOCHI', 'hide-with-zabuza-5'],
    ['KYODAIGUMO', 'hide-with-giant-spider-3'],
    ['KABUTO YAKUSHI', 'kabuto-hide-5'],
  ])('matches %s → %s', (sourceName, questId) => {
    const matches = matchQuestsForEvent('character.hidden.with.source', {
      gameMode: 'ranked', sourceName,
    });
    expect(matches.map((m) => m.quest.id)).toContain(questId);
  });
});
