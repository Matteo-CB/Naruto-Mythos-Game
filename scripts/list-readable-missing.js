const fs = require('fs');
const data = JSON.parse(fs.readFileSync('lib/data/card-data.json', 'utf-8'));

const cards = Object.values(data.cards).filter(c => {
  if (!c.has_visual) return false;
  if (c.card_type === 'mission') {
    return !c.effects || c.effects.length === 0 || c.effects.some(e => !e.description || !e.description.trim());
  }
  return c.data_complete === false || c.chakra === 0 || !c.effects || c.effects.length === 0 || !c.keywords || c.keywords.length === 0 || !c.title_fr;
});

cards.sort((a, b) => {
  const ro = { C: 0, UC: 1, R: 2, RART: 3, S: 4, M: 6, MV: 7, MMS: 9 };
  const ra = ro[a.rarity] ?? 99;
  const rb = ro[b.rarity] ?? 99;
  if (ra !== rb) return ra - rb;
  return parseInt(a.number) - parseInt(b.number);
});

cards.forEach(c => console.log(c.id + ' | ' + c.image_file));
console.log('Total: ' + cards.length);
