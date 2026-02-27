const fs = require('fs');

// Read both files
const auditText = fs.readFileSync('MISSING_DATA_AUDIT.txt', 'utf-8');
const data = JSON.parse(fs.readFileSync('lib/data/card-data.json', 'utf-8'));

// Parse the audit file into card blocks
const blocks = [];
let currentBlock = null;

for (const rawLine of auditText.split('\n')) {
  const line = rawLine.trimEnd();

  // Skip comments and section headers
  if (line.startsWith('#') && !line.startsWith('# VISUEL')) continue;
  if (line.startsWith('################################################################')) continue;

  // New card block
  const idMatch = line.match(/^\[([A-Z0-9-]+)\]$/);
  if (idMatch) {
    if (currentBlock) blocks.push(currentBlock);
    currentBlock = { id: idMatch[1], fields: {}, effects: [], hasVisualMissing: false };
    continue;
  }

  if (!currentBlock) continue;

  if (line === '# VISUEL MANQUANT') {
    currentBlock.hasVisualMissing = true;
    continue;
  }

  // Effect line (indented with type prefix)
  const effectMatch = line.match(/^\s+(MAIN|UPGRADE|AMBUSH|SCORE):\s*(.*)$/);
  if (effectMatch) {
    const [, type, desc] = effectMatch;
    if (desc && desc.trim() && !desc.includes('[EFFECTS]')) {
      currentBlock.effects.push({ type, description: desc.trim() });
    }
    continue;
  }

  // Placeholder lines like [EFFECTS]
  if (line.trim() === '[EFFECTS]') continue;

  // Key = value
  const kvMatch = line.match(/^(\w+)\s*=\s*(.*)$/);
  if (kvMatch) {
    const [, key, val] = kvMatch;
    if (key === 'effects') continue; // "effects =" header line
    currentBlock.fields[key] = val.trim();
  }
}
if (currentBlock) blocks.push(currentBlock);

console.log(`Parsed ${blocks.length} card blocks from audit file`);

// Apply filled data to JSON and track which cards are now complete
const updatedCards = [];
const stillMissing = [];

for (const block of blocks) {
  const card = data.cards[block.id];
  if (!card) {
    console.log(`WARNING: Card ${block.id} not found in JSON`);
    continue;
  }

  let changed = false;
  let stillHasGaps = false;

  // Apply chakra
  if (block.fields.chakra !== undefined) {
    const val = parseInt(block.fields.chakra);
    if (!isNaN(val) && val > 0) {
      card.chakra = val;
      changed = true;
    } else if (!block.fields.chakra) {
      if (card.chakra === 0) stillHasGaps = true;
    }
  }

  // Apply power
  if (block.fields.power !== undefined) {
    const val = parseInt(block.fields.power);
    if (!isNaN(val) && val > 0) {
      card.power = val;
      changed = true;
    } else if (!block.fields.power) {
      if (card.power === 0) stillHasGaps = true;
    }
  }

  // Apply keywords
  if (block.fields.keywords !== undefined) {
    const raw = block.fields.keywords;
    if (raw && !raw.includes('[KEYWORDS]')) {
      card.keywords = raw.split(',').map(k => k.trim()).filter(k => k);
      changed = true;
    } else if (!raw || raw.includes('[KEYWORDS]')) {
      if (!card.keywords || card.keywords.length === 0) stillHasGaps = true;
    }
  }

  // Apply group
  if (block.fields.group !== undefined && block.fields.group) {
    if (block.fields.group !== card.group) {
      card.group = block.fields.group;
      changed = true;
    }
  }

  // Apply title_fr
  if (block.fields.title_fr !== undefined) {
    if (block.fields.title_fr) {
      card.title_fr = block.fields.title_fr;
      changed = true;
    } else {
      if (!card.title_fr) stillHasGaps = true;
    }
  }

  // Apply name_fr
  if (block.fields.name_fr !== undefined && block.fields.name_fr) {
    card.name_fr = block.fields.name_fr;
  }

  // Apply basePoints (missions)
  if (block.fields.basePoints !== undefined) {
    const val = parseInt(block.fields.basePoints);
    if (!isNaN(val)) {
      card.basePoints = val;
      changed = true;
    }
  }

  // Apply effects
  if (block.effects.length > 0) {
    card.effects = block.effects.map(e => ({
      type: e.type,
      description: e.description,
      description_fr: ''
    }));
    changed = true;
  } else {
    if (!card.effects || card.effects.length === 0) stillHasGaps = true;
  }

  // Check visual
  if (block.hasVisualMissing) stillHasGaps = true;

  // Check remaining gaps for stats
  if (card.card_type === 'character' && card.chakra === 0 && card.power === 0) stillHasGaps = true;
  if (card.card_type === 'character' && (!card.keywords || card.keywords.length === 0)) stillHasGaps = true;
  if (!card.effects || card.effects.length === 0) stillHasGaps = true;
  if (!card.title_fr) stillHasGaps = true;

  if (changed) {
    updatedCards.push(block.id);
    // Update data_complete flag
    const isComplete = card.chakra > 0 && card.power > 0 &&
      card.keywords && card.keywords.length > 0 &&
      card.effects && card.effects.length > 0 &&
      card.title_fr && card.group;
    if (isComplete && card.card_type === 'character') {
      card.data_complete = true;
    }
  }

  if (stillHasGaps) {
    stillMissing.push(block);
  }
}

// Save updated JSON
fs.writeFileSync('lib/data/card-data.json', JSON.stringify(data, null, 4));
console.log(`Updated ${updatedCards.length} cards: ${updatedCards.join(', ')}`);
console.log(`Still missing data: ${stillMissing.length} cards`);

// Regenerate audit file with only remaining cards
const rarityNames = {
  C: 'COMMON', UC: 'UNCOMMON', R: 'RARE', RART: 'RARE ART',
  S: 'SECRET', SV: 'SECRET V', M: 'MYTHOS', MV: 'MYTHOS V',
  L: 'LEGENDARY', MMS: 'MISSION'
};

const lines = [];
lines.push('# DONNEES MANQUANTES A REMPLIR');
lines.push('# Remplis les champs vides puis dis-moi quand c\'est bon.');
lines.push('# Format: cle = valeur');
lines.push('# Pour les effects: MAIN: texte / UPGRADE: texte / AMBUSH: texte / SCORE: texte');
lines.push('# Keywords: separer par virgules');
lines.push('# Laisse vide si inconnu.');
lines.push('');

let lastRarity = '';
for (const block of stillMissing) {
  const card = data.cards[block.id];
  if (!card) continue;

  if (card.rarity !== lastRarity) {
    lines.push('');
    lines.push('################################################################');
    lines.push(`# ${rarityNames[card.rarity] || card.rarity}`);
    lines.push('################################################################');
    lastRarity = card.rarity;
  }

  lines.push('');
  lines.push(`[${card.id}]`);
  lines.push(`name_fr = ${card.name_fr || ''}`);
  lines.push(`title_fr = ${card.title_fr || ''}`);

  if (card.card_type === 'character') {
    lines.push(`chakra = ${card.chakra || ''}`);
    lines.push(`power = ${card.power || ''}`);
    lines.push(`keywords = ${(card.keywords || []).join(', ')}`);
    lines.push(`group = ${card.group || ''}`);
  }

  if (card.card_type === 'mission') {
    lines.push(`basePoints = ${card.basePoints || ''}`);
  }

  lines.push('effects =');
  if (card.effects && card.effects.length > 0) {
    for (const e of card.effects) {
      lines.push(`  ${e.type}: ${e.description}`);
    }
  } else {
    if (card.card_type === 'mission') {
      lines.push('  SCORE: ');
    } else {
      lines.push('  MAIN: ');
    }
  }

  if (!card.has_visual) {
    lines.push('# VISUEL MANQUANT');
  }
}

fs.writeFileSync('MISSING_DATA_AUDIT.txt', lines.join('\n'));
console.log(`\nAudit file regenerated with ${stillMissing.length} remaining cards`);
