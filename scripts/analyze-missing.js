const fs = require('fs');
const raw = JSON.parse(fs.readFileSync('lib/data/sets/KS/cards.json', 'utf-8'));
const data = raw.cards || raw;
const missing = [];
const existing = [];
for (const [id, card] of Object.entries(data)) {
  if (card.has_visual && card.image_file) {
    existing.push({ id, image_file: card.image_file, rarity: card.rarity });
  } else {
    missing.push({ id, number: card.number, name_fr: card.name_fr, name_en: card.name_en, title_fr: card.title_fr, title_en: card.title_en, rarity: card.rarity, card_type: card.card_type });
  }
}
console.log('=== EXISTING CARDS WITH VISUALS (' + existing.length + ') ===');
existing.forEach(c => console.log(c.id + ' | ' + c.rarity + ' | ' + c.image_file));
console.log('\n=== MISSING VISUALS (' + missing.length + ') ===');
const byRarity = {};
missing.forEach(c => { if (byRarity[c.rarity] === undefined) byRarity[c.rarity] = []; byRarity[c.rarity].push(c); });
for (const [rarity, cards] of Object.entries(byRarity)) {
  console.log('\n--- ' + rarity + ' (' + cards.length + ') ---');
  cards.forEach(c => console.log(c.id + ' | ' + c.number + ' | ' + c.name_fr + ' | ' + (c.name_en || '') + ' | ' + (c.title_fr || '') + ' | ' + (c.title_en || '')));
}
