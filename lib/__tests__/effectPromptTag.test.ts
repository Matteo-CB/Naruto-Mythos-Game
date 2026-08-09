import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { buildPromptTag, duelPartnerOf, isTaggableSelection } from '@/lib/effects/promptTag';
import { getCardById } from '@/lib/data/cardIndex';

const LOCALES = ['en', 'fr', 'es', 'ja', 'pt', 'it', 'pl'];

const LEADING_TAG = new RegExp(
  '^(?:Modificateur |Modificador |Modificatore |Modyfikator )?'
  + '(?:MAIN|AMBUSH|UPGRADE|EMBUSCADE|EMBOSCADA|IMBOSCATA|ZASADZKA|待ち伏せ|SCORE|DUEL|ATTACH|FIRST STRIKE)'
  + '[  ]?[:：]',
);

describe('no prompt text repeats the tag the popup already shows', () => {
  for (const locale of LOCALES) {
    it(`${locale} carries no leading effect tag`, () => {
      const messages = JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8'));
      const desc: Record<string, string> = messages.game.effect.desc;
      const offenders = Object.entries(desc)
        .filter(([, value]) => typeof value === 'string' && LEADING_TAG.test(value))
        .map(([key]) => key);
      expect(offenders, 'the tag is rendered automatically, never typed into the text').toEqual([]);
    });
  }

  it('a mention inside the sentence is left alone', () => {
    const en = JSON.parse(readFileSync('messages/en.json', 'utf8')).game.effect.desc;
    expect(en.kakashi016ConfirmUpgrade, 'an effect alteration keeps its reference')
      .toContain('MAIN effect:');
    expect(en.chooseScoreOrder).toContain('SCORE');
    expect(en.ssMss06ConfirmAmbush, 'the mission name stays in front').toContain('Keep a Low Profile');
  });

  it('every description is still readable and never empty', () => {
    for (const locale of LOCALES) {
      const desc = JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8')).game.effect.desc;
      for (const [key, value] of Object.entries(desc)) {
        expect(typeof value, `${locale} ${key}`).toBe('string');
        expect((value as string).trim().length, `${locale} ${key}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('the tag the popup shows is derived, never typed', () => {
  it('a plain effect type tags itself', () => {
    expect(buildPromptTag('MAIN', 'X_CONFIRM_MAIN', null)).toEqual({ effectType: 'MAIN' });
    expect(buildPromptTag('AMBUSH', 'SS118_REVEAL_DEFEAT', null)).toEqual({ effectType: 'AMBUSH' });
  });

  it('a DUEL names its partner, read from the printed card', () => {
    const tag = buildPromptTag('DUEL', 'SS118_HIDE_SAME_NAME', getCardById('SS-118-CHIBIV'));
    expect(tag?.effectType).toBe('DUEL');
    expect(tag?.duelPartner).toBe('Temari');
  });

  it('a DUEL that alters another effect does not swallow the effect word into the name', () => {
    expect(duelPartnerOf(getCardById('SS-114-R')), 'SS-114 reads "DUEL Rock Lee MAIN effect:"')
      .toBe('Rock Lee');
  });

  it('a card without a DUEL line yields no partner', () => {
    expect(duelPartnerOf(getCardById('KS-021-C'))).toBeUndefined();
  });

  it('prompts whose effect type is not reliable show no tag at all', () => {
    expect(isTaggableSelection('REORDER_DISCARD')).toBe(false);
    expect(isTaggableSelection('CHOOSE_EFFECT_ORDER')).toBe(false);
    expect(isTaggableSelection('EFFECT_PLAY_UPGRADE_OR_FRESH')).toBe(false);
    expect(buildPromptTag('MAIN', 'REORDER_DISCARD', null)).toBeUndefined();
  });

  it('an unknown effect type never falls back to MAIN', () => {
    expect(buildPromptTag(undefined, 'ANYTHING', null)).toBeUndefined();
  });

  it('every effect type has a label in all seven languages', () => {
    const types = ['MAIN', 'UPGRADE', 'AMBUSH', 'SCORE', 'DUEL', 'ATTACH', 'FIRST_STRIKE'];
    for (const locale of LOCALES) {
      const labels = JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8')).card.effectTypes;
      for (const type of types) {
        expect(typeof labels[type], `${locale} ${type}`).toBe('string');
        expect(labels[type].length, `${locale} ${type}`).toBeGreaterThan(0);
      }
    }
  });
});
