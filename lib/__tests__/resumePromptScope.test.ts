import { describe, expect, it } from 'vitest';
import { shouldOfferResume } from '@/lib/socket/resumeScope';
import { getCardById } from '@/lib/data/cardIndex';
import { getEffectHandler } from '@/lib/effects/EffectRegistry';
import { registerAllSetHandlers } from '@/lib/effects/handlers';
import { isStaticRankedBanned } from '@/lib/data/rankedBans';
import { getCardEffectDescriptions } from '@/lib/data/effectDescriptions';

describe('the resume prompt only shows where the game was played', () => {
  it('an online game offers to resume on the online page', () => {
    expect(shouldOfferResume('/play/online', null)).toBe(true);
    expect(shouldOfferResume('/play/online?room=ABC123', null)).toBe(true);
  });

  it('an online game never blocks the rest of the site', () => {
    for (const page of ['/', '/collection', '/deck-builder', '/leaderboard', '/profile/kutxyt',
      '/tournaments', '/quests', '/settings', '/cards/naruto-uzumaki-108']) {
      expect(shouldOfferResume(page, null), page).toBe(false);
    }
  });

  it('a tournament match offers to resume on the tournament pages only', () => {
    expect(shouldOfferResume('/tournaments', 'abc')).toBe(true);
    expect(shouldOfferResume('/tournaments/abc', 'abc')).toBe(true);
    expect(shouldOfferResume('/play/online', 'abc'), 'not the casual lobby').toBe(false);
    expect(shouldOfferResume('/collection', 'abc')).toBe(false);
  });

  it('the board itself never shows the prompt, you are already there', () => {
    expect(shouldOfferResume('/game', null)).toBe(false);
    expect(shouldOfferResume('/game', 'abc')).toBe(false);
  });
});

describe('the four Secret cards are wired in', () => {
  const SECRETS = ['SS-147-S', 'SS-148-S', 'SS-149-S', 'SS-150-S'];
  const LOCALES = ['en', 'fr', 'es', 'ja', 'pt', 'it', 'pl'];

  it('each one is a Secret, and its artwork state matches its file', () => {
    for (const id of SECRETS) {
      const card = getCardById(id)!;
      expect(card, id).toBeTruthy();
      expect(card.rarity).toBe('S');
      expect(card.has_visual, `${id} art flag matches its file`).toBe(!!card.image_file);
      if (card.image_file) {
        expect(card.image_file, `${id} stores a full path`).toMatch(new RegExp(`images/cards/SS/secret/${id}\.webp$`));
      }
    }
  });

  it('each one matches the numbered variant it belongs to', () => {
    for (const [base, variant] of [['SS-147-S', 'SS-147-SV'], ['SS-148-S', 'SS-148-SV'],
      ['SS-149-S', 'SS-149-SV'], ['SS-150-S', 'SS-150-SV']]) {
      const b = getCardById(base)!;
      const v = getCardById(variant)!;
      expect(b.chakra, base).toBe(v.chakra);
      expect(b.power, base).toBe(v.power);
      expect(b.group, base).toBe(v.group);
      expect(b.keywords, base).toEqual(v.keywords);
      expect(b.effects.map((e) => e.description), base).toEqual(v.effects.map((e) => e.description));
    }
  });

  it('their effects are wired and described everywhere', () => {
    registerAllSetHandlers();
    expect(getEffectHandler('SS-147-S', 'DUEL')).toBeTruthy();
    expect(getEffectHandler('SS-148-S', 'MAIN')).toBeTruthy();
    expect(getEffectHandler('SS-148-S', 'DUEL')).toBeTruthy();
    expect(getEffectHandler('SS-149-S', 'MAIN')).toBeTruthy();
    expect(getEffectHandler('SS-149-S', 'DUEL')).toBeTruthy();
    expect(getEffectHandler('SS-150-S', 'DUEL')).toBeTruthy();
    expect(getEffectHandler('SS-150-S', 'UPGRADE')).toBeTruthy();

    for (const locale of LOCALES) {
      for (const id of SECRETS) {
        expect((getCardEffectDescriptions(id, locale) ?? []).length, `${id} ${locale}`).toBe(2);
      }
    }
  });

  it('they stay out of ranked while the set is not released', () => {
    for (const id of SECRETS) expect(isStaticRankedBanned(id), id).toBe(true);
  });
});
