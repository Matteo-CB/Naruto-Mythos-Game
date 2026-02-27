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

function eff(type, desc) { return { type, description: desc, description_fr: '' }; }

// ============ UNCOMMON BATCH 2 ============

// KS-018-UC: CHOJI AKIMICHI / Human Boulder
update('KS-018-UC', {
  chakra: 4, power: 4,
  keywords: ['Team 10', 'Jutsu'],
  group: 'Leaf Village',
  effects: [
    eff('MAIN', '[⧗] After you move this character, hide an enemy character in this mission with less Power than this character.'),
    eff('UPGRADE', 'Move this character.'),
  ],
});

// KS-022-UC: SHIKAMARU NARA / Shadow Possession Jutsu
update('KS-022-UC', {
  chakra: 3, power: 3,
  keywords: ['Team 10', 'Jutsu'],
  group: 'Leaf Village',
  effects: [
    eff('AMBUSH', 'Move an enemy character played during the opponent\'s previous turn.'),
  ],
});

// KS-026-UC: KIBA INUZUKA / All-Fours Jutsu
update('KS-026-UC', {
  chakra: 3, power: 3,
  keywords: ['Team 8', 'Jutsu'],
  group: 'Leaf Village',
  effects: [
    eff('MAIN', 'Hide the non-hidden enemy character with the lowest cost in this mission.'),
    eff('UPGRADE', 'Look at the 3 top cards of your deck, reveal and draw any [u]Akamaru[/u] characters, then put back the other cards.'),
  ],
});

// KS-033-UC: SHINO ABURAME / Insect Clones
update('KS-033-UC', {
  chakra: 4, power: 4,
  keywords: ['Team 8', 'Jutsu'],
  group: 'Leaf Village',
  effects: [
    eff('AMBUSH', 'Play this character paying 4 less if there\'s an enemy Jutsu character in this mission.'),
    eff('UPGRADE', 'Move this character.'),
  ],
});

// KS-035-UC: KURENAI YUHI / Tree Bind: Death
update('KS-035-UC', {
  chakra: 4, power: 4,
  keywords: ['Team 8', 'Jutsu'],
  group: 'Leaf Village',
  effects: [
    eff('MAIN', '[⧗] Enemy characters cannot move from this mission.'),
    eff('UPGRADE', 'Defeat an enemy character with Power 1 or less in this mission.'),
  ],
});

// ============ UNCOMMON BATCH 3 ============

// KS-037-UC: NEJI HYUGA / Eight Trigrams: Palm Rotation
update('KS-037-UC', {
  chakra: 4, power: 4,
  keywords: ['Team Guy', 'Jutsu'],
  group: 'Leaf Village',
  effects: [
    eff('MAIN', '[⧗] When a non-hidden enemy character is played in this mission, POWERUP 1.'),
    eff('UPGRADE', 'Remove all Power tokens from an enemy character in this mission.'),
  ],
});

// KS-041-UC: TENTEN / Weapon Specialist
update('KS-041-UC', {
  chakra: 3, power: 3,
  keywords: ['Team Guy'],
  group: 'Leaf Village',
  effects: [
    eff('MAIN', 'Defeat a hidden character in this mission.'),
    eff('UPGRADE', 'POWERUP 1 another Leaf Village character in play.'),
  ],
});

// KS-043-UC: MIGHT GUY / Ferocious Fist
update('KS-043-UC', {
  chakra: 4, power: 4,
  keywords: ['Team Guy', 'Taijutsu'],
  group: 'Leaf Village',
  effects: [
    eff('MAIN', '[⧗] This character doesn\'t lose Power tokens at the end of the round.'),
    eff('UPGRADE', 'POWERUP 3.'),
  ],
});

// KS-051-UC: OROCHIMARU / Orochimaru Style: Substitution Jutsu
update('KS-051-UC', {
  chakra: 5, power: 5,
  keywords: ['Sannin'],
  group: 'Sound Village',
  effects: [
    eff('MAIN', '[⧗] If you lost this mission during the Mission Evaluation phase, move this character to another mission.'),
    eff('UPGRADE', 'Defeat a hidden enemy character in play.'),
  ],
});

// KS-053-UC: KABUTO YAKUSHI / Yin Healing Wound Destruction
update('KS-053-UC', {
  chakra: 4, power: 4,
  keywords: ['Jutsu'],
  group: 'Sound Village',
  effects: [
    eff('UPGRADE', 'Discard a card.'),
    eff('MAIN', 'Play the character at the top of your discard pile paying 3 less.'),
  ],
});

fs.writeFileSync('lib/data/card-data.json', JSON.stringify(data, null, 4));
console.log('\nJSON saved. 10 UC cards applied (batches 2-3).');
