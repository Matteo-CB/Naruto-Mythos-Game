const fs = require('fs');
const raw = JSON.parse(fs.readFileSync('lib/data/sets/KS/cards.json', 'utf-8'));
const data = raw.cards || raw;

// Find ALL cards that are variants (RA, MV, SV) or R with has_visual=true
const variants = [];
for (const [id, c] of Object.entries(data)) {
  if (c.has_visual && c.image_file) {
    const rarity = c.rarity;
    if (['RA', 'MV', 'SV'].includes(rarity)) {
      // Find the base card
      const num = c.number;
      let baseId = null;
      if (rarity === 'RA') baseId = id.replace('-RA', '-R');
      if (rarity === 'MV') baseId = id.replace('-MV', '-M');
      if (rarity === 'SV') baseId = id.replace('-SV', '-S');
      const base = data[baseId];

      variants.push({
        id, rarity,
        title_en: c.title_en || '',
        title_fr: c.title_fr || '',
        image_file: c.image_file,
        baseId,
        base_title_en: base ? (base.title_en || '') : 'BASE NOT FOUND',
        base_title_fr: base ? (base.title_fr || '') : 'BASE NOT FOUND',
        same_title: base ? (c.title_en === base.title_en) : false,
      });
    }
  }
}

console.log('=== VARIANT CARDS WITH VISUALS ===');
console.log('Total: ' + variants.length + '\n');
for (const v of variants) {
  const marker = v.same_title ? '  OK' : '  !! CHECK !!';
  console.log(v.id + ' (' + v.rarity + ') image: ' + v.image_file);
  console.log('  Title EN: "' + v.title_en + '"');
  console.log('  Title FR: "' + v.title_fr + '"');
  console.log('  Base ' + v.baseId + ': "' + v.base_title_en + '" / "' + v.base_title_fr + '"');
  console.log(marker);
  console.log('');
}

// Also list R cards with visuals (they could also have wrong titles)
console.log('\n=== R CARDS WITH VISUALS (to verify) ===');
for (const [id, c] of Object.entries(data)) {
  if (c.has_visual && c.image_file && c.rarity === 'R') {
    console.log(id + ' | "' + (c.title_en || '') + '" / "' + (c.title_fr || '') + '" | ' + c.image_file);
  }
}

// Also M and S cards with visuals
console.log('\n=== M CARDS WITH VISUALS ===');
for (const [id, c] of Object.entries(data)) {
  if (c.has_visual && c.image_file && c.rarity === 'M') {
    console.log(id + ' | "' + (c.title_en || '') + '" / "' + (c.title_fr || '') + '" | ' + c.image_file);
  }
}
console.log('\n=== S CARDS WITH VISUALS ===');
for (const [id, c] of Object.entries(data)) {
  if (c.has_visual && c.image_file && c.rarity === 'S') {
    console.log(id + ' | "' + (c.title_en || '') + '" / "' + (c.title_fr || '') + '" | ' + c.image_file);
  }
}
