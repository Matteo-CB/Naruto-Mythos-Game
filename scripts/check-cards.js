const fs = require('fs');
const raw = JSON.parse(fs.readFileSync('lib/data/sets/KS/cards.json', 'utf-8'));
const data = raw.cards || raw;

const check = [
  'KS-108-R', 'KS-108-RA', 'KS-108-MV',
  'KS-112-R', 'KS-112-RA',
  'KS-116-R', 'KS-116-RA',
  'KS-128-R', 'KS-128-MV',
  'KS-145-M', 'KS-145-MV',
];

for (const id of check) {
  const c = data[id];
  if (!c) { console.log(id + ': NOT FOUND IN JSON'); continue; }
  console.log(id + ':');
  console.log('  name_en: ' + (c.name_en || 'MISSING'));
  console.log('  name_fr: ' + (c.name_fr || 'MISSING'));
  console.log('  title_en: ' + (c.title_en || 'MISSING'));
  console.log('  title_fr: ' + (c.title_fr || 'MISSING'));
  console.log('  has_visual: ' + c.has_visual);
  console.log('  image_file: ' + (c.image_file || 'NONE'));
  console.log('  rarity: ' + c.rarity);
  console.log('');
}

// Also show all cards that are MISSING visuals - updated list
console.log('=== UPDATED MISSING VISUALS ===');
let count = 0;
for (const [id, c] of Object.entries(data)) {
  if (!c.has_visual || !c.image_file) {
    console.log(id + ' | ' + c.rarity + ' | ' + (c.name_en || c.name_fr) + ' | ' + (c.title_en || c.title_fr || '') + ' | has_visual=' + c.has_visual);
    count++;
  }
}
console.log('\nTotal missing: ' + count);
