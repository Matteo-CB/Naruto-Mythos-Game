const fs = require('fs');
const path = require('path');

function findHandlerFiles(dir) {
  const results = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      results.push(...findHandlerFiles(full));
    } else if (item.name.endsWith('.ts') && item.name !== 'index.ts') {
      results.push(full);
    }
  }
  return results;
}

// 1. Find all registerEffect calls
const handlersDir = path.join(__dirname, '..', 'lib', 'effects', 'handlers');
const files = findHandlerFiles(handlersDir);
const registeredCards = new Map();

for (const file of files) {
  const content = fs.readFileSync(file, 'utf-8');
  const regex = /registerEffect\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const cardId = match[1];
    const effectType = match[2];
    if (!registeredCards.has(cardId)) {
      registeredCards.set(cardId, { effectTypes: [], files: [] });
    }
    const entry = registeredCards.get(cardId);
    entry.effectTypes.push(effectType);
    if (!entry.files.includes(file)) {
      entry.files.push(file);
    }
  }
}

// 2. Load card data
const cardData = require('../lib/data/card-data.json');
const cards = cardData.cards;

// 3. Find cards with effects
const cardsWithEffects = [];
for (const [id, card] of Object.entries(cards)) {
  if (card.effects && card.effects.length > 0) {
    cardsWithEffects.push(card);
  }
}

console.log('========================================');
console.log('EFFECT HANDLER AUDIT REPORT');
console.log('========================================');
console.log('Total cards in card-data.json: ' + Object.keys(cards).length);
console.log('Total cards with effects: ' + cardsWithEffects.length);
console.log('Total unique card IDs with registered handlers: ' + registeredCards.size);
console.log('');

// 4. Find missing handlers
console.log('========================================');
console.log('CARDS WITH EFFECTS BUT NO HANDLER');
console.log('========================================');
const missingHandlers = [];
for (const card of cardsWithEffects) {
  const hasAnyHandler = registeredCards.has(card.id);
  // RA cards fall back to R handlers
  let raFallback = false;
  if (!hasAnyHandler && card.rarity === 'RA') {
    const rId = card.id.replace(/-RA$/, '-R');
    raFallback = registeredCards.has(rId);
  }

  if (!hasAnyHandler && !raFallback) {
    missingHandlers.push(card);
  }
}

for (const card of missingHandlers) {
  const effectSummary = card.effects.map(e => e.type + ': ' + e.description).join(' | ');
  console.log(card.id + ' (' + card.name_fr + ') [' + card.rarity + '] data_complete=' + card.data_complete);
  console.log('  Effects: ' + effectSummary);
  console.log('');
}
console.log('Total missing: ' + missingHandlers.length);
console.log('');

// 5. Check for partially covered handlers (some effect types missing)
console.log('========================================');
console.log('PARTIALLY COVERED HANDLERS (some effect types missing)');
console.log('========================================');
let partialCount = 0;
for (const card of cardsWithEffects) {
  const handlerInfo = registeredCards.get(card.id);
  if (!handlerInfo) continue;

  const cardEffectTypes = [...new Set(card.effects.map(e => e.type))];
  const registeredTypes = handlerInfo.effectTypes;

  const missingTypes = cardEffectTypes.filter(t => !registeredTypes.includes(t));
  if (missingTypes.length > 0) {
    console.log(card.id + ' (' + card.name_fr + '): Missing handlers for types: ' + missingTypes.join(', '));
    console.log('  Card has: ' + cardEffectTypes.join(', '));
    console.log('  Registered: ' + registeredTypes.join(', '));
    partialCount++;
  }
}
if (partialCount === 0) console.log('None found.');
console.log('Total partial: ' + partialCount);
console.log('');

// 6. List all registered handlers
console.log('========================================');
console.log('ALL REGISTERED HANDLERS (' + registeredCards.size + ')');
console.log('========================================');
for (const [id, info] of registeredCards) {
  const shortFiles = info.files.map(f => path.basename(f));
  console.log(id + ' -> ' + info.effectTypes.join(', ') + ' [' + shortFiles.join(', ') + ']');
}
