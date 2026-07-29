import { describe, it, expect } from 'vitest';
import { parseSearchQuery } from '@/lib/deckSearch/parseSearchQuery';

describe('every documented deck builder search operator is actually parsed', () => {
  it('ed: fills the duel filter and nothing else', () => {
    const filter = parseSearchQuery('ed:kimimaro');
    expect(filter.effectDuelText.map((e) => e.value)).toEqual(['kimimaro']);
    expect(filter.effectFunctions, 'ed must not leak into the function filter').toEqual([]);
    expect(filter.nameQueries, 'ed must not fall back to a name search').toEqual([]);
  });

  it('ef: fills the first strike filter, not the function filter', () => {
    const filter = parseSearchQuery('ef:temari');
    expect(filter.effectFirstStrikeText.map((e) => e.value)).toEqual(['temari']);
    expect(filter.effectFunctions, 'ef used to be swallowed as f:').toEqual([]);
    expect(filter.nameQueries).toEqual([]);
  });


  it('eat: searches inside the ATTACH line, without colliding with ea:', () => {
    const attach = parseSearchQuery('eat:mission');
    expect(attach.effectAttachText.map((e) => e.value)).toEqual(['mission']);
    expect(attach.effectAmbushText, 'eat must not be swallowed by ea').toEqual([]);
    expect(attach.nameQueries).toEqual([]);

    const ambush = parseSearchQuery('ea:move');
    expect(ambush.effectAmbushText.map((e) => e.value)).toEqual(['move']);
    expect(ambush.effectAttachText).toEqual([]);
  });

  it('e:at lists every card carrying an ATTACH effect', () => {
    expect(parseSearchQuery('e:at').effects.map((e) => e.value)).toEqual(['ATTACH']);
    expect(parseSearchQuery('e:attach').effects.map((e) => e.value)).toEqual(['ATTACH']);
  });

  it('f: still works on its own', () => {
    const filter = parseSearchQuery('f:defeat');
    expect(filter.effectFunctions.map((e) => e.value)).toEqual(['defeat']);
    expect(filter.effectFirstStrikeText).toEqual([]);
  });

  it('the longer prefixes still win over the shorter ones', () => {
    expect(parseSearchQuery('em:draw').effectMainText.map((e) => e.value)).toEqual(['draw']);
    expect(parseSearchQuery('emi:draw').effectMainInstantText.map((e) => e.value)).toEqual(['draw']);
    expect(parseSearchQuery('emc:draw').effectMainContinuousText.map((e) => e.value)).toEqual(['draw']);
    expect(parseSearchQuery('eup:draw').effectUpgradeText.map((e) => e.value)).toEqual(['draw']);
    expect(parseSearchQuery('ea:draw').effectAmbushText.map((e) => e.value)).toEqual(['draw']);
    expect(parseSearchQuery('es:draw').effectScoreText.map((e) => e.value)).toEqual(['draw']);
  });

  it('every effect operator documented in the help legend is wired', () => {
    const cases: Array<[string, keyof ReturnType<typeof parseSearchQuery>]> = [
      ['e:x', 'effectText'],
      ['em:x', 'effectMainText'],
      ['emi:x', 'effectMainInstantText'],
      ['emc:x', 'effectMainContinuousText'],
      ['eup:x', 'effectUpgradeText'],
      ['ea:x', 'effectAmbushText'],
      ['ed:x', 'effectDuelText'],
      ['eat:x', 'effectAttachText'],
      ['ef:x', 'effectFirstStrikeText'],
      ['es:x', 'effectScoreText'],
    ];
    for (const [query, field] of cases) {
      const filter = parseSearchQuery(query);
      expect((filter[field] as Array<{ value: string }>).length, `${query} must populate ${String(field)}`).toBe(1);
    }
  });

  it('negation keeps working on the repaired operators', () => {
    expect(parseSearchQuery('-ed:kimimaro').effectDuelText[0].negated).toBe(true);
    expect(parseSearchQuery('-ef:temari').effectFirstStrikeText[0].negated).toBe(true);
  });
});
