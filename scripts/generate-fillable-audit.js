const fs = require('fs');
const data = JSON.parse(fs.readFileSync('lib/data/card-data.json', 'utf-8'));

const lines = [];
function log(s) { lines.push(s); }

log('# DONNEES MANQUANTES A REMPLIR');
log('# Remplis les champs vides puis dis-moi quand c\'est bon.');
log('# Format: cle = valeur');
log('# Pour les effects, une ligne par effet: MAIN: texte / UPGRADE: texte / AMBUSH: texte / SCORE: texte');
log('# Pour les keywords, separer par des virgules: Team 7, Jutsu');
log('# Laisse vide si tu ne connais pas encore la valeur.');
log('#');
log('# LEGENDE:');
log('#   [STATS]    = chakra et/ou power a 0');
log('#   [EFFECTS]  = pas d\'effets renseignes');
log('#   [KEYWORDS] = pas de keywords');
log('#   [TEXT]     = nom ou titre manquant');
log('#   [VISUAL]   = pas d\'image');
log('');

const rarityOrder = { C: 0, UC: 1, R: 2, RART: 3, S: 4, SV: 5, M: 6, MV: 7, L: 8, MMS: 9 };
const rarityNames = {
  C: 'COMMON', UC: 'UNCOMMON', R: 'RARE', RART: 'RARE ART',
  S: 'SECRET', SV: 'SECRET V', M: 'MYTHOS', MV: 'MYTHOS V',
  L: 'LEGENDARY', MMS: 'MISSION'
};

const allCards = Object.values(data.cards).sort((a, b) => {
  const ra = rarityOrder[a.rarity] ?? 99;
  const rb = rarityOrder[b.rarity] ?? 99;
  if (ra !== rb) return ra - rb;
  return parseInt(a.number) - parseInt(b.number);
});

let lastRarity = '';

for (const c of allCards) {
  // Determine what's missing
  const needsNameEn = !c.name_en || c.name_en.trim() === '';
  const needsTitleFr = !c.title_fr || c.title_fr.trim() === '';
  const needsTitleEn = !c.title_en || c.title_en.trim() === '';
  const needsStats = c.card_type === 'character' && c.chakra === 0 && c.power === 0 && c.rarity !== 'L';
  const needsEffects = !c.effects || c.effects.length === 0;
  const needsKeywords = c.card_type === 'character' && (!c.keywords || c.keywords.length === 0);
  const needsGroup = !c.group || c.group === 'Independent';
  const needsVisual = !c.has_visual;
  const needsEffectFr = c.effects && c.effects.length > 0 && c.effects.some(e => !e.description_fr || e.description_fr.trim() === '');

  // Skip cards that only miss name_en/title_en and effect_fr (the bulk translations)
  // We want to focus on cards with actual missing GAME DATA
  const hasMissingGameData = needsTitleFr || needsStats || needsEffects || needsKeywords || needsVisual;

  // Skip cards explicitly marked as complete (vanilla cards, no-keyword cards, etc.)
  if (c.data_complete === true) continue;
  if (!hasMissingGameData) continue;

  if (c.rarity !== lastRarity) {
    log('');
    log('################################################################');
    log(`# ${rarityNames[c.rarity] || c.rarity}`);
    log('################################################################');
    lastRarity = c.rarity;
  }

  log('');
  log(`[${c.id}]`);
  log(`name_fr = ${c.name_fr || ''}`);

  if (needsTitleFr) {
    log(`title_fr = `);
  } else {
    log(`title_fr = ${c.title_fr}`);
  }

  if (c.card_type === 'character') {
    if (needsStats) {
      log(`chakra = `);
      log(`power = `);
    } else {
      log(`chakra = ${c.chakra}`);
      log(`power = ${c.power}`);
    }

    if (needsKeywords) {
      log(`keywords = `);
    } else {
      log(`keywords = ${c.keywords.join(', ')}`);
    }

    log(`group = ${c.group || ''}`);

    if (needsEffects) {
      log(`effects =`);
      log(`  MAIN: `);
    } else {
      log(`effects =`);
      for (const e of c.effects) {
        log(`  ${e.type}: ${e.description}`);
      }
    }
  }

  if (c.card_type === 'mission') {
    log(`basePoints = ${c.basePoints || ''}`);
    if (needsEffects) {
      log(`effects =`);
      log(`  SCORE: `);
    } else {
      log(`effects =`);
      for (const e of c.effects) {
        log(`  ${e.type}: ${e.description}`);
      }
    }
  }

  if (needsVisual) {
    log(`# VISUEL MANQUANT`);
  }
}

const output = lines.join('\n');
fs.writeFileSync('MISSING_DATA_AUDIT.txt', output);
console.log(`Fichier genere: MISSING_DATA_AUDIT.txt`);

// Count
const total = allCards.filter(c => {
  if (c.data_complete === true) return false;
  const needsTitleFr = !c.title_fr || c.title_fr.trim() === '';
  const needsStats = c.card_type === 'character' && c.chakra === 0 && c.power === 0 && c.rarity !== 'L';
  const needsEffects = !c.effects || c.effects.length === 0;
  const needsKeywords = c.card_type === 'character' && (!c.keywords || c.keywords.length === 0);
  const needsVisual = !c.has_visual;
  return needsTitleFr || needsStats || needsEffects || needsKeywords || needsVisual;
}).length;
console.log(`${total} cartes avec donnees de jeu manquantes`);
