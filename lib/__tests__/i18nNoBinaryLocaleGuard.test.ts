import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

function listFiles(): string[] {
  return execSync('git ls-files "app/**/*.tsx" "app/**/*.ts" "components/**/*.tsx" "components/**/*.ts"', { encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean)
    .filter((f) => !f.includes('__tests__'));
}

const ALLOW = new Set<string>([
  "components/cards/MissionCard.tsx::{locale === 'en' ? card.name_fr : card.name_en}",
  "components/cards/MissionCard.tsx::{(locale === 'en' || locale === 'fr') && card.name_en && card.name_fr && card.name_en !== card.name_fr && (",
  "components/game/GameBoard.tsx::{isMission && card.name_en && locale === 'fr' && (",
  'components/game/GameBoard.tsx::{card.name_en}',
  "app/[locale]/admin/booster-simulator/page.tsx::<td className=\"px-4 py-2 font-display\" style={{ color: ACCENT }}>{r}</td>",
]);

function sig(file: string, line: string): string {
  return `${file}::${line.trim()}`;
}

describe('i18n guard: no new binary-locale or raw card-name displays', () => {
  const files = listFiles();

  it('has no binary locale comparison on card text outside the allowlist', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf8').split('\n');
      for (const line of src) {
        if (!/locale\s*(===|!==)\s*['"](en|fr)['"]/.test(line)) continue;
        if (!/\bname_(fr|en)\b|\btitle_(fr|en)\b/.test(line)) continue;
        const s = sig(file, line);
        if (!ALLOW.has(s)) offenders.push(s);
      }
    }
    expect(offenders, `New binary-locale card-text selection found. Use getCardName/getCardTitle (N-locale). Offenders:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('has no direct card name/title JSX display outside the allowlist', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf8').split('\n');
      for (const line of src) {
        const isJsxNameDisplay =
          /(?:alt|aria-label)=\{[^}]*\.(name_fr|name_en|title_fr|title_en)\b/.test(line) ||
          /\{[a-zA-Z_][\w.]*\.(name_fr|name_en|title_fr|title_en)\}/.test(line);
        if (!isJsxNameDisplay) continue;
        if (/getCardName|getCardTitle|localized/.test(line)) continue;
        if (/\|\|\s*[\w.]+\.(title_en|name_en)\)/.test(line)) continue; // existence checks
        const s = sig(file, line);
        if (!ALLOW.has(s)) offenders.push(s);
      }
    }
    expect(offenders, `New raw card name/title display found. Use getCardName/getCardTitle. Offenders:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('has no effectDescriptionsFr/En direct import in UI (use getCardEffectDescription)', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      if (/from\s+['"]@\/lib\/data\/(effectTranslationsFr|effectDescriptionsEn)['"]/.test(src)) {
        offenders.push(file);
      }
    }
    expect(offenders, `Import effect descriptions via getCardEffectDescription instead. Offenders:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('has no binary "en | fr" locale type annotation in UI', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf8').split('\n');
      for (const line of src) {
        if (/locale\??\s*:\s*['"](en|fr)['"]\s*\|\s*['"](fr|en)['"]/.test(line)) {
          offenders.push(sig(file, line));
        }
      }
    }
    expect(offenders, `Binary locale type found. Use 'string'. Offenders:\n${offenders.join('\n')}`).toEqual([]);
  });
});
