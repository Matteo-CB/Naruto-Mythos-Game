const fs = require('fs');
const data = JSON.parse(fs.readFileSync('lib/data/card-data.json', 'utf-8'));

function update(id, fields) {
  const card = data.cards[id];
  if (!card) { console.log('NOT FOUND: ' + id); return; }
  Object.assign(card, fields);
  if (card.card_type === 'character') {
    const complete = card.title_fr && card.group &&
      card.effects && card.effects.length > 0 &&
      card.keywords && card.keywords.length > 0;
    card.data_complete = !!complete;
  }
  console.log('Updated: ' + id + ' (complete=' + card.data_complete + ')');
}

// Copy R data to its RART counterpart (same stats, different image)
function copyToRART(rId) {
  const rartId = rId.replace('-R', '-RART');
  const rCard = data.cards[rId];
  const rartCard = data.cards[rartId];
  if (!rCard) { console.log('R NOT FOUND: ' + rId); return; }
  if (!rartCard) { console.log('RART NOT FOUND: ' + rartId); return; }
  // Copy game data fields
  rartCard.chakra = rCard.chakra;
  rartCard.power = rCard.power;
  rartCard.keywords = rCard.keywords;
  rartCard.group = rCard.group;
  rartCard.effects = rCard.effects;
  if (rartCard.card_type === 'character') {
    const complete = rartCard.title_fr && rartCard.group &&
      rartCard.effects && rartCard.effects.length > 0 &&
      rartCard.keywords && rartCard.keywords.length > 0;
    rartCard.data_complete = !!complete;
  }
  console.log('Copied R->RART: ' + rartId + ' (complete=' + rartCard.data_complete + ')');
}

function eff(type, desc) { return { type, description: desc, description_fr: '' }; }

// ============ RARE CARDS ============

// KS-104-R: TSUNADE / Legendary Sannin
update('KS-104-R', {
  chakra: 5, power: 6,
  keywords: ['Sannin'],
  group: 'Leaf Village',
  effects: [
    eff('MAIN', 'Spend any amount of additional Chakra. POWERUP X, where X is the amount of additional Chakra spent.'),
    eff('UPGRADE', 'POWERUP X.'),
  ],
});

// KS-105-R: JIRAIYA / Summoning Jutsu
update('KS-105-R', {
  chakra: 6, power: 6,
  keywords: ['Sannin', 'Jutsu'],
  group: 'Leaf Village',
  effects: [
    eff('MAIN', 'Play a Summon character anywhere, paying 3 less.'),
    eff('UPGRADE', 'Move any enemy character from this mission.'),
  ],
});

// KS-106-R: KAKASHI HATAKE / Curse Sealing
update('KS-106-R', {
  chakra: 5, power: 5,
  keywords: ['Team 7', 'Jutsu'],
  group: 'Leaf Village',
  effects: [
    eff('MAIN', 'Discard the top card of an upgraded enemy character in play.'),
    eff('UPGRADE', 'MAIN effect: Copy any non-Upgrade instant effect from the discarded enemy character.'),
  ],
});

// KS-107-R: SASUKE UCHIHA / Chidori
update('KS-107-R', {
  chakra: 5, power: 6,
  keywords: ['Team 7', 'Jutsu'],
  group: 'Leaf Village',
  effects: [
    eff('MAIN', 'You must move all other non-hidden friendly characters from this mission, if able.'),
    eff('UPGRADE', 'POWERUP X where X is the number of characters moved this way.'),
  ],
});

// KS-109-R: SAKURA HARUNO / Medical Ninja
update('KS-109-R', {
  chakra: 4, power: 3,
  keywords: ['Team 7'],
  group: 'Leaf Village',
  effects: [
    eff('MAIN', 'Choose one of your Leaf Village characters in your discard pile and play it anywhere, paying its cost.'),
    eff('UPGRADE', 'MAIN effect: Instead, play the card paying 2 less.'),
  ],
});

// KS-110-R: INO YAMANAKA / Mind Destruction Jutsu
update('KS-110-R', {
  chakra: 5, power: 4,
  keywords: ['Team 10', 'Jutsu'],
  group: 'Leaf Village',
  effects: [
    eff('MAIN', 'If there are 2 or more enemy characters in this mission, move the weakest non-hidden enemy character.'),
    eff('UPGRADE', 'MAIN effect: After moving them, hide the enemy character.'),
  ],
});

// KS-111-R: SHIKAMARU NARA / Shadow Strangle Jutsu
update('KS-111-R', {
  chakra: 6, power: 5,
  keywords: ['Team 10', 'Jutsu'],
  group: 'Leaf Village',
  effects: [
    eff('MAIN', '[⧗] The opponent cannot play characters while hidden in this mission.'),
    eff('UPGRADE', 'Hide an enemy character with Power 3 or less in this mission.'),
  ],
});

// KS-113-R: KIBA INUZUKA / Fang Over Fang
update('KS-113-R', {
  chakra: 6, power: 6,
  keywords: ['Team 8', 'Jutsu'],
  group: 'Leaf Village',
  effects: [
    eff('MAIN', 'Hide a friendly [u]Akamaru[/u] character. If you do, hide another character in this mission.'),
    eff('UPGRADE', 'MAIN effect: Instead, defeat both of them.'),
  ],
});

// KS-114-R: HINATA HYUGA / Protective Eight Trigrams Sixty-Four Palms
update('KS-114-R', {
  chakra: 5, power: 5,
  keywords: ['Team 8', 'Jutsu'],
  group: 'Leaf Village',
  effects: [
    eff('MAIN', 'POWERUP 2. POWERUP 1 another character.'),
    eff('UPGRADE', 'Remove all Power tokens from an enemy character in play.'),
  ],
});

// KS-116-R: NEJI HYUGA / Eight Trigrams Sixty-Four Palms
update('KS-116-R', {
  chakra: 6, power: 5,
  keywords: ['Team Guy', 'Jutsu'],
  group: 'Leaf Village',
  effects: [
    eff('MAIN', 'Defeat a character with exactly Power 4 in this mission.'),
    eff('UPGRADE', 'Defeat a character with exactly Power 6 in this mission.'),
  ],
});

// KS-117-R: ROCK LEE / Loopy Fist
update('KS-117-R', {
  chakra: 5, power: 5,
  keywords: ['Team Guy', 'Taijutsu'],
  group: 'Leaf Village',
  effects: [
    eff('MAIN', '[⧗] At the end of the round, you must move this character to another mission, if able.'),
    eff('UPGRADE', 'Discard the top card of your deck. POWERUP X where X is the cost of the discarded card.'),
  ],
});

// KS-118-R: TENTEN / Rising Twin Dragons
update('KS-118-R', {
  chakra: 4, power: 4,
  keywords: ['Team Guy', 'Jutsu'],
  group: 'Leaf Village',
  effects: [
    eff('AMBUSH', 'Defeat a hidden character in this mission. If the defeated character had a printed Power of 3 or less, defeat a hidden character in play.'),
  ],
});

// KS-119-R: KANKURO / Secret Black Move: Iron Maiden
update('KS-119-R', {
  chakra: 5, power: 5,
  keywords: ['Team Baki', 'Jutsu'],
  group: 'Sand Village',
  effects: [
    eff('UPGRADE', 'Move any character in play.'),
    eff('MAIN', 'Defeat an enemy character with Power 3 or less in this mission.'),
  ],
});

// KS-121-R: TEMARI / Wind Scythe Jutsu
update('KS-121-R', {
  chakra: 5, power: 5,
  keywords: ['Team Baki', 'Jutsu'],
  group: 'Sand Village',
  effects: [
    eff('MAIN', 'Move any friendly character in play.'),
    eff('UPGRADE', 'Move any character in play.'),
  ],
});

// KS-123-R: KIMIMARO / Earth Curse Mark
update('KS-123-R', {
  chakra: 6, power: 8,
  keywords: ['Jutsu'],
  group: 'Sound Village',
  effects: [
    eff('MAIN', 'At the end of the round, you must defeat this character if you have no cards in hand.'),
    eff('UPGRADE', 'Discard a card to defeat a character in play with cost 5 or less.'),
  ],
});

// KS-125-R: TAYUYA / Demon Flute: Chains of Fantasia
update('KS-125-R', {
  chakra: 5, power: 5,
  keywords: ['Sound Four', 'Jutsu'],
  group: 'Sound Village',
  effects: [
    eff('MAIN', '[⧗] Non-hidden enemy characters cost an additional 1 Chakra to play in this mission.'),
    eff('UPGRADE', 'Play a Sound Village character, paying 2 less.'),
  ],
});

// ============ RART-ONLY CARDS ============

// KS-112-RART: CHOJI AKIMICHI / "Who you calling fat?"
update('KS-112-RART', {
  chakra: 5, power: 4,
  keywords: ['Team 10'],
  group: 'Leaf Village',
  effects: [
    eff('MAIN', 'Discard a card from your hand. POWERUP X where X is the cost of the discarded card in this way.'),
    eff('UPGRADE', 'Repeat the MAIN effect.'),
  ],
});

// KS-126-RART: OROCHIMARU / "Stay out of my way."
update('KS-126-RART', {
  chakra: 7, power: 7,
  keywords: ['Sannin'],
  group: 'Sound Village',
  effects: [
    eff('SCORE', 'Defeat the weakest non-hidden enemy character in play.'),
    eff('UPGRADE', 'POWERUP 3.'),
  ],
});

// KS-128-RART: ITACHI UCHIHA / "I control them all."
update('KS-128-RART', {
  chakra: 6, power: 6,
  keywords: ['Rogue Ninja'],
  group: 'Akatsuki',
  effects: [
    eff('MAIN', '[⧗] Every enemy character in this mission has -1 Power.'),
    eff('UPGRADE', 'Move a friendly character in play.'),
  ],
});

// KS-130-RART: ONE-TAIL / "I hope you're ready to die!"
update('KS-130-RART', {
  chakra: 7, power: 10,
  keywords: ['Tailed Beast', 'Jutsu'],
  group: 'Independent',
  effects: [
    eff('MAIN', '[⧗] Can\'t be hidden or defeated by enemy effects.'),
    eff('UPGRADE', 'Choose a mission and defeat all hidden enemy characters assigned to it.'),
  ],
});

// ============ COPY R DATA TO RART COUNTERPARTS ============
// These RART cards share identical stats/effects with their R version
const rCardsWithRART = [
  'KS-104-R', 'KS-105-R', 'KS-106-R', 'KS-107-R', 'KS-109-R',
  'KS-110-R', 'KS-111-R', 'KS-113-R', 'KS-114-R',
  'KS-117-R', 'KS-118-R', 'KS-119-R', 'KS-120-R', 'KS-121-R',
  'KS-123-R', 'KS-125-R',
];

for (const rId of rCardsWithRART) {
  copyToRART(rId);
}

// Also need to create R versions for RART-only cards that should have R entries
// KS-112-R, KS-126-R, KS-128-R, KS-130-R - copy RART data to R counterparts
function copyRARTtoR(rartId) {
  const rId = rartId.replace('-RART', '-R');
  const rartCard = data.cards[rartId];
  const rCard = data.cards[rId];
  if (!rartCard) { console.log('RART NOT FOUND: ' + rartId); return; }
  if (!rCard) { console.log('R card NOT FOUND (no entry): ' + rId + ' - skipping'); return; }
  rCard.chakra = rartCard.chakra;
  rCard.power = rartCard.power;
  rCard.keywords = rartCard.keywords;
  rCard.group = rartCard.group;
  rCard.effects = rartCard.effects;
  if (rCard.card_type === 'character') {
    const complete = rCard.title_fr && rCard.group &&
      rCard.effects && rCard.effects.length > 0 &&
      rCard.keywords && rCard.keywords.length > 0;
    rCard.data_complete = !!complete;
  }
  console.log('Copied RART->R: ' + rId + ' (complete=' + rCard.data_complete + ')');
}

copyRARTtoR('KS-112-RART');
copyRARTtoR('KS-126-RART');
copyRARTtoR('KS-128-RART');
copyRARTtoR('KS-130-RART');

fs.writeFileSync('lib/data/card-data.json', JSON.stringify(data, null, 4));
console.log('\nJSON saved. All Rare + RART cards applied!');
