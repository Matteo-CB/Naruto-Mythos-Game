/**
 * Question type system and dynamic question generator for the Naruto Mythos TCG quiz.
 * Generates diverse interactive question types from card data and game rules.
 */

import { getPlayableCharacters, getPlayableMissions } from '@/lib/data/cardLoader';
import type { CharacterCard, MissionCard } from '@/lib/engine/types';

// =====================================================================
// TYPE DEFINITIONS
// =====================================================================

export type QuestionType =
  | 'multipleChoice'
  | 'trueFalse'
  | 'matchPairs'
  | 'sortOrder'
  | 'fillNumber'
  | 'categorySort'
  | 'spotError';

interface BaseQuestion {
  id: string;
  type: QuestionType;
  category: string;
  difficulty: number;
  questionTextKey: string;
  questionParams?: Record<string, string>;
  questionImage?: string;
  explanationKey: string;
  explanationParams?: Record<string, string>;
}

export interface MultipleChoiceQuestion extends BaseQuestion {
  type: 'multipleChoice';
  options: string[];
  optionsAreKeys?: boolean;
  correctIndex: number;
}

export interface TrueFalseQuestion extends BaseQuestion {
  type: 'trueFalse';
  correctAnswer: boolean;
}

export interface MatchPairsQuestion extends BaseQuestion {
  type: 'matchPairs';
  pairs: Array<{
    left: string;
    right: string;
    leftImage?: string;
    rightImage?: string;
  }>;
}

export interface SortOrderQuestion extends BaseQuestion {
  type: 'sortOrder';
  items: Array<{ label: string; image?: string }>;
  correctOrder: number[];
}

export interface FillNumberQuestion extends BaseQuestion {
  type: 'fillNumber';
  correctAnswer: number;
  unitKey?: string;
}

export interface CategorySortQuestion extends BaseQuestion {
  type: 'categorySort';
  categories: string[];
  items: Array<{ label: string; correctCategory: number; image?: string }>;
}

export interface SpotErrorQuestion extends BaseQuestion {
  type: 'spotError';
  statements: Array<{
    textKey: string;
    textParams?: Record<string, string>;
    isError: boolean;
  }>;
}

export type QuizQuestion =
  | MultipleChoiceQuestion
  | TrueFalseQuestion
  | MatchPairsQuestion
  | SortOrderQuestion
  | FillNumberQuestion
  | CategorySortQuestion
  | SpotErrorQuestion;

// =====================================================================
// ANSWER TYPES
// =====================================================================

export type QuizAnswer =
  | { type: 'multipleChoice'; selectedIndex: number }
  | { type: 'trueFalse'; answer: boolean }
  | { type: 'matchPairs'; mapping: Record<number, number> }
  | { type: 'sortOrder'; order: number[] }
  | { type: 'fillNumber'; answer: number }
  | { type: 'categorySort'; mapping: Record<number, number> }
  | { type: 'spotError'; selectedIndices: number[] };

// =====================================================================
// ANSWER VALIDATION
// =====================================================================

export function isAnswerCorrect(question: QuizQuestion, answer: QuizAnswer | null): boolean {
  if (!answer) return false;
  switch (question.type) {
    case 'multipleChoice':
      return answer.type === 'multipleChoice' && answer.selectedIndex === question.correctIndex;
    case 'trueFalse':
      return answer.type === 'trueFalse' && answer.answer === question.correctAnswer;
    case 'matchPairs': {
      if (answer.type !== 'matchPairs') return false;
      return question.pairs.every((_, i) => answer.mapping[i] === i);
    }
    case 'sortOrder': {
      if (answer.type !== 'sortOrder') return false;
      return question.correctOrder.every((v, i) => answer.order[i] === v);
    }
    case 'fillNumber':
      return answer.type === 'fillNumber' && answer.answer === question.correctAnswer;
    case 'categorySort': {
      if (answer.type !== 'categorySort') return false;
      return question.items.every((item, i) => answer.mapping[i] === item.correctCategory);
    }
    case 'spotError': {
      if (answer.type !== 'spotError') return false;
      const errors = question.statements
        .map((s, i) => (s.isError ? i : -1))
        .filter((i) => i >= 0);
      const a = [...answer.selectedIndices].sort();
      const e = [...errors].sort();
      return a.length === e.length && a.every((v, i) => v === e[i]);
    }
    default:
      return false;
  }
}

export function getPartialScore(question: QuizQuestion, answer: QuizAnswer | null): number {
  if (!answer) return 0;
  switch (question.type) {
    case 'multipleChoice':
    case 'trueFalse':
    case 'fillNumber':
      return isAnswerCorrect(question, answer) ? 1 : 0;
    case 'matchPairs': {
      if (answer.type !== 'matchPairs') return 0;
      const n = question.pairs.length;
      return question.pairs.filter((_, i) => answer.mapping[i] === i).length / n;
    }
    case 'sortOrder': {
      if (answer.type !== 'sortOrder') return 0;
      const n = question.correctOrder.length;
      return question.correctOrder.filter((v, i) => answer.order[i] === v).length / n;
    }
    case 'categorySort': {
      if (answer.type !== 'categorySort') return 0;
      const n = question.items.length;
      return question.items.filter((item, i) => answer.mapping[i] === item.correctCategory).length / n;
    }
    case 'spotError': {
      if (answer.type !== 'spotError') return 0;
      const n = question.statements.length;
      const errSet = new Set(
        question.statements.map((s, i) => (s.isError ? i : -1)).filter((i) => i >= 0)
      );
      let correct = 0;
      for (let i = 0; i < n; i++) {
        if (answer.selectedIndices.includes(i) === errSet.has(i)) correct++;
      }
      return correct / n;
    }
    default:
      return 0;
  }
}

// =====================================================================
// UTILITIES
// =====================================================================

function createRng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return (s >>> 0) / 0x100000000;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const r = [...arr];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

function pick<T>(arr: T[], n: number, rng: () => number): T[] {
  return shuffle(arr, rng).slice(0, Math.min(n, arr.length));
}

function pickOne<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

function numDistractors(
  correct: number,
  count: number,
  min: number,
  max: number,
  rng: () => number
): number[] {
  const set = new Set<number>();
  let attempts = 0;
  while (set.size < count && attempts < 50) {
    const offset = Math.floor(rng() * 5) + 1;
    const val = correct + (rng() > 0.5 ? offset : -offset);
    if (val >= min && val <= max && val !== correct) set.add(val);
    attempts++;
  }
  for (let v = min; set.size < count && v <= max; v++) {
    if (v !== correct) set.add(v);
  }
  return [...set].slice(0, count);
}

let _counter = 0;
function uid(prefix: string): string {
  return `${prefix}-${++_counter}`;
}

// Collect distinct cards by name (no duplicates)
function distinctByName(cards: CharacterCard[]): CharacterCard[] {
  const seen = new Set<string>();
  return cards.filter((c) => {
    if (seen.has(c.name_fr)) return false;
    seen.add(c.name_fr);
    return true;
  });
}

// Group key mappings
const GROUP_KEY: Record<string, string> = {
  'Leaf Village': 'quiz.group.leaf',
  'Sand Village': 'quiz.group.sand',
  'Sound Village': 'quiz.group.sound',
  Akatsuki: 'quiz.group.akatsuki',
  Independent: 'quiz.group.independent',
};

const RARITY_KEY: Record<string, string> = {
  C: 'quiz.rarity.C',
  UC: 'quiz.rarity.UC',
  R: 'quiz.rarity.R',
  RA: 'quiz.rarity.RA',
  S: 'quiz.rarity.S',
  M: 'quiz.rarity.M',
};

const EFFECT_TYPE_KEY: Record<string, string> = {
  MAIN: 'quiz.effectType.MAIN',
  UPGRADE: 'quiz.effectType.UPGRADE',
  AMBUSH: 'quiz.effectType.AMBUSH',
  SCORE: 'quiz.effectType.SCORE',
};

const ALL_GROUPS = ['Leaf Village', 'Sand Village', 'Sound Village', 'Akatsuki', 'Independent'];
const ALL_EFFECT_TYPES = ['MAIN', 'UPGRADE', 'AMBUSH', 'SCORE'] as const;

// =====================================================================
// GENERATORS
// =====================================================================

type Gen = (
  chars: CharacterCard[],
  missions: MissionCard[],
  rng: () => number
) => QuizQuestion | null;

// --------------- STATS ---------------

const genChakraCostMC: Gen = (chars, _, rng) => {
  const card = pickOne(
    chars.filter((c) => c.chakra > 0),
    rng
  );
  if (!card) return null;
  const ds = numDistractors(card.chakra, 3, 0, 10, rng);
  const options = shuffle([card.chakra.toString(), ...ds.map(String)], rng);
  return {
    id: uid('cc-mc'),
    type: 'multipleChoice',
    category: 'stats',
    difficulty: 1,
    questionTextKey: 'quiz.q.whatChakraCost',
    questionParams: { name: card.name_fr },
    questionImage: card.image_file,
    options,
    correctIndex: options.indexOf(card.chakra.toString()),
    explanationKey: 'quiz.exp.chakraCost',
    explanationParams: { name: card.name_fr, value: card.chakra.toString() },
  };
};

const genPowerMC: Gen = (chars, _, rng) => {
  const card = pickOne(
    chars.filter((c) => c.power > 0),
    rng
  );
  if (!card) return null;
  const ds = numDistractors(card.power, 3, 0, 10, rng);
  const options = shuffle([card.power.toString(), ...ds.map(String)], rng);
  return {
    id: uid('pw-mc'),
    type: 'multipleChoice',
    category: 'stats',
    difficulty: 1,
    questionTextKey: 'quiz.q.whatPower',
    questionParams: { name: card.name_fr },
    questionImage: card.image_file,
    options,
    correctIndex: options.indexOf(card.power.toString()),
    explanationKey: 'quiz.exp.power',
    explanationParams: { name: card.name_fr, value: card.power.toString() },
  };
};

const genChakraFill: Gen = (chars, _, rng) => {
  const card = pickOne(chars, rng);
  if (!card) return null;
  return {
    id: uid('cc-fn'),
    type: 'fillNumber',
    category: 'stats',
    difficulty: 1,
    questionTextKey: 'quiz.q.enterChakraCost',
    questionParams: { name: card.name_fr },
    questionImage: card.image_file,
    correctAnswer: card.chakra,
    unitKey: 'quiz.unit.chakra',
    explanationKey: 'quiz.exp.chakraCost',
    explanationParams: { name: card.name_fr, value: card.chakra.toString() },
  };
};

const genPowerFill: Gen = (chars, _, rng) => {
  const card = pickOne(chars, rng);
  if (!card) return null;
  return {
    id: uid('pw-fn'),
    type: 'fillNumber',
    category: 'stats',
    difficulty: 1,
    questionTextKey: 'quiz.q.enterPower',
    questionParams: { name: card.name_fr },
    questionImage: card.image_file,
    correctAnswer: card.power,
    explanationKey: 'quiz.exp.power',
    explanationParams: { name: card.name_fr, value: card.power.toString() },
  };
};

const genStatsTF: Gen = (chars, _, rng) => {
  const card = pickOne(chars, rng);
  if (!card) return null;
  const isCost = rng() > 0.5;
  const stat = isCost ? card.chakra : card.power;
  const isTrue = rng() > 0.4;
  let displayValue = stat;
  if (!isTrue) {
    const offsets = [1, 2, -1, -2].filter((o) => stat + o >= 0);
    if (offsets.length === 0) return null;
    displayValue = stat + pickOne(offsets, rng);
  }
  return {
    id: uid('st-tf'),
    type: 'trueFalse',
    category: 'stats',
    difficulty: 1,
    questionTextKey: isCost ? 'quiz.q.hasCostTF' : 'quiz.q.hasPowerTF',
    questionParams: { name: card.name_fr, value: displayValue.toString() },
    questionImage: card.image_file,
    correctAnswer: isTrue,
    explanationKey: isCost ? 'quiz.exp.chakraCost' : 'quiz.exp.power',
    explanationParams: { name: card.name_fr, value: stat.toString() },
  };
};

const genMatchChakraPairs: Gen = (chars, _, rng) => {
  // Pick 4 cards with distinct chakra costs
  const distinct: CharacterCard[] = [];
  const usedCosts = new Set<number>();
  for (const c of shuffle(distinctByName(chars), rng)) {
    if (!usedCosts.has(c.chakra) && c.chakra > 0) {
      distinct.push(c);
      usedCosts.add(c.chakra);
      if (distinct.length === 4) break;
    }
  }
  if (distinct.length < 4) return null;
  return {
    id: uid('mc-mp'),
    type: 'matchPairs',
    category: 'stats',
    difficulty: 2,
    questionTextKey: 'quiz.q.matchChakraCost',
    pairs: distinct.map((c) => ({
      left: c.name_fr,
      right: c.chakra.toString(),
      leftImage: c.image_file,
    })),
    explanationKey: 'quiz.exp.correctMatch',
  };
};

const genMatchPowerPairs: Gen = (chars, _, rng) => {
  const distinct: CharacterCard[] = [];
  const usedPowers = new Set<number>();
  for (const c of shuffle(distinctByName(chars), rng)) {
    if (!usedPowers.has(c.power) && c.power > 0) {
      distinct.push(c);
      usedPowers.add(c.power);
      if (distinct.length === 4) break;
    }
  }
  if (distinct.length < 4) return null;
  return {
    id: uid('mp-mp'),
    type: 'matchPairs',
    category: 'stats',
    difficulty: 2,
    questionTextKey: 'quiz.q.matchPower',
    pairs: distinct.map((c) => ({
      left: c.name_fr,
      right: c.power.toString(),
      leftImage: c.image_file,
    })),
    explanationKey: 'quiz.exp.correctMatch',
  };
};

const genSortByPower: Gen = (chars, _, rng) => {
  const distinct: CharacterCard[] = [];
  const usedPowers = new Set<number>();
  for (const c of shuffle(distinctByName(chars), rng)) {
    if (!usedPowers.has(c.power) && c.power > 0) {
      distinct.push(c);
      usedPowers.add(c.power);
      if (distinct.length === 4) break;
    }
  }
  if (distinct.length < 4) return null;
  const sorted = [...distinct].sort((a, b) => a.power - b.power);
  return {
    id: uid('sp-so'),
    type: 'sortOrder',
    category: 'stats',
    difficulty: 3,
    questionTextKey: 'quiz.q.sortByPower',
    items: sorted.map((c) => ({ label: c.name_fr, image: c.image_file })),
    correctOrder: sorted.map((_, i) => i),
    explanationKey: 'quiz.exp.correctOrder',
    explanationParams: {
      order: sorted.map((c) => `${c.name_fr}: ${c.power}`).join(', '),
    },
  };
};

const genSortByChakra: Gen = (chars, _, rng) => {
  const distinct: CharacterCard[] = [];
  const usedCosts = new Set<number>();
  for (const c of shuffle(distinctByName(chars), rng)) {
    if (!usedCosts.has(c.chakra) && c.chakra > 0) {
      distinct.push(c);
      usedCosts.add(c.chakra);
      if (distinct.length === 4) break;
    }
  }
  if (distinct.length < 4) return null;
  const sorted = [...distinct].sort((a, b) => a.chakra - b.chakra);
  return {
    id: uid('sc-so'),
    type: 'sortOrder',
    category: 'stats',
    difficulty: 3,
    questionTextKey: 'quiz.q.sortByChakra',
    items: sorted.map((c) => ({ label: c.name_fr, image: c.image_file })),
    correctOrder: sorted.map((_, i) => i),
    explanationKey: 'quiz.exp.correctOrder',
    explanationParams: {
      order: sorted.map((c) => `${c.name_fr}: ${c.chakra}`).join(', '),
    },
  };
};

// --------------- IDENTITY ---------------

const genIdentifyCard: Gen = (chars, _, rng) => {
  const unique = distinctByName(chars).filter((c) => c.image_file);
  if (unique.length < 4) return null;
  const selected = pick(unique, 4, rng);
  const correct = selected[0];
  const options = shuffle(selected.map((c) => c.name_fr), rng);
  return {
    id: uid('id-mc'),
    type: 'multipleChoice',
    category: 'identity',
    difficulty: 1,
    questionTextKey: 'quiz.q.identifyCard',
    questionImage: correct.image_file,
    options,
    correctIndex: options.indexOf(correct.name_fr),
    explanationKey: 'quiz.exp.cardIs',
    explanationParams: { name: correct.name_fr },
  };
};

const genRarityMC: Gen = (chars, _, rng) => {
  const card = pickOne(chars, rng);
  if (!card || !RARITY_KEY[card.rarity]) return null;
  const correctKey = RARITY_KEY[card.rarity];
  const otherKeys = Object.values(RARITY_KEY).filter((k) => k !== correctKey);
  const distractors = pick(otherKeys, 3, rng);
  const options = shuffle([correctKey, ...distractors], rng);
  return {
    id: uid('ra-mc'),
    type: 'multipleChoice',
    category: 'identity',
    difficulty: 2,
    questionTextKey: 'quiz.q.whatRarity',
    questionParams: { name: card.name_fr },
    questionImage: card.image_file,
    options,
    optionsAreKeys: true,
    correctIndex: options.indexOf(correctKey),
    explanationKey: 'quiz.exp.rarity',
    explanationParams: { name: card.name_fr, rarity: card.rarity },
  };
};

const genMatchImagePairs: Gen = (chars, _, rng) => {
  const unique = distinctByName(chars).filter((c) => c.image_file);
  if (unique.length < 4) return null;
  const selected = pick(unique, 4, rng);
  return {
    id: uid('mi-mp'),
    type: 'matchPairs',
    category: 'identity',
    difficulty: 2,
    questionTextKey: 'quiz.q.matchImage',
    pairs: selected.map((c) => ({
      left: c.name_fr,
      right: c.name_fr,
      rightImage: c.image_file,
    })),
    explanationKey: 'quiz.exp.correctMatch',
  };
};

const genTitleMC: Gen = (chars, _, rng) => {
  const withTitle = chars.filter((c) => c.title_fr && c.title_fr.trim() !== '');
  if (withTitle.length < 4) return null;
  const selected = pick(distinctByName(withTitle), 4, rng);
  if (selected.length < 4) return null;
  const correct = selected[0];
  const options = shuffle(selected.map((c) => c.title_fr), rng);
  return {
    id: uid('ti-mc'),
    type: 'multipleChoice',
    category: 'identity',
    difficulty: 2,
    questionTextKey: 'quiz.q.whatTitle',
    questionParams: { name: correct.name_fr },
    questionImage: correct.image_file,
    options,
    correctIndex: options.indexOf(correct.title_fr),
    explanationKey: 'quiz.exp.title',
    explanationParams: { name: correct.name_fr, title: correct.title_fr },
  };
};

// --------------- EFFECTS ---------------

const genEffectTypeMC: Gen = (chars, _, rng) => {
  const withEffects = chars.filter((c) => c.effects.length > 0);
  if (withEffects.length === 0) return null;
  const card = pickOne(withEffects, rng);
  const types = [...new Set(card.effects.map((e) => e.type))];
  const correctKey = EFFECT_TYPE_KEY[types[0]];
  // All 4 effect types as options
  const options = ALL_EFFECT_TYPES.map((t) => EFFECT_TYPE_KEY[t]);
  return {
    id: uid('et-mc'),
    type: 'multipleChoice',
    category: 'effects',
    difficulty: 2,
    questionTextKey: 'quiz.q.whatEffectType',
    questionParams: { name: card.name_fr },
    questionImage: card.image_file,
    options,
    optionsAreKeys: true,
    correctIndex: options.indexOf(correctKey),
    explanationKey: 'quiz.exp.effectType',
    explanationParams: { name: card.name_fr, types: types.join(', ') },
  };
};

const genEffectTF: Gen = (chars, _, rng) => {
  const withEffects = chars.filter((c) => c.effects.length > 0);
  if (withEffects.length === 0) return null;
  const card = pickOne(withEffects, rng);
  const cardTypes = new Set(card.effects.map((e) => e.type));
  const chosenType = pickOne(ALL_EFFECT_TYPES, rng);
  const isTrue = cardTypes.has(chosenType);
  return {
    id: uid('ef-tf'),
    type: 'trueFalse',
    category: 'effects',
    difficulty: 2,
    questionTextKey: 'quiz.q.hasEffectTF',
    questionParams: { name: card.name_fr, type: chosenType },
    questionImage: card.image_file,
    correctAnswer: isTrue,
    explanationKey: 'quiz.exp.effectType',
    explanationParams: { name: card.name_fr, types: [...cardTypes].join(', ') },
  };
};

const genMatchEffectTypes: Gen = (chars, _, rng) => {
  // Pick 4 cards with distinct primary effect types
  const byType: Record<string, CharacterCard[]> = {};
  for (const c of distinctByName(chars)) {
    if (c.effects.length > 0) {
      const t = c.effects[0].type;
      if (!byType[t]) byType[t] = [];
      byType[t].push(c);
    }
  }
  const types = Object.keys(byType);
  if (types.length < 3) return null;
  const selectedTypes = pick(types, Math.min(4, types.length), rng);
  const selected = selectedTypes.map((t) => pickOne(byType[t], rng));
  return {
    id: uid('me-mp'),
    type: 'matchPairs',
    category: 'effects',
    difficulty: 3,
    questionTextKey: 'quiz.q.matchEffectType',
    pairs: selected.map((c) => ({
      left: c.name_fr,
      right: c.effects[0].type,
      leftImage: c.image_file,
    })),
    explanationKey: 'quiz.exp.correctMatch',
  };
};

// --------------- GROUPS & KEYWORDS ---------------

const genGroupMC: Gen = (chars, _, rng) => {
  const card = pickOne(chars, rng);
  if (!card || !GROUP_KEY[card.group]) return null;
  const correctKey = GROUP_KEY[card.group];
  const otherKeys = Object.values(GROUP_KEY).filter((k) => k !== correctKey);
  const distractors = pick(otherKeys, 3, rng);
  const options = shuffle([correctKey, ...distractors], rng);
  return {
    id: uid('gr-mc'),
    type: 'multipleChoice',
    category: 'groups',
    difficulty: 1,
    questionTextKey: 'quiz.q.whatGroup',
    questionParams: { name: card.name_fr },
    questionImage: card.image_file,
    options,
    optionsAreKeys: true,
    correctIndex: options.indexOf(correctKey),
    explanationKey: 'quiz.exp.group',
    explanationParams: { name: card.name_fr, group: card.group },
  };
};

const genKeywordTF: Gen = (chars, _, rng) => {
  const withKeywords = chars.filter((c) => c.keywords.length > 0);
  if (withKeywords.length === 0) return null;
  const card = pickOne(withKeywords, rng);
  const allKeywords = [...new Set(chars.flatMap((c) => c.keywords))].filter(Boolean);
  if (allKeywords.length < 2) return null;
  const isTrue = rng() > 0.5;
  let keyword: string;
  if (isTrue) {
    keyword = pickOne(card.keywords, rng);
  } else {
    const others = allKeywords.filter((k) => !card.keywords.includes(k));
    if (others.length === 0) return null;
    keyword = pickOne(others, rng);
  }
  return {
    id: uid('kw-tf'),
    type: 'trueFalse',
    category: 'groups',
    difficulty: 3,
    questionTextKey: 'quiz.q.hasKeywordTF',
    questionParams: { name: card.name_fr, keyword },
    questionImage: card.image_file,
    correctAnswer: isTrue,
    explanationKey: 'quiz.exp.keyword',
    explanationParams: { name: card.name_fr, keywords: card.keywords.join(', ') },
  };
};

const genMatchGroupPairs: Gen = (chars, _, rng) => {
  // Pick 4 cards from different groups
  const byGroup: Record<string, CharacterCard[]> = {};
  for (const c of distinctByName(chars)) {
    if (!byGroup[c.group]) byGroup[c.group] = [];
    byGroup[c.group].push(c);
  }
  const groups = Object.keys(byGroup).filter((g) => GROUP_KEY[g]);
  if (groups.length < 3) return null;
  const selectedGroups = pick(groups, Math.min(4, groups.length), rng);
  const selected = selectedGroups.map((g) => pickOne(byGroup[g], rng));
  return {
    id: uid('mg-mp'),
    type: 'matchPairs',
    category: 'groups',
    difficulty: 2,
    questionTextKey: 'quiz.q.matchGroup',
    pairs: selected.map((c) => ({
      left: c.name_fr,
      right: c.group,
      leftImage: c.image_file,
    })),
    explanationKey: 'quiz.exp.correctMatch',
  };
};

const genCategorySortGroup: Gen = (chars, _, rng) => {
  // Pick 2-3 groups and 6-8 characters to sort
  const byGroup: Record<string, CharacterCard[]> = {};
  for (const c of distinctByName(chars)) {
    if (!byGroup[c.group]) byGroup[c.group] = [];
    byGroup[c.group].push(c);
  }
  const availableGroups = Object.keys(byGroup).filter(
    (g) => GROUP_KEY[g] && byGroup[g].length >= 2
  );
  if (availableGroups.length < 2) return null;
  const selectedGroups = pick(availableGroups, Math.min(3, availableGroups.length), rng);
  const items: Array<{ label: string; correctCategory: number; image?: string }> = [];
  for (let gi = 0; gi < selectedGroups.length; gi++) {
    const groupCards = pick(byGroup[selectedGroups[gi]], 2, rng);
    for (const c of groupCards) {
      items.push({ label: c.name_fr, correctCategory: gi, image: c.image_file });
    }
  }
  return {
    id: uid('cs-cs'),
    type: 'categorySort',
    category: 'groups',
    difficulty: 3,
    questionTextKey: 'quiz.q.sortByGroup',
    categories: selectedGroups.map((g) => GROUP_KEY[g]),
    items: shuffle(items, rng),
    explanationKey: 'quiz.exp.correctMatch',
  };
};

// --------------- MISSIONS ---------------

const genIdentifyMission: Gen = (_, missions, rng) => {
  const withImage = missions.filter((m) => m.image_file);
  if (withImage.length < 4) return null;
  const selected = pick(withImage, 4, rng);
  const correct = selected[0];
  const options = shuffle(selected.map((m) => m.name_fr), rng);
  return {
    id: uid('im-mc'),
    type: 'multipleChoice',
    category: 'missions',
    difficulty: 2,
    questionTextKey: 'quiz.q.identifyMission',
    questionImage: correct.image_file,
    options,
    correctIndex: options.indexOf(correct.name_fr),
    explanationKey: 'quiz.exp.missionIs',
    explanationParams: { name: correct.name_fr },
  };
};

const genMissionEffectMC: Gen = (_, missions, rng) => {
  const withEffects = missions.filter((m) => m.effects.length > 0);
  if (withEffects.length < 4) return null;
  const selected = pick(withEffects, 4, rng);
  const correct = selected[0];
  const correctDesc = correct.effects[0]?.description ?? '';
  if (!correctDesc) return null;
  const options = shuffle(selected.map((m) => m.effects[0]?.description ?? '?'), rng);
  return {
    id: uid('me-mc'),
    type: 'multipleChoice',
    category: 'missions',
    difficulty: 3,
    questionTextKey: 'quiz.q.missionEffect',
    questionParams: { name: correct.name_fr },
    questionImage: correct.image_file,
    options,
    correctIndex: options.indexOf(correctDesc),
    explanationKey: 'quiz.exp.missionIs',
    explanationParams: { name: correct.name_fr },
  };
};

// --------------- ADVANCED ---------------

const genUpgradeCostFill: Gen = (chars, _, rng) => {
  // Pick two cards with same name but different costs
  const nameMap: Record<string, CharacterCard[]> = {};
  for (const c of chars) {
    if (!nameMap[c.name_fr]) nameMap[c.name_fr] = [];
    nameMap[c.name_fr].push(c);
  }
  const upgradable = Object.values(nameMap).filter((cards) => {
    const costs = [...new Set(cards.map((c) => c.chakra))];
    return costs.length >= 2;
  });

  if (upgradable.length > 0) {
    const group = pickOne(upgradable, rng);
    const costs = [...new Set(group.map((c) => c.chakra))].sort((a, b) => a - b);
    const from = costs[0];
    const to = costs[costs.length - 1];
    if (to > from) {
      return {
        id: uid('uc-fn'),
        type: 'fillNumber',
        category: 'advanced',
        difficulty: 3,
        questionTextKey: 'quiz.q.upgradeCost',
        questionParams: { from: from.toString(), to: to.toString() },
        correctAnswer: to - from,
        unitKey: 'quiz.unit.chakra',
        explanationKey: 'quiz.exp.upgradeCost',
        explanationParams: {
          from: from.toString(),
          to: to.toString(),
          value: (to - from).toString(),
        },
      };
    }
  }

  // Fallback: generate with random plausible costs
  const from = Math.floor(rng() * 4) + 1;
  const to = from + Math.floor(rng() * 4) + 1;
  return {
    id: uid('uc-fn'),
    type: 'fillNumber',
    category: 'advanced',
    difficulty: 3,
    questionTextKey: 'quiz.q.upgradeCost',
    questionParams: { from: from.toString(), to: to.toString() },
    correctAnswer: to - from,
    unitKey: 'quiz.unit.chakra',
    explanationKey: 'quiz.exp.upgradeCost',
    explanationParams: {
      from: from.toString(),
      to: to.toString(),
      value: (to - from).toString(),
    },
  };
};

const genSpotErrorCard: Gen = (chars, _, rng) => {
  const card = pickOne(
    chars.filter((c) => c.effects.length > 0 && c.chakra > 0 && c.power > 0),
    rng
  );
  if (!card) return null;

  // Generate 4 statements, one with an error
  const errorIndex = Math.floor(rng() * 4);

  const statements: SpotErrorQuestion['statements'] = [];

  // Statement 0: chakra cost
  const wrongChakra = card.chakra + (rng() > 0.5 ? 1 : -1);
  statements.push({
    textKey: 'quiz.stmt.costIs',
    textParams: {
      name: card.name_fr,
      value: (errorIndex === 0 ? Math.max(0, wrongChakra) : card.chakra).toString(),
    },
    isError: errorIndex === 0,
  });

  // Statement 1: power
  const wrongPower = card.power + (rng() > 0.5 ? 1 : -1);
  statements.push({
    textKey: 'quiz.stmt.powerIs',
    textParams: {
      name: card.name_fr,
      value: (errorIndex === 1 ? Math.max(0, wrongPower) : card.power).toString(),
    },
    isError: errorIndex === 1,
  });

  // Statement 2: group
  const otherGroups = ALL_GROUPS.filter((g) => g !== card.group);
  const wrongGroup = otherGroups.length > 0 ? pickOne(otherGroups, rng) : card.group;
  statements.push({
    textKey: 'quiz.stmt.groupIs',
    textParams: {
      name: card.name_fr,
      group: errorIndex === 2 ? wrongGroup : card.group,
    },
    isError: errorIndex === 2,
  });

  // Statement 3: effect type
  const cardTypes = card.effects.map((e) => e.type);
  const otherTypes = ALL_EFFECT_TYPES.filter((t) => !cardTypes.includes(t));
  const wrongType = otherTypes.length > 0 ? pickOne(otherTypes, rng) : cardTypes[0];
  statements.push({
    textKey: 'quiz.stmt.effectIs',
    textParams: {
      name: card.name_fr,
      type: errorIndex === 3 ? wrongType : cardTypes[0],
    },
    isError: errorIndex === 3,
  });

  return {
    id: uid('se-se'),
    type: 'spotError',
    category: 'advanced',
    difficulty: 3,
    questionTextKey: 'quiz.q.spotError',
    questionParams: { name: card.name_fr },
    questionImage: card.image_file,
    statements,
    explanationKey: 'quiz.exp.spotError',
    explanationParams: { name: card.name_fr },
  };
};

const genCategorySortRarity: Gen = (chars, _, rng) => {
  const byRarity: Record<string, CharacterCard[]> = {};
  for (const c of distinctByName(chars)) {
    if (!byRarity[c.rarity]) byRarity[c.rarity] = [];
    byRarity[c.rarity].push(c);
  }
  const available = Object.keys(byRarity).filter(
    (r) => RARITY_KEY[r] && byRarity[r].length >= 2
  );
  if (available.length < 2) return null;
  const selectedRarities = pick(available, Math.min(3, available.length), rng);
  const items: Array<{ label: string; correctCategory: number; image?: string }> = [];
  for (let ri = 0; ri < selectedRarities.length; ri++) {
    const rarityCards = pick(byRarity[selectedRarities[ri]], 2, rng);
    for (const c of rarityCards) {
      items.push({ label: c.name_fr, correctCategory: ri, image: c.image_file });
    }
  }
  return {
    id: uid('cr-cs'),
    type: 'categorySort',
    category: 'identity',
    difficulty: 3,
    questionTextKey: 'quiz.q.sortByRarity',
    categories: selectedRarities.map((r) => RARITY_KEY[r]),
    items: shuffle(items, rng),
    explanationKey: 'quiz.exp.correctMatch',
  };
};

// =====================================================================
// MAIN GENERATOR
// =====================================================================

const QUESTION_COUNTS: Record<number, number> = {
  1: 10,
  2: 15,
  3: 20,
  4: 25,
  5: 30,
};

export function generateQuizQuestions(
  difficulty: number,
  count?: number,
  seed?: number
): QuizQuestion[] {
  const rng = createRng(seed ?? Date.now());
  const chars = getPlayableCharacters().filter((c) => !c.is_rare_art);
  const missions = getPlayableMissions();
  const totalCount = count ?? QUESTION_COUNTS[difficulty] ?? 15;

  // Select generators by difficulty
  const generators: Array<{ gen: Gen; weight: number }> = [];

  // Difficulty 1+: basic stats, identity, groups
  generators.push(
    { gen: genChakraCostMC, weight: 3 },
    { gen: genPowerMC, weight: 3 },
    { gen: genChakraFill, weight: 2 },
    { gen: genPowerFill, weight: 2 },
    { gen: genStatsTF, weight: 3 },
    { gen: genIdentifyCard, weight: 3 },
    { gen: genGroupMC, weight: 3 }
  );

  // Difficulty 2+: matching, rarities, effects, missions
  if (difficulty >= 2) {
    generators.push(
      { gen: genMatchChakraPairs, weight: 2 },
      { gen: genMatchPowerPairs, weight: 2 },
      { gen: genRarityMC, weight: 2 },
      { gen: genMatchImagePairs, weight: 2 },
      { gen: genEffectTypeMC, weight: 3 },
      { gen: genEffectTF, weight: 2 },
      { gen: genMatchGroupPairs, weight: 2 },
      { gen: genIdentifyMission, weight: 2 },
      { gen: genTitleMC, weight: 2 }
    );
  }

  // Difficulty 3+: sorting, advanced, spot-the-error
  if (difficulty >= 3) {
    generators.push(
      { gen: genSortByPower, weight: 2 },
      { gen: genSortByChakra, weight: 2 },
      { gen: genMatchEffectTypes, weight: 2 },
      { gen: genKeywordTF, weight: 2 },
      { gen: genCategorySortGroup, weight: 2 },
      { gen: genCategorySortRarity, weight: 2 },
      { gen: genUpgradeCostFill, weight: 2 },
      { gen: genSpotErrorCard, weight: 3 },
      { gen: genMissionEffectMC, weight: 2 }
    );
  }

  // Get rules questions (lazy import to avoid circular dependency at type level)
  let rulesQs: QuizQuestion[] = [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getRulesQuestions } = require('./rulesQuestions');
    rulesQs = getRulesQuestions(Math.min(difficulty, 5) as 1 | 2 | 3 | 4 | 5);
  } catch {
    // Rules questions not available
  }
  const selectedRules = pick(rulesQs, Math.ceil(totalCount * 0.2), rng);

  // Generate card-based questions
  const cardQsNeeded = totalCount - selectedRules.length;
  const cardQs: QuizQuestion[] = [];
  const totalWeight = generators.reduce((s, g) => s + g.weight, 0);
  let attempts = 0;

  while (cardQs.length < cardQsNeeded && attempts < cardQsNeeded * 8) {
    // Weighted random generator selection
    let r = rng() * totalWeight;
    let selectedGen = generators[0].gen;
    for (const { gen, weight } of generators) {
      r -= weight;
      if (r <= 0) {
        selectedGen = gen;
        break;
      }
    }

    const q = selectedGen(chars, missions, rng);
    if (q) {
      cardQs.push(q);
    }
    attempts++;
  }

  return shuffle([...selectedRules, ...cardQs], rng).slice(0, totalCount);
}
