const fs = require('fs');
const data = JSON.parse(fs.readFileSync('lib/data/card-data.json', 'utf-8'));

const lines = [];
function log(s) { lines.push(s); }

log('========================================');
log('AUDIT COMPLET - card-data.json');
log('========================================');
log('');

const allCards = Object.values(data.cards);
const characters = allCards.filter(c => c.card_type === 'character');
const missions = allCards.filter(c => c.card_type === 'mission');

log(`Total: ${allCards.length} cartes (${characters.length} personnages, ${missions.length} missions)`);
log('');

// Audit each card for missing fields
const issues = [];

for (const c of allCards) {
  const cardIssues = [];

  // Missing name
  if (!c.name_fr || c.name_fr.trim() === '') cardIssues.push('name_fr manquant');
  if (!c.name_en || c.name_en.trim() === '') cardIssues.push('name_en manquant');

  // Missing title
  if (!c.title_fr || c.title_fr.trim() === '') cardIssues.push('title_fr manquant');
  if (!c.title_en || c.title_en.trim() === '') cardIssues.push('title_en manquant');

  // Character-specific checks
  if (c.card_type === 'character') {
    // Missing stats
    if (c.chakra === 0 && c.power === 0 && c.rarity !== 'L') cardIssues.push('chakra=0 power=0 (stats manquantes?)');

    // Missing effects (most character cards should have effects)
    if (!c.effects || c.effects.length === 0) cardIssues.push('effects vides');

    // Effects without description_fr
    if (c.effects && c.effects.length > 0) {
      const missingFr = c.effects.filter(e => !e.description_fr || e.description_fr.trim() === '');
      if (missingFr.length > 0) cardIssues.push(`${missingFr.length} effect(s) sans description_fr`);
    }

    // Missing keywords
    if (!c.keywords || c.keywords.length === 0) cardIssues.push('keywords vides');

    // Missing group or default
    if (!c.group || c.group === 'Independent') {
      // Check if it really should be Independent or if it's just default
      // Cards with known groups shouldn't be Independent
    }

    // rarity_display missing
    if (!c.rarity_display || c.rarity_display.trim() === '') cardIssues.push('rarity_display manquant');
  }

  // Mission-specific checks
  if (c.card_type === 'mission') {
    if (!c.basePoints && c.basePoints !== 0) cardIssues.push('basePoints manquant');
    if (!c.effects || c.effects.length === 0) cardIssues.push('effects vides (SCORE)');
    if (c.effects && c.effects.length > 0) {
      const missingFr = c.effects.filter(e => !e.description_fr || e.description_fr.trim() === '');
      if (missingFr.length > 0) cardIssues.push(`${missingFr.length} effect(s) sans description_fr`);
    }
  }

  // data_complete flag
  if (c.data_complete === false) cardIssues.push('data_complete=false');

  // Visual missing
  if (!c.has_visual) cardIssues.push('VISUEL MANQUANT');

  if (cardIssues.length > 0) {
    issues.push({ card: c, issues: cardIssues });
  }
}

// Sort by rarity then number
const rarityOrder = { C: 0, UC: 1, R: 2, RART: 3, S: 4, SV: 5, M: 6, MV: 7, L: 8, MMS: 9 };
issues.sort((a, b) => {
  const ra = rarityOrder[a.card.rarity] ?? 99;
  const rb = rarityOrder[b.card.rarity] ?? 99;
  if (ra !== rb) return ra - rb;
  return parseInt(a.card.number) - parseInt(b.card.number);
});

// Group by rarity
const rarityNames = {
  C: 'COMMON', UC: 'UNCOMMON', R: 'RARE', RART: 'RARE ART',
  S: 'SECRET', SV: 'SECRET V', M: 'MYTHOS', MV: 'MYTHOS V',
  L: 'LEGENDARY', MMS: 'MISSION'
};

let lastRarity = '';
let countByRarity = {};

for (const item of issues) {
  const r = item.card.rarity;
  if (r !== lastRarity) {
    log('');
    log('========================================');
    log(`  ${rarityNames[r] || r}`);
    log('========================================');
    lastRarity = r;
  }

  countByRarity[r] = (countByRarity[r] || 0) + 1;

  const title = item.card.title_fr || item.card.title_en || '???';
  log('');
  log(`[${item.card.id}] ${item.card.name_fr || '???'} / ${title}`);
  for (const issue of item.issues) {
    log(`  - ${issue}`);
  }
}

// Summary
log('');
log('========================================');
log('  RESUME');
log('========================================');
log('');
log(`Cartes avec problemes: ${issues.length} / ${allCards.length}`);
log('');

// Count specific issue types
let noVisual = 0, noEffects = 0, noNameEn = 0, noTitleEn = 0, noTitleFr = 0;
let noStats = 0, noKeywords = 0, noEffectFr = 0, incomplete = 0;

for (const item of issues) {
  for (const issue of item.issues) {
    if (issue.includes('VISUEL MANQUANT')) noVisual++;
    if (issue.includes('effects vides')) noEffects++;
    if (issue === 'name_en manquant') noNameEn++;
    if (issue === 'title_en manquant') noTitleEn++;
    if (issue === 'title_fr manquant') noTitleFr++;
    if (issue.includes('stats manquantes')) noStats++;
    if (issue === 'keywords vides') noKeywords++;
    if (issue.includes('sans description_fr')) noEffectFr++;
    if (issue === 'data_complete=false') incomplete++;
  }
}

log(`Visuels manquants:      ${noVisual}`);
log(`Stats manquantes (0/0): ${noStats}`);
log(`Effects vides:          ${noEffects}`);
log(`Keywords vides:         ${noKeywords}`);
log(`title_fr manquant:      ${noTitleFr}`);
log(`title_en manquant:      ${noTitleEn}`);
log(`name_en manquant:       ${noNameEn}`);
log(`Effects sans desc_fr:   ${noEffectFr}`);
log(`data_complete=false:    ${incomplete}`);

const output = lines.join('\n');
fs.writeFileSync('MISSING_DATA_AUDIT.txt', output);
console.log(output);
console.log('\n>>> Fichier sauvegarde: MISSING_DATA_AUDIT.txt');
