const data = require('../lib/data/card-data.json');
const cards = data.cards;

// Find cards with data_complete=false that have effects
console.log('INCOMPLETE CARDS WITH EFFECTS:');
for (const [id, card] of Object.entries(cards)) {
  if (card.data_complete === false && card.effects && card.effects.length > 0) {
    const effectSummary = card.effects.map(e => e.type + ': ' + e.description).join(' | ');
    console.log(card.id + ' (' + card.name_fr + ') [' + card.rarity + '] ' + effectSummary);
  }
}

// Also list all Mythos cards that are NOT in card-data
console.log('');
console.log('MYTHOS HANDLER IDs vs CARD DATA:');
const mythosHandlerIds = ['KS-141-M', 'KS-142-M', 'KS-143-M', 'KS-144-M', 'KS-145-M', 'KS-146-M', 'KS-147-M', 'KS-148-M', 'KS-149-M', 'KS-150-M', 'KS-151-M', 'KS-152-M', 'KS-153-M'];
for (const id of mythosHandlerIds) {
  const inData = cards[id] ? 'YES' : 'NO';
  console.log(id + ' in card-data: ' + inData);
}

// Check R cards that have handlers with non-standard ids (113b, 116b, 119b, 124b)
console.log('');
console.log('NON-STANDARD R IDs vs CARD DATA:');
const nonStandardIds = ['KS-113b-R', 'KS-116b-R', 'KS-119b-R', 'KS-124b-R'];
for (const id of nonStandardIds) {
  const inData = cards[id] ? 'YES' : 'NO';
  console.log(id + ' in card-data: ' + inData);
}

// Check rare cards that might be registered under wrong IDs
console.log('');
console.log('ALL RARE CARD IDs IN CARD-DATA:');
for (const [id, card] of Object.entries(cards)) {
  if (card.rarity === 'R') {
    console.log(id);
  }
}
