const fs = require('fs');
const data = JSON.parse(fs.readFileSync('lib/data/card-data.json', 'utf-8'));
const order = { C: 0, UC: 1, R: 2, RART: 3, S: 4, SV: 5, M: 6, MV: 7, L: 8, MMS: 9 };
const withVisual = Object.entries(data.cards).filter(([id, c]) => c.has_visual).sort((a, b) => {
  const ra = order[a[1].rarity] ?? 99;
  const rb = order[b[1].rarity] ?? 99;
  if (ra !== rb) return ra - rb;
  return parseInt(a[1].number) - parseInt(b[1].number);
});
for (const [id, c] of withVisual) {
  const kw = (c.keywords || []).join(', ');
  const effs = (c.effects || []).map(e => e.type + ': ' + e.description).join(' | ');
  console.log(id + ' | ' + c.name_fr + ' | ' + (c.title_fr || '') + ' | C' + c.chakra + '/P' + c.power + ' | KW:[' + kw + '] | G:' + c.group + ' | ' + effs);
}
console.log('---');
console.log('Total with visual: ' + withVisual.length);
