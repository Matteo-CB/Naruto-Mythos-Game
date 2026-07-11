const BANNED_WORDS: readonly string[] = [
  'connard', 'connasse', 'enculé', 'encule', 'enculer', 'pute', 'putain', 'salope', 'salaud',
  'batard', 'bâtard', 'fdp', 'ntm', 'nique', 'niquer', 'pd', 'tapette', 'enfoiré', 'enfoire',
  'merdeux', 'pouffiasse', 'grognasse', 'negre', 'nègre', 'negro', 'bougnoule', 'youpin',
  'fuck', 'fucking', 'fucker', 'motherfucker', 'shit', 'bitch', 'asshole', 'bastard',
  'cunt', 'dick', 'dickhead', 'faggot', 'fag', 'nigger', 'nigga', 'whore', 'slut', 'retard',
  'puta', 'puto', 'mierda', 'cabron', 'cabrón', 'gilipollas', 'maricon', 'maricón',
  'joder', 'coño', 'cono', 'pendejo', 'zorra', 'polla', 'imbecil', 'imbécil',
];

const BANNED_PHRASES: readonly string[] = [
  'fils de pute', 'ta gueule', 'nique ta mere', 'nique ta mère', 'son of a bitch',
  'hijo de puta', 'me cago en tu madre',
];

const LEET_MAP: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i',
};

function normalizeToken(token: string): string {
  let out = token.toLowerCase();
  out = out.replace(/[013457@$!]/g, (c) => LEET_MAP[c] ?? c);
  out = out.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return out;
}

const NORMALIZED_WORDS: ReadonlySet<string> = new Set(BANNED_WORDS.map(normalizeToken));
const NORMALIZED_PHRASES: readonly string[][] = BANNED_PHRASES.map((p) => p.split(/\s+/).map(normalizeToken));

interface TokenSpan {
  start: number;
  end: number;
  normalized: string;
}

function tokenize(text: string): TokenSpan[] {
  const spans: TokenSpan[] = [];
  const re = /[\p{L}\p{N}@$!]+/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    spans.push({ start: m.index, end: m.index + m[0].length, normalized: normalizeToken(m[0]) });
  }
  return spans;
}

export function containsProfanity(text: string): boolean {
  const tokens = tokenize(text);
  if (tokens.some((tk) => NORMALIZED_WORDS.has(tk.normalized))) return true;
  return NORMALIZED_PHRASES.some((phrase) => phraseMatchIndex(tokens, phrase) !== -1);
}

function phraseMatchIndex(tokens: TokenSpan[], phrase: string[]): number {
  outer: for (let i = 0; i + phrase.length <= tokens.length; i++) {
    for (let j = 0; j < phrase.length; j++) {
      if (tokens[i + j].normalized !== phrase[j]) continue outer;
    }
    return i;
  }
  return -1;
}

export function maskProfanity(text: string): string {
  const tokens = tokenize(text);
  const maskedRanges: Array<[number, number]> = [];

  for (const tk of tokens) {
    if (NORMALIZED_WORDS.has(tk.normalized)) {
      maskedRanges.push([tk.start, tk.end]);
    }
  }
  for (const phrase of NORMALIZED_PHRASES) {
    let from = 0;
    for (;;) {
      const idx = phraseMatchIndex(tokens.slice(from), phrase);
      if (idx === -1) break;
      const abs = from + idx;
      maskedRanges.push([tokens[abs].start, tokens[abs + phrase.length - 1].end]);
      from = abs + 1;
    }
  }

  if (maskedRanges.length === 0) return text;

  let out = '';
  let cursor = 0;
  maskedRanges.sort((a, b) => a[0] - b[0]);
  for (const [start, end] of maskedRanges) {
    if (start < cursor) continue;
    out += text.slice(cursor, start) + '*'.repeat(end - start);
    cursor = end;
  }
  out += text.slice(cursor);
  return out;
}
