const fs = require('fs');
const data = JSON.parse(fs.readFileSync('lib/data/card-data.json', 'utf-8'));

function update(id, fields) {
  const card = data.cards[id];
  if (!card) { console.log('NOT FOUND: ' + id); return; }
  Object.assign(card, fields);
  // Check completeness for characters
  if (card.card_type === 'character') {
    const complete = card.title_fr && card.group &&
      card.effects && card.effects.length > 0 &&
      card.keywords && card.keywords.length > 0;
    card.data_complete = !!complete;
  }
  console.log('Updated: ' + id + ' (complete=' + card.data_complete + ')');
}

function eff(type, desc) { return { type, description: desc, description_fr: '' }; }

// ============ COMMON ============

// KS-005-C: No keyword tag visible on card image
update('KS-005-C', {
  chakra: 2, power: 1,
  keywords: [],
  group: 'Leaf Village',
  effects: [eff('MAIN', '[⧗] CHAKRA +1.')],
});

// KS-009-C: No effect text on card (vanilla)
update('KS-009-C', {
  chakra: 2, power: 3,
  keywords: ['Team 7'],
  group: 'Leaf Village',
  effects: [],
  data_complete: true,
});

// KS-021-C
update('KS-021-C', {
  chakra: 1, power: 0,
  keywords: ['Team 10'],
  group: 'Leaf Village',
  effects: [eff('MAIN', 'If you have the Edge, draw a card.')],
});

// KS-086-C: No effect text on card (vanilla)
update('KS-086-C', {
  chakra: 3, power: 5,
  keywords: ['Rogue Ninja'],
  group: 'Independent',
  effects: [],
  data_complete: true,
});

// KS-101-C
update('KS-101-C', {
  chakra: 0, power: 0,
  keywords: ['Ninja Pig'],
  group: 'Independent',
  effects: [eff('MAIN', '[⧗] If there\'s a friendly [u]Tsunade[/u] or [u]Shizune[/u] in this mission, this character has +1 Power.')],
});

// ============ UNCOMMON BATCH 1 ============

// KS-006-UC
update('KS-006-UC', {
  chakra: 3, power: 2,
  keywords: ['Weapon'],
  group: 'Leaf Village',
  effects: [
    eff('MAIN', 'Move an enemy character with Power 3 or less in play.'),
    eff('UPGRADE', 'Gain 2 Chakra.'),
  ],
});

// KS-008-UC
update('KS-008-UC', {
  chakra: 5, power: 5,
  keywords: ['Sannin', 'Jutsu'],
  group: 'Leaf Village',
  effects: [
    eff('MAIN', 'Play a Summon character anywhere, paying 2 less.'),
    eff('UPGRADE', 'Hide an enemy character with cost 3 or less in this mission.'),
  ],
});

// KS-012-UC
update('KS-012-UC', {
  chakra: 3, power: 2,
  keywords: ['Team 7'],
  group: 'Leaf Village',
  effects: [
    eff('MAIN', '[⧗] CHAKRA +1.'),
    eff('UPGRADE', 'Draw 1 card. If you do so, you must discard 1 card.'),
  ],
});

// KS-014-UC
update('KS-014-UC', {
  chakra: 3, power: 4,
  keywords: ['Team 7', 'Kekkei Genkai'],
  group: 'Leaf Village',
  effects: [
    eff('AMBUSH', 'Look at the opponent\'s hand.'),
    eff('UPGRADE', 'AMBUSH effect: In addition, discard 1 card. If you do so, choose 1 card in the opponent\'s hand and discard it.'),
  ],
});

// KS-016-UC
update('KS-016-UC', {
  chakra: 4, power: 4,
  keywords: ['Team 7'],
  group: 'Leaf Village',
  effects: [
    eff('MAIN', 'Copy a non-upgrade instant effect of an enemy character with cost 4 or less in play.'),
    eff('UPGRADE', 'MAIN effect: Instead, there\'s no cost limit.'),
  ],
});

fs.writeFileSync('lib/data/card-data.json', JSON.stringify(data, null, 4));
console.log('\nJSON saved. Now regenerating audit...');
