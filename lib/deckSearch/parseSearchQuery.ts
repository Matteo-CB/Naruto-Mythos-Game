export const normalizeStr = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export interface KeywordFilter {
  terms: string[];
  exclusive: boolean;
  negated: boolean;
}

export interface NumFilter { op: '=' | '>' | '>=' | '<' | '<='; val: number; negated: boolean }

export interface SearchFilter {
  nameQueries: Array<{ text: string; negated: boolean }>;
  chakra: NumFilter[];
  power: NumFilter[];
  keywords: KeywordFilter[];
  groups: Array<{ value: string; negated: boolean }>;
  rarities: Array<{ value: string; negated: boolean }>;
  sets: Array<{ value: string; negated: boolean }>;
  effects: Array<{ value: string; negated: boolean }>;
  effectText: Array<{ value: string; negated: boolean }>;
  effectMainText: Array<{ value: string; negated: boolean }>;
  effectMainInstantText: Array<{ value: string; negated: boolean }>;
  effectMainContinuousText: Array<{ value: string; negated: boolean }>;
  effectUpgradeText: Array<{ value: string; negated: boolean }>;
  effectAmbushText: Array<{ value: string; negated: boolean }>;
  effectAttachText: Array<{ value: string; negated: boolean }>;
  effectDuelText: Array<{ value: string; negated: boolean }>;
  effectFirstStrikeText: Array<{ value: string; negated: boolean }>;
  effectScoreText: Array<{ value: string; negated: boolean }>;
  nameVersions: Array<{ value: string; negated: boolean }>;
  effectFunctions: Array<{ value: string; negated: boolean }>;
}

export function emptyFilter(): SearchFilter {
  return {
    nameQueries: [], chakra: [], power: [], keywords: [], groups: [],
    rarities: [], sets: [], effects: [], effectText: [],
    effectMainText: [], effectMainInstantText: [], effectMainContinuousText: [],
    effectUpgradeText: [], effectAmbushText: [], effectAttachText: [], effectDuelText: [], effectFirstStrikeText: [],
    effectScoreText: [], nameVersions: [],
    effectFunctions: [],
  };
}

export function parseSearchQuery(raw: string): SearchFilter {
  const filter = emptyFilter();
  
  let normalized = raw.replace(/,\s*/g, ' ');
  
  normalized = normalized.replace(/(\w+):?\[([^\]]+)\](\+\S+)?/g, (_, key, content, suffix) => `${key}:"${content}${suffix ?? ''}"`);

  const tokenRegex = /(-)?(eup|emi|emc|em|eat|ea|ed|ef|es|nv|[cpkgresf])(:|=|>=|<=|>|<)("([^"]+)"|(\S+))/gi;
  let remaining = normalized;

  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(normalized)) !== null) {
    const negated = match[1] === '-';
    const key = match[2].toLowerCase();
    const op = match[3] === ':' ? '=' : match[3];
    const value = match[5] ?? match[6];
    remaining = remaining.replace(match[0], '');

    const values = value.split('/').map((v) => v.trim()).filter(Boolean);

    for (const val of values) {
      switch (key) {
        case 'c': {
          const num = parseInt(val, 10);
          if (!isNaN(num)) filter.chakra.push({ op: op as NumFilter['op'], val: num, negated });
          break;
        }
        case 'p': {
          const num = parseInt(val, 10);
          if (!isNaN(num)) filter.power.push({ op: op as NumFilter['op'], val: num, negated });
          break;
        }
        case 'k': {
          const exclusive = val.startsWith('!');
          const cleanVal = exclusive ? val.slice(1) : val;
          const terms = cleanVal.split('+').map((t) => normalizeStr(t.trim())).filter(Boolean);
          if (terms.length > 0) filter.keywords.push({ terms, exclusive, negated });
          break;
        }
        case 'g': filter.groups.push({ value: normalizeStr(val), negated }); break;
        case 'r': filter.rarities.push({ value: val.toUpperCase(), negated }); break;
        case 's': filter.sets.push({ value: val.toUpperCase(), negated }); break;
        case 'nv': filter.nameVersions.push({ value: normalizeStr(val), negated }); break;
        case 'e': {
          const upper = val.toUpperCase();
          if (['MAIN', 'UPGRADE', 'AMBUSH', 'SCORE', 'DUEL', 'ATTACH', 'AT'].includes(upper)) {
            filter.effects.push({ value: upper === 'AT' ? 'ATTACH' : upper, negated });
          } else {
            filter.effectText.push({ value: normalizeStr(val), negated });
          }
          break;
        }
        case 'em': filter.effectMainText.push({ value: normalizeStr(val), negated }); break;
        case 'emi': filter.effectMainInstantText.push({ value: normalizeStr(val), negated }); break;
        case 'emc': filter.effectMainContinuousText.push({ value: normalizeStr(val), negated }); break;
        case 'eup': filter.effectUpgradeText.push({ value: normalizeStr(val), negated }); break;
        case 'ea': filter.effectAmbushText.push({ value: normalizeStr(val), negated }); break;
        case 'eat': filter.effectAttachText.push({ value: normalizeStr(val), negated }); break;
        case 'ed': filter.effectDuelText.push({ value: normalizeStr(val), negated }); break;
        case 'ef': filter.effectFirstStrikeText.push({ value: normalizeStr(val), negated }); break;
        case 'es': filter.effectScoreText.push({ value: normalizeStr(val), negated }); break;
        case 'f': filter.effectFunctions.push({ value: normalizeStr(val), negated }); break;
      }
    }
  }

  const leftover = remaining.trim();
  if (leftover) {
    
    const segments = leftover.split(/\s*\/\s*/);
    for (const seg of segments) {
      const trimmed = seg.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith('-') && trimmed.length > 1) {
        filter.nameQueries.push({ text: normalizeStr(trimmed.slice(1)), negated: true });
      } else {
        filter.nameQueries.push({ text: normalizeStr(trimmed), negated: false });
      }
    }
  }
  return filter;
}
