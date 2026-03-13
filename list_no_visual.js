const data = require('./lib/data/sets/KS/cards.json');
const cards = Object.values(data.cards);
const noVisual = cards.filter(c => c.has_visual === false);
const lines = [];
lines.push('CARTES SANS VISUEL (has_visual: false)');
lines.push('Source: lib/data/sets/KS/cards.json');
lines.push('Total: ' + noVisual.length + ' cartes');
lines.push('========================================');

const byRarity = {};
noVisual.forEach(c => {
  const r = c.rarity || 'Unknown';
  if (!byRarity[r]) byRarity[r] = [];
  byRarity[r].push(c);
});

['C','UC','R','RA','S','M','Legendary','Mission'].forEach(r => {
  if (!byRarity[r]) return;
  lines.push('');
  lines.push('=== ' + r + ' (' + byRarity[r].length + ' cartes) ===');
  byRarity[r].forEach(c => {
    const title = c.title_fr ? ' "' + c.title_fr + '"' : '';
    const chakra = c.chakra !== undefined ? c.chakra : 'N/A';
    const power = c.power !== undefined ? c.power : 'N/A';
    const img = c.image_file ? ' | image_file: ' + c.image_file : '';
    lines.push(c.id + ' | #' + c.number + ' | ' + c.name_fr + title + ' | chakra:' + chakra + ' | power:' + power + img);
  });
});

require('fs').writeFileSync('cards_without_visuals.txt', lines.join('\n') + '\n');
console.log(lines.join('\n'));
