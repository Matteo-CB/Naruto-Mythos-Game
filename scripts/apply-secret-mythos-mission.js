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
  } else if (card.card_type === 'mission') {
    const complete = card.effects && card.effects.length > 0 &&
      card.effects[0].description && card.effects[0].description.length > 0;
    card.data_complete = !!complete;
  }
  console.log('Updated: ' + id + ' (complete=' + card.data_complete + ')');
}

function eff(type, desc) { return { type, description: desc, description_fr: '' }; }

// ============ SECRET ============

// KS-131-S: TSUNADE / Fifth Hokage
update('KS-131-S', {
  chakra: 7, power: 6,
  keywords: ['Sannin', 'Hokage'],
  group: 'Leaf Village',
  effects: [
    eff('MAIN', 'POWERUP 1 every friendly Leaf Village character in play.'),
  ],
});

// KS-132-S: JIRAIYA / Toad Mouth Trap
update('KS-132-S', {
  chakra: 8, power: 8,
  keywords: ['Sannin', 'Jutsu'],
  group: 'Leaf Village',
  effects: [
    eff('MAIN', 'Play a Summon character anywhere, paying 5 less.'),
    eff('UPGRADE', 'The opponent must choose characters to be defeated until they only have up to 2 assigned in this mission.'),
  ],
});

// ============ MYTHOS ============

// KS-141-M: NARUTO UZUMAKI / Challenging Sasuke
update('KS-141-M', {
  chakra: 5, power: 4,
  keywords: ['Team 7'],
  group: 'Leaf Village',
  effects: [
    eff('MAIN', 'Discard a card. If you do, hide an enemy character with Power 4 or less in this mission.'),
  ],
});

// KS-142-M: SASUKE UCHIHA / Challenging Naruto
update('KS-142-M', {
  chakra: 5, power: 4,
  keywords: ['Team 7'],
  group: 'Leaf Village',
  effects: [
    eff('MAIN', 'Discard a card. If you do, POWERUP X+1 where X is the number of enemy characters in this mission.'),
  ],
});

// KS-146-M: SASUKE UCHIHA / Original Team 7
update('KS-146-M', {
  chakra: 3, power: 3,
  keywords: ['Team 7'],
  group: 'Leaf Village',
  effects: [
    eff('MAIN', 'Give the Edge to the opponent. If you do so, POWERUP 3.'),
  ],
});

// KS-147-M: SAKURA HARUNO / Original Team 7
update('KS-147-M', {
  chakra: 3, power: 3,
  keywords: ['Team 7'],
  group: 'Leaf Village',
  effects: [
    eff('MAIN', '[⧗] If you don\'t have the Edge, CHAKRA +2.'),
  ],
});

// KS-148-M: KAKASHI HATAKE / Original Team 7
update('KS-148-M', {
  chakra: 4, power: 5,
  keywords: ['Team 7'],
  group: 'Leaf Village',
  effects: [
    eff('MAIN', 'Gain the Edge.'),
    eff('AMBUSH', 'Copy an instant effect of another friendly Team 7 character in play.'),
  ],
});

// ============ MISSIONS ============

// KS-002-MMS: CHUNIN EXAM
update('KS-002-MMS', {
  basePoints: 2,
  effects: [
    eff('SCORE', '[⧗] All non-hidden characters in this mission have +1 Power.'),
  ],
});

// KS-009-MMS: PROTECT THE LEADER
update('KS-009-MMS', {
  basePoints: 2,
  effects: [
    eff('SCORE', '[⧗] Characters with 4 Power or more in this mission have +1 Power.'),
  ],
});

// KS-010-MMS: CHAKRA TRAINING
update('KS-010-MMS', {
  basePoints: 2,
  effects: [
    eff('SCORE', '[⧗] CHAKRA +1 for both players.'),
  ],
});

fs.writeFileSync('lib/data/card-data.json', JSON.stringify(data, null, 4));
console.log('\nJSON saved. Secret + Mythos + Mission cards applied!');
