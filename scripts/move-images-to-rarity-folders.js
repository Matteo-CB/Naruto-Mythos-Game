const fs = require('fs');
const path = require('path');

const cardsDir = path.join(__dirname, '..', 'public', 'images', 'cards');
const dataPath = path.join(__dirname, '..', 'lib', 'data', 'card-data.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

// Rarity to subfolder mapping
const rarityToFolder = {
  'C': 'common',
  'UC': 'uncommon',
  'R': 'rare',
  'RART': 'rare_art',
  'S': 'secret',
  'SV': 'secret_v',
  'M': 'mythos',
  'MV': 'mythos_v',
  'L': 'legendary',
  'MMS': 'mission',
};

let moved = 0;
let updated = 0;

// Move image files based on card data
for (const [id, card] of Object.entries(data.cards)) {
  const folder = rarityToFolder[card.rarity];
  if (!folder) {
    console.log(`WARNING: Unknown rarity "${card.rarity}" for ${id}`);
    continue;
  }

  const filename = id + '.webp';
  const srcPath = path.join(cardsDir, filename);
  const destDir = path.join(cardsDir, folder);
  const destPath = path.join(destDir, filename);

  // Move file if it exists at root level
  if (fs.existsSync(srcPath)) {
    fs.renameSync(srcPath, destPath);
    moved++;
  }

  // Update JSON paths regardless (for cards with visuals)
  if (card.has_visual) {
    const newImageFile = `images/cards/${folder}/${filename}`;
    const newImageUrl = `/${newImageFile}`;
    card.image_file = newImageFile;
    card.image_url = newImageUrl;
    updated++;
  }
}

// Save updated JSON
fs.writeFileSync(dataPath, JSON.stringify(data, null, 4));

console.log(`Moved ${moved} image files`);
console.log(`Updated ${updated} card entries in JSON`);

// Verify: check remaining files at root
const remaining = fs.readdirSync(cardsDir).filter(f => f.endsWith('.webp'));
if (remaining.length > 0) {
  console.log(`\nWARNING: ${remaining.length} files still at root level:`);
  remaining.forEach(f => console.log(`  ${f}`));
} else {
  console.log('\nAll .webp files moved to subfolders.');
}

// Verify: cross-check
const imageFiles = new Set();
for (const folder of Object.values(rarityToFolder)) {
  const dir = path.join(cardsDir, folder);
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.webp')) imageFiles.add(`${folder}/${f}`);
    }
  }
}

let mismatches = 0;
for (const [id, card] of Object.entries(data.cards)) {
  if (card.has_visual) {
    const expected = `images/cards/${rarityToFolder[card.rarity]}/${id}.webp`;
    if (card.image_file !== expected) {
      console.log(`MISMATCH: ${id} -> ${card.image_file} (expected ${expected})`);
      mismatches++;
    }
    const relPath = `${rarityToFolder[card.rarity]}/${id}.webp`;
    if (!imageFiles.has(relPath)) {
      console.log(`MISSING FILE: ${id} -> ${relPath}`);
      mismatches++;
    }
  }
}

if (mismatches === 0) {
  console.log('All paths verified OK.');
}
