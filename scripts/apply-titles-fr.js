const fs = require('fs');
const data = JSON.parse(fs.readFileSync('lib/data/card-data.json', 'utf-8'));

let updated = 0;

function setTitle(id, titleFr) {
  const card = data.cards[id];
  if (!card) { console.log('NOT FOUND: ' + id); return; }
  if (card.title_fr && card.title_fr.length > 0) {
    console.log('SKIP (already has title): ' + id + ' => "' + card.title_fr + '"');
    return;
  }
  card.title_fr = titleFr;
  // Re-check completeness
  if (card.card_type === 'character') {
    const complete = card.title_fr && card.group &&
      card.effects && card.effects.length > 0 &&
      card.keywords && card.keywords.length > 0;
    card.data_complete = !!complete;
  }
  updated++;
  console.log('SET: ' + id + ' => "' + titleFr + '" (complete=' + card.data_complete + ')');
}

// Copy title from one card to another (for R<->RART pairs)
function copyTitle(fromId, toId) {
  const from = data.cards[fromId];
  const to = data.cards[toId];
  if (!from || !to) return;
  if (!from.title_fr || from.title_fr.length === 0) return;
  if (to.title_fr && to.title_fr.length > 0) return;
  setTitle(toId, from.title_fr);
}

// ============================================================
// RARE CARDS - translated from English card images
// ============================================================

setTitle('KS-104-R', 'Sannin Légendaire');
setTitle('KS-105-R', "Jutsu d'Invocation");
setTitle('KS-106-R', 'Scellement du Maléfice');
setTitle('KS-107-R', 'Chidori');
setTitle('KS-110-R', 'Jutsu de Destruction Mentale');
setTitle('KS-111-R', "Jutsu d'Étranglement par l'Ombre");
setTitle('KS-112-R', "C'est qui que tu traites de gros ?");  // from RART image
setTitle('KS-113-R', 'Croc sur Croc');
// KS-114-R already has title (complete)
// KS-116-R already has title (complete)
setTitle('KS-117-R', 'Poing Ivre');
// KS-118-R already has title (complete)
setTitle('KS-119-R', 'Technique Secrète Noire : Vierge de Fer');
setTitle('KS-120-R', 'Cercueil de Sable');
setTitle('KS-121-R', 'Jutsu de la Faux du Vent');
setTitle('KS-123-R', 'Marque Maudite de la Terre');
setTitle('KS-125-R', 'Flûte Démoniaque : Chaînes de Fantasia');
setTitle('KS-126-R', "Ôtez-vous de mon chemin.");  // from RART image
setTitle('KS-128-R', 'Je les contrôle tous.');       // from RART image
setTitle('KS-130-R', "J'espère que tu es prêt à mourir !");  // from RART image

// ============================================================
// RARE ART - copy from R counterpart, or set from RART image
// ============================================================

// RART-only titles (from RART images)
setTitle('KS-112-RART', "C'est qui que tu traites de gros ?");
setTitle('KS-126-RART', "Ôtez-vous de mon chemin.");
setTitle('KS-128-RART', 'Je les contrôle tous.');
setTitle('KS-130-RART', "J'espère que tu es prêt à mourir !");

// Copy R -> RART for all pairs
const rartPairs = [
  104, 105, 106, 107, 109, 110, 111, 113, 114, 116,
  117, 118, 119, 120, 121, 123, 125,
];
for (const num of rartPairs) {
  copyTitle('KS-' + num + '-R', 'KS-' + num + '-RART');
}

// ============================================================
// MISSIONS - set title_fr = name_en (English name)
// ============================================================

const missionTitles = {
  'KS-001-MMS': 'Appel de soutien',
  'KS-002-MMS': 'Examen Chûnin',
  'KS-003-MMS': 'Trouver le traître',
  'KS-004-MMS': 'Assassinat',
  'KS-005-MMS': 'Ramener',
  'KS-006-MMS': "Sauvetage d'un ami",
  'KS-007-MMS': 'Je dois partir',
  'KS-008-MMS': 'Tendre un piège',
  'KS-009-MMS': 'Protéger le chef',
  'KS-010-MMS': 'Entraînement au chakra',
};

for (const [id, title] of Object.entries(missionTitles)) {
  setTitle(id, title);
}

fs.writeFileSync('lib/data/card-data.json', JSON.stringify(data, null, 4));
console.log('\nJSON saved. ' + updated + ' title_fr values set.');
