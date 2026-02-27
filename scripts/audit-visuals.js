const fs = require('fs');
const data = JSON.parse(fs.readFileSync('lib/data/card-data.json', 'utf-8'));

const missing = Object.values(data.cards)
  .filter(c => !c.has_visual && c.card_type === 'character')
  .sort((a, b) => {
    const ro = { C: 0, UC: 1, R: 2, RART: 3, S: 4, SV: 5, M: 6, MV: 7, L: 8 };
    const ra = ro[a.rarity] ?? 99;
    const rb = ro[b.rarity] ?? 99;
    if (ra !== rb) return ra - rb;
    return parseInt(a.number) - parseInt(b.number);
  });

console.log(`CARTES SANS VISUEL (${missing.length} cartes)`);

let lastRarity = '';
for (const c of missing) {
  if (c.rarity !== lastRarity) {
    const names = { C: 'COMMON', UC: 'UNCOMMON', R: 'RARE', RART: 'RARE ART', S: 'SECRET', SV: 'SECRET V', M: 'MYTHOS', MV: 'MYTHOS V' };
    console.log(`\n--- ${names[c.rarity] || c.rarity} ---`);
    lastRarity = c.rarity;
  }
  const title = c.title_fr || c.title_en || '(sans titre)';
  const dc = c.data_complete ? '' : ' [INCOMPLETE]';
  console.log(`${c.id} - ${c.name_fr} / ${title}${dc}`);
}

const missingMissions = Object.values(data.cards).filter(c => !c.has_visual && c.card_type === 'mission');
if (missingMissions.length > 0) {
  console.log('\n--- MISSIONS ---');
  for (const c of missingMissions) {
    console.log(`${c.id} - ${c.name_fr}`);
  }
}
