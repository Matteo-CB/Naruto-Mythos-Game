export function cardVersionKey(cardId: string): string {
  const match = cardId.match(/^([A-Za-z]+)-(\d+)/);
  if (match) return `${match[1].toUpperCase()}-${match[2]}`;
  return cardId.replace(/\s*A$/, '').trim();
}

export function sameVersion(cardIdA: string, cardIdB: string): boolean {
  return cardVersionKey(cardIdA) === cardVersionKey(cardIdB);
}

export function isAlternateArtwork(cardId: string): boolean {
  return /^[A-Za-z]+-\d+_\d+-/.test(cardId);
}
